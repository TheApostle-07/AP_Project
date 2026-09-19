import { getRequestHandoff, publicSummary } from '../../../lib/handoff';
import { clearHandoffCookie, enforceRequestRateLimit } from '../../../lib/security';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Vary', 'Cookie');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ message: 'Method not allowed.' });
  }
  try {
    if (!(await enforceRequestRateLimit(request, 'payment-handoff-status', 60))) return response.status(429).json({ message: 'Please wait a moment. Your payment record is unchanged.' });
    const { handoff } = await getRequestHandoff(request);
    if (!handoff) return response.status(404).json({ message: 'Open payment again from your private booking page.' });
    if (handoff.checkout_status === 'CONFIRMED') clearHandoffCookie(response);
    return response.status(200).json({ checkout: publicSummary(handoff) });
  } catch {
    return response.status(503).json({ message: 'Secure payment is briefly unavailable. Your booking record is unchanged.' });
  }
}
