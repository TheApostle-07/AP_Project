import { query } from './db';
import { HANDOFF_COOKIE, handoffTokenHash, isValidHandoffToken, readCookie } from './security';

const selectHandoff = `
  SELECT h.id AS handoff_id, h.checkout_session_id, h.status AS handoff_status,
         h.return_origin, h.provider_order_id, h.provider_payment_id,
         h.expires_at::text, c.reference, c.status::text AS checkout_status,
         (c.expected_amount_minor + c.fee_minor + c.tax_minor)::text AS amount_minor,
         c.currency, e.name AS experience_name, d.minutes AS duration_minutes,
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
  const creatorImageUrl = row.creator_image_url?.startsWith('/')
    ? `${row.return_origin}${row.creator_image_url}`
    : row.creator_image_url;
  return {
    reference: row.reference,
    creatorName: row.creator_name,
    creatorSlug: row.creator_slug,
    creatorImageUrl,
    experienceName: row.experience_name,
    durationMinutes: Number(row.duration_minutes),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    sessionStart: new Date(row.session_start).toISOString(),
    sessionEnd: new Date(row.session_end).toISOString(),
    timezone: row.fan_timezone,
    status: row.checkout_status,
    expiresAt: new Date(row.expires_at).toISOString(),
    returnUrl: `${row.return_origin}/booking/${row.reference}?checkout=returned`,
  };
}
