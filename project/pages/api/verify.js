import { fulfilRazorpayPayment } from '../../lib/fulfilment';
import { getRequestHandoff } from '../../lib/handoff';
import { fetchOrder, fetchPayment, verifyPaymentSignature } from '../../lib/paymentGateway';
import { enforceTokenRateLimit, handoffTokenHash, requestIsSameOrigin } from '../../lib/security';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ message: 'Method not allowed.' });
  }
  if (!requestIsSameOrigin(request)) return response.status(403).json({ message: 'This request could not be verified.' });
  try {
    const { token, handoff } = await getRequestHandoff(request);
    if (!token || !handoff || !handoff.provider_order_id) return response.status(404).json({ message: 'This payment confirmation is unavailable.' });
    if (!(await enforceTokenRateLimit(handoffTokenHash(token), 'payment-bridge-verify', 12))) {
      return response.status(429).json({ message: 'Your payment is already being checked. Please wait.' });
    }
    const paymentId = request.body?.razorpayPaymentId;
    const orderId = request.body?.razorpayOrderId;
    const signature = request.body?.razorpaySignature;
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '') || !/^order_[A-Za-z0-9]+$/.test(orderId || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) {
      return response.status(400).json({ message: 'Payment confirmation could not be authenticated. Don’t pay again yet.' });
    }
    if (orderId !== handoff.provider_order_id || !verifyPaymentSignature(handoff.provider_order_id, paymentId, signature)) {
      return response.status(400).json({ message: 'Payment confirmation could not be authenticated. Don’t pay again; contact support if money moved.' });
    }
    const [order, payment] = await Promise.all([fetchOrder(handoff.provider_order_id), fetchPayment(paymentId)]);
    const result = await fulfilRazorpayPayment(order, payment);
    return response.status(200).json(result);
  } catch {
    return response.status(503).json({ message: 'We’re checking your payment. Don’t make another payment yet.' });
  }
}
