import { hasDatabase, query } from '../../lib/db';
import { isRazorpayReady, isRazorpayWebhookReady, razorpayMode } from '../../lib/paymentGateway';

let snapshot = null;
let pending = null;

async function databaseReady() {
  if (snapshot && performance.now() < snapshot.until) return snapshot.ready;
  pending ||= (async () => {
    let ready = false;
    if (hasDatabase()) {
      try { await query('SELECT 1 AS ready'); ready = true; } catch { /* Fail closed. */ }
    }
    snapshot = { ready, until: performance.now() + 5000 };
    return ready;
  })().finally(() => { pending = null; });
  return pending;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ status: 'method_not_allowed' });
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  const database = await databaseReady();
  const razorpay = isRazorpayReady();
  const webhook = isRazorpayWebhookReady();
  const ready = database && razorpay && webhook;
  let paymentMode = 'invalid';
  try { paymentMode = razorpayMode(); } catch { /* Health remains safely unavailable. */ }
  return response.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'unavailable',
    paymentMode,
  });
}
