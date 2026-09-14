import Head from 'next/head';

const bookingOrigin = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app';

export default function Privacy() {
  return <><Head><title>Privacy · Alina payments</title></Head><main className="info-page"><article><a className="wordmark" href={bookingOrigin}>ALINA</a><p className="eyebrow">Privacy</p><h1>Payment data stays within the booking flow.</h1><p>This payment origin processes a short-lived checkout capability and the Razorpay transaction identifiers required to confirm a booking. It does not place private booking access in the QR code, public URL, or analytics payload.</p><p>Razorpay processes payment-method information under its own policies. Alina stores the minimum booking, payment, and delivery data needed to provide the session, prevent duplicate charges, support refunds, and meet legal obligations.</p><a className="primary-action" href={`${bookingOrigin}/legal/privacy`}>Read the complete privacy policy</a></article></main></>;
}
