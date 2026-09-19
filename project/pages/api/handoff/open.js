import { getHandoffByToken, publicSummary } from '../../../lib/handoff';
import { query } from '../../../lib/db';
import { clearHandoffCookie, enforceRequestRateLimit, isValidHandoffToken, requestIsSameOrigin, setHandoffCookie } from '../../../lib/security';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Vary', 'Cookie, Origin');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ message: 'Method not allowed.' });
  }
  if (!requestIsSameOrigin(request)) return response.status(403).json({ message: 'This payment handoff could not be verified.' });
  const token = request.body?.token;
  if (!isValidHandoffToken(token)) return response.status(404).json({ message: 'This payment link is invalid or has expired.' });
  try {
    if (!(await enforceRequestRateLimit(request, 'payment-handoff-open', 20))) return response.status(429).json({ message: 'Please wait a minute before reopening payment. Nothing was charged.' });
    const handoff = await getHandoffByToken(token);
    if (!handoff) return response.status(404).json({ message: 'This payment link is invalid or has expired.' });
    if (!['PAYMENT_PROCESSING', 'CONFIRMED'].includes(handoff.checkout_status)) {
      return response.status(409).json({ message: 'This checkout is no longer payable.' });
    }
    await query(
      `UPDATE payment_handoffs
       SET status = CASE WHEN status = 'CREATED' THEN 'OPENED' ELSE status END,
           opened_at = COALESCE(opened_at, now()), updated_at = now()
       WHERE id = $1::uuid AND expires_at > now()`,
      [handoff.handoff_id],
    );
    if (handoff.checkout_status === 'CONFIRMED') clearHandoffCookie(response);
    else setHandoffCookie(response, token, handoff.expires_at);
    return response.status(200).json({ checkout: publicSummary(handoff) });
  } catch {
    return response.status(503).json({ message: 'Secure payment is briefly unavailable. Your booking record is unchanged.' });
  }
}
