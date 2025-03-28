// lib/paymentGateway.js

import Razorpay from 'razorpay';
import crypto from 'crypto';

// Create an instance of Razorpay with your key and secret.
// Ensure you have set RAZORPAY_KEY and RAZORPAY_SECRET in your environment variables.
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

/**
 * Creates a new order with Razorpay.
 *
 * @param {number} amount - The amount in paise (e.g., ₹9 => 900).
 * @param {string} [currency='INR'] - The currency code.
 * @param {string} [receipt] - Optional receipt identifier.
 * @returns {Promise<Object>} The Razorpay order object.
 */
export async function createOrder(amount, currency = 'INR', receipt = null) {
  const options = {
    amount, // Amount in paise
    currency,
    receipt: receipt || `receipt_${Date.now()}`,
    payment_capture: 1, // Auto-capture the payment
  };

  try {
    const order = await razorpayInstance.orders.create(options);
    return order;
  } catch (error) {
    throw new Error(`Razorpay order creation failed: ${error.message}`);
  }
}

/**
 * Verifies the payment signature returned by Razorpay.
 *
 * @param {Object} paymentData - An object containing razorpay_order_id, razorpay_payment_id, and razorpay_signature.
 * @param {string} [secret=process.env.RAZORPAY_SECRET] - The Razorpay secret key.
 * @returns {boolean} True if the signature is valid; false otherwise.
 */
export function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, secret = process.env.RAZORPAY_SECRET) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === razorpay_signature;
}