import Head from 'next/head';

const bookingOrigin = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app';

export default function AboutUs() {
  return <><Head><title>About · Alina payments</title></Head><main className="info-page"><article><a className="wordmark" href={bookingOrigin}>ALINA</a><p className="eyebrow">About this service</p><h1>Protected payments for private creator sessions.</h1><p>This origin is dedicated to completing bookings started on Alina. It receives a short-lived checkout handoff, creates the Razorpay order from the server-held booking total, verifies the payment, and returns the fan to their private booking.</p><p>It does not sell a separate product and it does not accept prices or booking status from URL parameters.</p><a className="primary-action" href={bookingOrigin}>Visit Alina</a></article></main></>;
}
