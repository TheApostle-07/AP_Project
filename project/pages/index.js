import Head from 'next/head';

const bookingOrigin = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app';

export default function PaymentEntry() {
  return (
    <>
      <Head><title>Alina secure payment</title><meta name="robots" content="noindex,nofollow" /></Head>
      <main className="payment-page"><div className="payment-shell"><a className="wordmark" href={bookingOrigin}>ALINA</a><section className="payment-card error-card"><p className="eyebrow">Protected payment service</p><h1>Start from a creator’s booking page.</h1><p>This site opens only from a short-lived, server-created booking. A reference or amount in a URL can never create a payment.</p><a className="primary-action" href={bookingOrigin}>Explore creators</a></section></div></main>
    </>
  );
}
