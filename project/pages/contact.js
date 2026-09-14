import Head from 'next/head';

const bookingOrigin = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app';

export default function Contact() {
  return <><Head><title>Support · Alina payments</title></Head><main className="info-page"><article><a className="wordmark" href={bookingOrigin}>ALINA</a><p className="eyebrow">Booking support</p><h1>Get help with a payment or session.</h1><p>Open support from the booking whenever possible so the private reference and payment context stay attached. For general help, email <a href="mailto:alinapopovabusiness@gmail.com">alinapopovabusiness@gmail.com</a>.</p><a className="primary-action" href={`${bookingOrigin}/help`}>Open help</a></article></main></>;
}
