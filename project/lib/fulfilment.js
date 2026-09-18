import { query } from './db';
import { bookingReturnUrl } from './handoff';
import { normalizedEmail } from './security';

async function checkoutForOrder(orderId) {
  const rows = await query(
    `SELECT c.id, c.reference, c.expected_amount_minor, c.fee_minor, c.tax_minor, c.currency,
            c.status::text, h.return_origin
     FROM checkout_sessions c
     JOIN payment_handoffs h ON h.checkout_session_id = c.id
     WHERE c.provider = 'RAZORPAY'
       AND c.provider_session_id = $1
       AND h.provider_order_id = $1
     LIMIT 1`,
    [orderId],
  );
  return rows[0] || null;
}

async function markReconciliation(checkout, payment, rawState, code) {
  await query(
    `WITH updated AS (
       UPDATE checkout_sessions
       SET status = 'RECONCILIATION_REQUIRED', provider_payment_id = $2, last_error_code = $3, updated_at = now()
       WHERE id = $1::uuid AND status <> 'CONFIRMED' RETURNING *
     ), recorded AS (
       INSERT INTO payments (
         booking_id, checkout_session_id, provider, provider_payment_id, idempotency_key,
         amount_minor, currency, status, raw_state
       )
       SELECT NULL, id, 'RAZORPAY', $2, 'checkout:' || id::text,
              $4::bigint, $6, 'SUCCEEDED', $5::jsonb
       FROM updated
       ON CONFLICT (idempotency_key) DO UPDATE SET
         provider_payment_id = EXCLUDED.provider_payment_id, status = 'SUCCEEDED',
         amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency,
         raw_state = EXCLUDED.raw_state, updated_at = now()
     )
     UPDATE payment_handoffs
     SET status = 'VERIFIED', provider_payment_id = $2, provider_verified_at = COALESCE(provider_verified_at, now()),
         last_error_code = $3, updated_at = now()
     WHERE checkout_session_id = $1::uuid`,
    [checkout.id, payment?.id || null, code, Number(payment?.amount ?? checkout.expected_amount_minor), JSON.stringify({ ...rawState, reconciliation: code }), String(payment.currency).toUpperCase()],
  );
}

export async function fulfilRazorpayPayment(order, payment) {
  const checkout = await checkoutForOrder(order.id);
  if (!checkout) throw new Error('CHECKOUT_NOT_FOUND');
  const returnUrl = bookingReturnUrl(checkout);
  if (payment.order_id !== order.id || payment.status !== 'captured' || !payment.captured || order.status !== 'paid') {
    return { reference: checkout.reference, state: 'PROCESSING', returnUrl };
  }

  const amountMinor = Number(payment.amount);
  const expectedAmount = Number(checkout.expected_amount_minor) + Number(checkout.fee_minor) + Number(checkout.tax_minor);
  const rawState = {
    orderId: order.id,
    orderStatus: order.status,
    paymentId: payment.id,
    paymentStatus: payment.status,
    method: payment.method || null,
  };
  const [capture] = await query(
    `SELECT record_checkout_capture($1::uuid,'RAZORPAY',$2,$3,$4::bigint,$5,$6) AS disposition`,
    [checkout.id,payment.id,order.id,amountMinor,String(payment.currency).toUpperCase(),order.receipt],
  );
  if (capture?.disposition !== 'PRIMARY') {
    if (capture?.disposition === 'DETAILS_MISMATCH' && checkout.status !== 'CONFIRMED') {
      await markReconciliation(checkout, payment, rawState, 'PAYMENT_DETAILS_MISMATCH');
    }
    return { reference: checkout.reference, state: checkout.status === 'CONFIRMED' ? 'CONFIRMED' : 'RECONCILIATION_REQUIRED', returnUrl };
  }
  if (checkout.status === 'CONFIRMED') return { reference: checkout.reference, state: 'CONFIRMED', returnUrl };
  if (amountMinor !== expectedAmount || String(payment.currency).toUpperCase() !== checkout.currency || order.receipt !== checkout.reference) {
    await markReconciliation(checkout, payment, rawState, 'PAYMENT_DETAILS_MISMATCH');
    return { reference: checkout.reference, state: 'RECONCILIATION_REQUIRED', returnUrl };
  }

  const contactEmail = normalizedEmail(payment.email);
  try {
    const rows = await query(
      `WITH selected_checkout AS (
         SELECT c.* FROM checkout_sessions c
         WHERE c.id = $1::uuid AND c.status IN ('PAYMENT_PROCESSING', 'PAID', 'RECONCILIATION_REQUIRED', 'EXPIRED')
         FOR UPDATE
       ), identified_checkout AS (
         SELECT c.id, c.reference, c.reference_lookup_hash, c.reservation_id,
             c.influencer_id, c.experience_id, c.duration_id, c.fan_id, c.fan_name, c.fan_note,
             c.expected_amount_minor, c.fee_minor, c.tax_minor, c.currency, c.fan_timezone,
             c.idempotency_key, c.access_token_hash, c.terms_version, c.privacy_version,
             c.booking_policy_version, c.legal_accepted_at, c.status, c.last_error_code,
             COALESCE(c.fan_email, $3) AS fan_email,
             CASE
               WHEN c.contact_status = 'VERIFIED' THEN 'VERIFIED'
               WHEN COALESCE(c.fan_email, $3) IS NOT NULL THEN 'PROVIDER_SUPPLIED'
               ELSE 'MISSING'
             END AS contact_status
         FROM selected_checkout c
       ), linked_fan AS (
         INSERT INTO users (email, display_name, role, status, email_verified_at)
         SELECT fan_email, 'Fan', 'FAN', 'ACTIVE', NULL
         FROM identified_checkout WHERE fan_email IS NOT NULL
         ON CONFLICT (email) DO UPDATE SET updated_at = users.updated_at
         RETURNING id, email, role
       ), eligible_fan AS (
         SELECT id FROM linked_fan WHERE role = 'FAN'
       ), secured_slot AS (
         UPDATE schedule_reservations r
         SET state = 'BOOKED', expires_at = NULL, updated_at = now()
         FROM identified_checkout c
          WHERE r.id = c.reservation_id
           AND r.session_end > now()
           AND (r.state IN ('HELD', 'PAYMENT_PROCESSING', 'EXPIRED')
             OR (r.state = 'RELEASED' AND c.last_error_code IN ('CHECKOUT_WINDOW_EXPIRED', 'CHECKOUT_EXPIRED')))
           AND EXISTS (
             SELECT 1 FROM influencer_profiles profile JOIN users creator_user ON creator_user.id = profile.user_id
             WHERE profile.id = c.influencer_id AND profile.creator_status IN ('ACTIVE','PAUSED')
               AND profile.archived_at IS NULL AND creator_user.status = 'ACTIVE'
           )
           AND NOT EXISTS (
             SELECT 1 FROM blocked_relationships relationship
             WHERE relationship.influencer_id = c.influencer_id
               AND relationship.fan_id = COALESCE(c.fan_id, (SELECT id FROM eligible_fan LIMIT 1))
               AND relationship.active = true
           )
         RETURNING r.*
       ), created_booking AS (
         INSERT INTO bookings (
           reference, reference_lookup_hash, reservation_id, checkout_session_id, influencer_id, fan_id, fan_name, fan_email, fan_note,
           experience_id, experience_name_snapshot, duration_minutes_snapshot,
           price_minor_snapshot, fee_minor_snapshot, tax_minor_snapshot, currency, policy_snapshot, session_start, session_end,
           influencer_timezone_snapshot, fan_timezone_snapshot, status, payment_status,
           idempotency_key, management_token_hash, charged, contact_status,
           terms_version, privacy_version, booking_policy_version, legal_accepted_at
         )
         SELECT c.reference, c.reference_lookup_hash, r.id, c.id, c.influencer_id,
                COALESCE(c.fan_id, (SELECT id FROM eligible_fan LIMIT 1)),
                COALESCE(c.fan_name, 'Guest'), c.fan_email, c.fan_note, c.experience_id, e.name,
                (EXTRACT(EPOCH FROM (r.session_end - r.session_start)) / 60)::int,
                c.expected_amount_minor, c.fee_minor, c.tax_minor, c.currency, e.cancellation_policy,
                r.session_start, r.session_end, p.timezone, c.fan_timezone,
                'CONFIRMED', 'SUCCEEDED', c.idempotency_key, c.access_token_hash, true, c.contact_status,
                c.terms_version, c.privacy_version, c.booking_policy_version, c.legal_accepted_at
         FROM identified_checkout c
         JOIN secured_slot r ON r.id = c.reservation_id
         JOIN experiences e ON e.id = c.experience_id
         JOIN experience_durations d ON d.id = c.duration_id
         JOIN influencer_profiles p ON p.id = c.influencer_id
         ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = bookings.updated_at
         RETURNING *
       ), recorded_payment AS (
         INSERT INTO payments (
           booking_id, checkout_session_id, provider, provider_payment_id, idempotency_key,
           amount_minor, currency, status, raw_state
         )
         SELECT b.id, c.id, 'RAZORPAY', $2, 'checkout:' || c.id::text,
                c.expected_amount_minor + c.fee_minor + c.tax_minor, c.currency, 'SUCCEEDED', $4::jsonb
         FROM created_booking b JOIN identified_checkout c ON c.id = b.checkout_session_id
         ON CONFLICT (idempotency_key) DO UPDATE SET
           booking_id = EXCLUDED.booking_id, provider_payment_id = EXCLUDED.provider_payment_id,
           amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency,
           status = 'SUCCEEDED', raw_state = EXCLUDED.raw_state, updated_at = now()
         RETURNING *
       ), booking_consents AS (
         INSERT INTO consent_records (
           submission_id, subject_type, subject_id, consent_type, version, text_snapshot,
           text_hash, accepted, accepted_at, source
         )
         SELECT b.id, 'BOOKING', b.id, consent.consent_type, consent.version,
                document.text_snapshot, document.text_hash, true,
                COALESCE(b.legal_accepted_at, b.created_at), 'PAYMENT_CTA'
         FROM created_booking b
         CROSS JOIN LATERAL (VALUES
           ('TERMS', b.terms_version), ('PRIVACY', b.privacy_version), ('BOOKING_POLICY', b.booking_policy_version)
         ) AS consent(consent_type, version)
         JOIN legal_document_versions document
           ON document.document_key = consent.consent_type AND document.version = consent.version
         WHERE consent.version IS NOT NULL
         ON CONFLICT (submission_id, consent_type) DO NOTHING
       ), completed_checkout AS (
         UPDATE checkout_sessions c SET status = 'CONFIRMED', provider_payment_id = $2,
           fan_email = identified.fan_email, contact_status = identified.contact_status,
           last_error_code = NULL, updated_at = now()
         FROM created_booking b JOIN identified_checkout identified ON identified.id = b.checkout_session_id
         WHERE c.id = b.checkout_session_id
       ), completed_handoff AS (
         UPDATE payment_handoffs h
         SET status = 'CONSUMED', provider_payment_id = $2, provider_verified_at = COALESCE(h.provider_verified_at, now()),
             consumed_at = COALESCE(h.consumed_at, now()), last_error_code = NULL, updated_at = now()
         FROM created_booking b WHERE h.checkout_session_id = b.checkout_session_id
       ), meeting AS (
         INSERT INTO meetings (booking_id, provider, status)
         SELECT id, 'PENDING_CONFIGURATION', 'PENDING' FROM created_booking
         ON CONFLICT (booking_id) DO NOTHING
       ), history AS (
         INSERT INTO booking_status_history (booking_id, from_status, to_status, reason)
         SELECT id, 'PAYMENT_PROCESSING', 'CONFIRMED', 'Razorpay-confirmed payment' FROM created_booking
       ), ledger AS (
         INSERT INTO financial_ledger_entries (
           booking_id, payment_id, influencer_id, entry_type, amount_minor, currency, idempotency_key, available_at
         )
         SELECT b.id, pay.id, b.influencer_id, entries.entry_type, entries.amount_minor, b.currency,
                entries.idempotency_key, CASE WHEN entries.entry_type = 'CREATOR_EARNING' THEN b.session_end + interval '24 hours' ELSE now() END
         FROM created_booking b JOIN recorded_payment pay ON pay.booking_id = b.id
         CROSS JOIN LATERAL (VALUES
           ('CHARGE', b.price_minor_snapshot + b.fee_minor_snapshot + b.tax_minor_snapshot, 'charge:' || pay.id::text),
           ('TAX', b.tax_minor_snapshot, 'tax:' || pay.id::text),
           ('PLATFORM_FEE', b.fee_minor_snapshot, 'fee:' || pay.id::text),
           ('CREATOR_EARNING', b.price_minor_snapshot, 'earning:' || pay.id::text)
         ) AS entries(entry_type, amount_minor, idempotency_key)
         WHERE entries.amount_minor <> 0
         ON CONFLICT (idempotency_key) DO NOTHING
       ), jobs AS (
         INSERT INTO fulfilment_jobs (booking_id, job_type, run_at, deduplication_key)
         SELECT b.id, spec.job_type, spec.run_at, b.id::text || ':' || spec.job_type
         FROM created_booking b
         CROSS JOIN LATERAL (VALUES
           ('CREATE_MEETING', now()),
           ('FAN_CONFIRMATION', now()),
           ('CREATOR_NOTIFICATION', now()),
           ('REMINDER_24H', b.session_start - interval '24 hours'),
           ('REMINDER_1H', b.session_start - interval '1 hour'),
           ('REMINDER_10M', b.session_start - interval '10 minutes'),
           ('PRE_SESSION_CHECK', b.session_start - interval '15 minutes'),
           ('ANALYTICS', now())
         ) AS spec(job_type, run_at)
         WHERE (spec.run_at > now() OR spec.job_type IN ('CREATE_MEETING', 'FAN_CONFIRMATION', 'CREATOR_NOTIFICATION', 'ANALYTICS'))
           AND (b.contact_status <> 'MISSING' OR spec.job_type NOT IN ('FAN_CONFIRMATION', 'REMINDER_24H', 'REMINDER_1H', 'REMINDER_10M'))
         ON CONFLICT (deduplication_key) DO NOTHING
       ), audit AS (
         INSERT INTO audit_logs (action, target_type, target_id, new_value, request_id)
         SELECT 'BOOKING_CONFIRMED', 'booking', id::text,
                jsonb_build_object('paymentStatus', payment_status, 'charged', charged, 'contactStatus', contact_status), $2 FROM created_booking
       )
       SELECT reference FROM created_booking`,
      [checkout.id, payment.id, contactEmail, JSON.stringify(rawState)],
    );
    if (!rows[0]) {
      const current = await query(`SELECT status::text FROM checkout_sessions WHERE id = $1::uuid LIMIT 1`, [checkout.id]);
      if (current[0]?.status === 'CONFIRMED') return { reference: checkout.reference, state: 'CONFIRMED', returnUrl };
      await markReconciliation(checkout, payment, rawState, 'SLOT_COULD_NOT_BE_CONFIRMED');
      return { reference: checkout.reference, state: 'RECONCILIATION_REQUIRED', returnUrl };
    }
    return { reference: checkout.reference, state: 'CONFIRMED', returnUrl };
  } catch (error) {
    const current = await query(`SELECT status::text FROM checkout_sessions WHERE id = $1::uuid LIMIT 1`, [checkout.id]).catch(() => []);
    if (current[0]?.status === 'CONFIRMED') return { reference: checkout.reference, state: 'CONFIRMED', returnUrl };
    await markReconciliation(checkout, payment, rawState, error?.code === '23P01' ? 'SLOT_ALREADY_BOOKED' : 'BOOKING_WRITE_FAILED');
    return { reference: checkout.reference, state: 'RECONCILIATION_REQUIRED', returnUrl };
  }
}
