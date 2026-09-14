import { getRequestHandoff, publicSummary } from '../../lib/handoff';
import { query } from '../../lib/db';
import { createOrder, fetchOrder, publicKey } from '../../lib/paymentGateway';
import { enforceTokenRateLimit, handoffTokenHash, requestIsSameOrigin } from '../../lib/security';

function checkoutPayload(order, handoff) {
  return {
    keyId: publicKey(),
    orderId: order.id,
    amountMinor: Number(order.amount),
    currency: order.currency,
    description: `${handoff.duration_minutes}-minute ${handoff.experience_name} with ${handoff.creator_name}`,
  };
}

function assertOrderMatches(order, handoff) {
  if (Number(order.amount) !== Number(handoff.amount_minor) || order.currency !== handoff.currency || order.receipt !== handoff.reference) {
    throw new Error('PROVIDER_ORDER_MISMATCH');
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ message: 'Method not allowed.' });
  }
  if (!requestIsSameOrigin(request)) return response.status(403).json({ message: 'This request could not be verified.' });
  try {
    const { token, handoff } = await getRequestHandoff(request);
    if (!token || !handoff) return response.status(404).json({ message: 'Open payment again from your private booking page.' });
    if (!(await enforceTokenRateLimit(handoffTokenHash(token), 'payment-bridge-order', 8))) {
      return response.status(429).json({ message: 'Secure payment is already opening. Please wait a moment.' });
    }
    if (handoff.checkout_status === 'CONFIRMED') {
      return response.status(200).json({ state: 'CONFIRMED', checkout: publicSummary(handoff) });
    }
    if (handoff.checkout_status !== 'PAYMENT_PROCESSING') {
      return response.status(409).json({ message: 'This checkout is no longer payable.' });
    }
    if (handoff.provider_order_id) {
      const order = await fetchOrder(handoff.provider_order_id);
      assertOrderMatches(order, handoff);
      return response.status(200).json({ state: 'READY', checkout: checkoutPayload(order, handoff) });
    }

    const marker = `CREATING:${handoff.handoff_id}`;
    const claimed = await query(
      `UPDATE checkout_sessions c
       SET provider_session_id = $2, updated_at = now()
       FROM payment_handoffs h
       WHERE c.id = h.checkout_session_id AND h.id = $1::uuid
         AND c.status = 'PAYMENT_PROCESSING'
         AND (c.provider_session_id IS NULL OR (c.provider_session_id LIKE 'CREATING:%' AND c.updated_at < now() - interval '45 seconds'))
       RETURNING c.id`,
      [handoff.handoff_id, marker],
    );
    if (!claimed[0]) return response.status(409).json({ message: 'Secure payment is already opening. Please wait a moment.' });

    let order;
    try {
      order = await createOrder({
        amount: Number(handoff.amount_minor), currency: handoff.currency, reference: handoff.reference,
        description: `${handoff.duration_minutes}-minute ${handoff.experience_name} with ${handoff.creator_name}`,
      });
      assertOrderMatches(order, handoff);
      const stored = await query(
        `WITH updated_checkout AS (
           UPDATE checkout_sessions SET provider_session_id = $3, updated_at = now()
           WHERE id = $1::uuid AND provider_session_id = $2 AND status = 'PAYMENT_PROCESSING'
           RETURNING id
         )
         UPDATE payment_handoffs h SET provider_order_id = $3, updated_at = now()
         FROM updated_checkout c WHERE h.checkout_session_id = c.id
         RETURNING h.id`,
        [handoff.checkout_session_id, marker, order.id],
      );
      if (!stored[0]) throw new Error('PROVIDER_ORDER_NOT_STORED');
    } catch (error) {
      await query(
        `UPDATE checkout_sessions SET provider_session_id = NULL, updated_at = now()
         WHERE id = $1::uuid AND provider_session_id = $2`,
        [handoff.checkout_session_id, marker],
      ).catch(() => undefined);
      throw error;
    }

    await query(
      `INSERT INTO payments (
         booking_id, checkout_session_id, provider, provider_payment_id, idempotency_key,
         amount_minor, currency, status, raw_state
       ) VALUES (NULL, $1::uuid, 'RAZORPAY', NULL, 'checkout:' || $1::text, $2, $3, 'INITIATED', $4::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [handoff.checkout_session_id, Number(handoff.amount_minor), handoff.currency, JSON.stringify({ orderId: order.id, source: 'approved-payment-origin' })],
    );
    return response.status(201).json({ state: 'READY', checkout: checkoutPayload(order, handoff) });
  } catch (error) {
    if (error instanceof Error && error.message === 'RAZORPAY_CREDENTIALS_REQUIRED') {
      return response.status(503).json({ message: 'Razorpay is not configured on this payment service. Nothing was charged.' });
    }
    return response.status(503).json({ message: 'Secure payment could not start. Nothing new was charged; your booking record is unchanged.' });
  }
}
