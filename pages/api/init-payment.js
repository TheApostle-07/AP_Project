// pages/api/init-payment.js (on your backend)
import { createOrder } from '../../lib/paymentGateway';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }
  
  try {
    const { amount } = req.body; // amount in paise
    const order = await createOrder(amount);
    res.status(200).json({ order });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Order creation failed' });
  }
}