import { query } from './db';
import { HANDOFF_COOKIE, handoffTokenHash, isValidHandoffToken, readCookie } from './security';

const DEFAULT_BOOKING_ORIGIN = 'https://alina-popova-im.vercel.app';

function trustedBookingOrigin() {
  const configured = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || DEFAULT_BOOKING_ORIGIN;
  const url = new URL(configured);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local)) {
    throw new Error('INVALID_BOOKING_ORIGIN');
  }
  return url.origin;
}

export function bookingReturnUrl(row) {
  const bookingOrigin = trustedBookingOrigin();
  if (new URL(row.return_origin).origin !== bookingOrigin) throw new Error('UNTRUSTED_RETURN_ORIGIN');
  return `${bookingOrigin}/booking/${row.reference}?checkout=returned`;
}

const selectHandoff = `
  SELECT h.id AS handoff_id, h.checkout_session_id, h.status AS handoff_status,
         h.return_origin, h.provider_order_id, h.provider_payment_id,
         h.expires_at::text, c.reference, c.status::text AS checkout_status,
         (c.expected_amount_minor + c.fee_minor + c.tax_minor)::text AS amount_minor,
         c.currency, e.name AS experience_name,
         (EXTRACT(EPOCH FROM (r.session_end - r.session_start)) / 60)::int AS duration_minutes,
         p.display_name AS creator_name, p.slug AS creator_slug, p.profile_image_url AS creator_image_url,
         r.session_start::text, r.session_end::text, c.fan_timezone
  FROM payment_handoffs h
  JOIN checkout_sessions c ON c.id = h.checkout_session_id
  JOIN experiences e ON e.id = c.experience_id
  JOIN experience_durations d ON d.id = c.duration_id
  JOIN influencer_profiles p ON p.id = c.influencer_id
  JOIN schedule_reservations r ON r.id = c.reservation_id`;

export async function getHandoffByToken(token, { includeExpired = false } = {}) {
  if (!isValidHandoffToken(token)) return null;
  const rows = await query(
    `${selectHandoff}
     WHERE h.token_hash = $1
       ${includeExpired ? '' : "AND h.expires_at > now() AND h.status IN ('CREATED', 'OPENED', 'VERIFIED', 'CONSUMED')"}
     LIMIT 1`,
    [handoffTokenHash(token)],
  );
  return rows[0] || null;
}

export async function getRequestHandoff(request, options) {
  const token = readCookie(request, HANDOFF_COOKIE);
  if (!token) return { token: null, handoff: null };
  return { token, handoff: await getHandoffByToken(token, options) };
}

export function publicSummary(row) {
  const bookingOrigin = trustedBookingOrigin();
  if (new URL(row.return_origin).origin !== bookingOrigin) throw new Error('UNTRUSTED_RETURN_ORIGIN');
  return {
    reference: row.reference,
    creatorName: row.creator_name,
    creatorSlug: row.creator_slug,
    // Do not make the dedicated payment origin fetch creator media. This
    // avoids disclosing a checkout visitor's network address to media hosts.
    creatorImageUrl: null,
    experienceName: row.experience_name,
    durationMinutes: Number(row.duration_minutes),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    sessionStart: new Date(row.session_start).toISOString(),
    sessionEnd: new Date(row.session_end).toISOString(),
    timezone: row.fan_timezone,
    status: row.checkout_status,
    expiresAt: new Date(row.expires_at).toISOString(),
    returnUrl: bookingReturnUrl(row),
  };
}
