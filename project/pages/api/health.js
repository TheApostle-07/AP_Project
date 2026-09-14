import { hasDatabase, query } from '../../lib/db';
import { isRazorpayReady } from '../../lib/paymentGateway';

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ status: 'method_not_allowed' });
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  let database = false;
  if (hasDatabase()) {
    try { await query('SELECT 1 AS ready'); database = true; } catch { database = false; }
  }
  const razorpay = isRazorpayReady();
  const webhook = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim());
  const ready = database && razorpay && webhook;
  return response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
}
