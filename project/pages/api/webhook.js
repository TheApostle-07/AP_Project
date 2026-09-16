import crypto from 'node:crypto';
import { query } from '../../lib/db';
import { fulfilRazorpayPayment } from '../../lib/fulfilment';
import { fetchOrder, fetchOrderPayments, fetchPayment, verifyWebhookSignature } from '../../lib/paymentGateway';
import { artworkService } from '../../lib/artwork-server';
import { ArtworkError } from '../../lib/artwork-orders.mjs';

export const config = { api: { bodyParser: false } };

async function rawRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function orderIdFromEvent(event) {
  return event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ message: 'Method not allowed.' });
  }
  const body = await rawRequestBody(request);
  const signature = String(request.headers['x-razorpay-signature'] || '');
  try {
    if (!signature || !verifyWebhookSignature(body, signature)) return response.status(400).json({ message: 'Invalid signature.' });
  } catch {
    return response.status(503).json({ message: 'Webhook is not configured.' });
  }
  let event;
  try { event = JSON.parse(body); } catch { return response.status(400).json({ message: 'Invalid event.' }); }
  if (typeof event?.event !== 'string') return response.status(400).json({ message: 'Invalid event.' });
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const eventId = String(request.headers['x-razorpay-event-id'] || `body-${bodyHash}`).slice(0, 200);
  const accepted = await query(
    `INSERT INTO webhook_events (provider, provider_event_id, event_type, payload_hash, processing_state, provider_created_at)
     VALUES ('RAZORPAY', $1, $2, $3, 'PROCESSING', to_timestamp($4))
     ON CONFLICT (provider, provider_event_id) DO UPDATE SET
       processing_state = 'PROCESSING', retry_count = webhook_events.retry_count + 1, last_error_code = NULL
     WHERE webhook_events.processing_state = 'FAILED'
        OR (webhook_events.processing_state = 'PROCESSING' AND webhook_events.received_at < now() - interval '10 minutes')
     RETURNING id`,
    [eventId, event.event.slice(0, 100), bodyHash, Number(event.created_at || Math.floor(Date.now() / 1000))],
  );
  if (!accepted[0]) return response.status(200).json({ received: true, duplicate: true });

  try {
    const orderId = orderIdFromEvent(event);
    if (['payment.captured', 'order.paid'].includes(event.event) && orderId) {
      const [order, payments] = await Promise.all([fetchOrder(orderId), fetchOrderPayments(orderId)]);
      if (String(order.receipt).startsWith('ART-')) {
        // A delayed capture notification may arrive after a refund. Reconcile all
        // settled payments rather than reviving access from the stale event payload.
        const settled = payments.filter((item) => (item.status === 'captured' && item.captured) || item.status === 'refunded' || Number(item.amount_refunded) > 0);
        if (!settled.length) throw new Error('CAPTURED_PAYMENT_NOT_FOUND');
        for (const payment of settled) await artworkService.fulfil(order, payment);
      } else {
        const payment = payments.find((item) => item.status === 'captured' && item.captured);
        if (!payment) throw new Error('CAPTURED_PAYMENT_NOT_FOUND');
        await fulfilRazorpayPayment(order, payment);
      }
    }
    if (event.event === 'refund.processed') {
      const paymentId = event?.payload?.refund?.entity?.payment_id;
      if (/^pay_[A-Za-z0-9]+$/.test(paymentId || '')) {
        const payment = await fetchPayment(paymentId);
        const order = await fetchOrder(payment.order_id);
        if (String(order.receipt).startsWith('ART-')) await artworkService.fulfil(order, payment);
      }
    }
    await query(
      `UPDATE webhook_events SET processing_state = 'PROCESSED', processed_at = now(), last_error_code = NULL
       WHERE provider = 'RAZORPAY' AND provider_event_id = $1`,
      [eventId],
    );
    return response.status(200).json({ received: true });
  } catch (error) {
    if ((error instanceof Error && error.message === 'CHECKOUT_NOT_FOUND') || (error instanceof ArtworkError && error.status === 404)) {
      await query(
        `UPDATE webhook_events SET processing_state = 'PROCESSED', processed_at = now(), last_error_code = 'UNRELATED_ORDER'
         WHERE provider = 'RAZORPAY' AND provider_event_id = $1`,
        [eventId],
      );
      return response.status(200).json({ received: true, ignored: true });
    }
    const code = error instanceof Error ? error.message.slice(0, 100) : 'WEBHOOK_PROCESSING_FAILED';
    await query(
      `UPDATE webhook_events SET processing_state = 'FAILED', retry_count = retry_count + 1, last_error_code = $2
       WHERE provider = 'RAZORPAY' AND provider_event_id = $1`,
      [eventId, code],
    ).catch(() => undefined);
    return response.status(500).json({ message: 'Webhook processing will be retried.' });
  }
}
