// lib/paymentGateway.js

import crypto from 'node:crypto';
import { safeEqualHex } from './security';

const RAZORPAY_MODES = new Set(['test', 'live']);

export function razorpayMode() {
  const configuredMode = (process.env.RAZORPAY_MODE || '').trim().toLowerCase();
  if (configuredMode) {
    if (!RAZORPAY_MODES.has(configuredMode)) throw new Error('RAZORPAY_MODE_INVALID');
    return configuredMode;
  }

  const hasTestKeyId = Boolean(process.env.RAZORPAY_TEST_KEY_ID?.trim());
  const hasTestKeySecret = Boolean(process.env.RAZORPAY_TEST_KEY_SECRET?.trim());
  if (hasTestKeyId || hasTestKeySecret) {
    if (!hasTestKeyId || !hasTestKeySecret) throw new Error('RAZORPAY_TEST_CREDENTIALS_INCOMPLETE');
    return 'test';
  }

  return 'live';
}

function credentials() {
  const mode = razorpayMode();
  const keyId = ((mode === 'test' ? process.env.RAZORPAY_TEST_KEY_ID : process.env.RAZORPAY_KEY_ID) || '').trim();
  const keySecret = ((mode === 'test' ? process.env.RAZORPAY_TEST_KEY_SECRET : process.env.RAZORPAY_KEY_SECRET) || '').trim();
  if (!keyId || !keySecret) throw new Error('RAZORPAY_CREDENTIALS_REQUIRED');
  if (!keyId.startsWith(`rzp_${mode}_`)) throw new Error('RAZORPAY_KEY_MODE_MISMATCH');
  return { keyId, keySecret, mode };
}

export function publicKey() {
  return credentials().keyId;
}

export function isRazorpayReady() {
  try { credentials(); return true; } catch { return false; }
}

export function isRazorpayWebhookReady() {
  try { return Boolean(webhookSecret()); } catch { return false; }
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`RAZORPAY_API_${response.status}`);
  return response.json();
}

export async function createOrder({ amount, currency, reference }) {
  return razorpayRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount, currency, receipt: reference, notes: { booking_reference: reference } }),
  });
}

export async function fetchOrder(orderId) {
  return razorpayRequest(`/orders/${encodeURIComponent(orderId)}`);
}

export async function fetchPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function fetchOrderPayments(orderId) {
  const collection = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
  return collection.items || [];
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
  const { keySecret } = credentials();
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = webhookSecret();
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

function webhookSecret() {
  const mode = razorpayMode();
  const secret = (mode === 'test' ? process.env.RAZORPAY_TEST_WEBHOOK_SECRET : undefined)?.trim()
    || process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET_REQUIRED');
  return secret;
}
