import Head from 'next/head';
import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';

const bookingOrigin = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app';

function money(amountMinor, currency) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function dateLabel(value, timezone) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(new Date(value));
}

function timeLabel(value, timezone) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(value));
}

export default function PaymentPage() {
  const [checkout, setCheckout] = useState(null);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('Opening your protected checkout…');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    async function openHandoff() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const token = fragment.get('handoff');
      if (window.location.hash) window.history.replaceState(null, '', '/pay');
      try {
        const response = await fetch(token ? '/api/handoff/open' : '/api/handoff/status', {
          method: token ? 'POST' : 'GET',
          headers: token ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' },
          body: token ? JSON.stringify({ token }) : undefined,
        });
        const result = await response.json();
        if (!response.ok || !result.checkout) throw new Error(result.message || 'This payment link is unavailable.');
        if (!active) return;
        if (result.checkout.status === 'CONFIRMED') {
          window.location.replace(result.checkout.returnUrl);
          return;
        }
        setCheckout(result.checkout);
        setState('ready');
        setMessage('');
      } catch (error) {
        if (!active) return;
        setState('error');
        setMessage(error instanceof Error ? error.message : 'This payment link is unavailable.');
      }
    }
    void openHandoff();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!checkout || state !== 'ready') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [checkout, state]);

  const secondsRemaining = useMemo(() => checkout ? Math.max(0, Math.ceil((new Date(checkout.expiresAt).getTime() - now) / 1000)) : 0, [checkout, now]);
  const countdown = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (state === 'ready' && checkout && secondsRemaining === 0) {
      setState('error');
      setMessage('This protected checkout expired. Return to the creator page to choose an available time.');
    }
  }, [checkout, secondsRemaining, state]);

  useEffect(() => {
    if (!checkout || state !== 'verifying') return;
    let active = true;
    let attempts = 0;
    let timer;
    async function checkAuthoritativeStatus() {
      attempts += 1;
      try {
        const response = await fetch('/api/handoff/status', { headers: { Accept: 'application/json' } });
        const result = await response.json();
        if (!active) return;
        if (response.ok && result.checkout?.status === 'CONFIRMED') {
          window.location.replace(result.checkout.returnUrl);
          return;
        }
      } catch {
        // A transient status request must never encourage a second payment.
      }
      if (active && attempts < 40) timer = window.setTimeout(checkAuthoritativeStatus, 3000);
    }
    timer = window.setTimeout(checkAuthoritativeStatus, 2000);
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [checkout, state]);

  async function beginPayment() {
    if (!checkout || state !== 'ready') return;
    if (!window.Razorpay || !razorpayReady) {
      setMessage('Razorpay is still loading. Check your connection and try again.');
      return;
    }
    setState('opening');
    setMessage('Creating a secure Razorpay order…');
    try {
      const response = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Secure payment could not start.');
      if (result.state === 'CONFIRMED') {
        setState('confirmed');
        window.location.replace(result.checkout.returnUrl);
        return;
      }
      const order = result.checkout;
      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amountMinor,
        currency: order.currency,
        order_id: order.orderId,
        name: 'ALINA',
        description: order.description,
        image: checkout.creatorImageUrl,
        handler: (providerResult) => {
          void (async () => {
            setState('verifying');
            setMessage('Payment received. Confirming your booking…');
            try {
              const verification = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpayPaymentId: providerResult.razorpay_payment_id,
                  razorpayOrderId: providerResult.razorpay_order_id,
                  razorpaySignature: providerResult.razorpay_signature,
                }),
              });
              const verified = await verification.json();
              if (!verification.ok || !verified.returnUrl) throw new Error(verified.message || 'We’re checking your payment. Don’t pay again yet.');
              setState(verified.state === 'CONFIRMED' ? 'confirmed' : 'verifying');
              setMessage(verified.state === 'CONFIRMED' ? 'Booking confirmed. Returning you to Alina…' : 'Payment received. Your booking is being reconciled; don’t pay again.');
              window.location.replace(verified.returnUrl);
            } catch (error) {
              setState('verifying');
              setMessage(error instanceof Error ? error.message : 'We’re checking your payment. Don’t pay again yet.');
            }
          })();
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setState('ready');
            setMessage('Payment was paused. Your time remains protected for the countdown shown.');
          },
        },
        retry: { enabled: true },
        theme: { color: '#A52B4E' },
      });
      razorpay.on('payment.failed', () => {
        setState('ready');
        setMessage('Payment wasn’t completed. No booking has been confirmed; choose another method or try again.');
      });
      razorpay.open();
      setState('checkout');
      setMessage('Complete payment in the Razorpay window. Your time remains protected.');
    } catch (error) {
      setState('ready');
      setMessage(error instanceof Error ? error.message : 'Secure payment could not start. Nothing new was charged.');
    }
  }

  return (
    <>
      <Head>
        <title>Secure payment · Alina</title>
        <meta name="description" content="Complete a protected creator booking with Razorpay." />
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      {checkout && ['ready', 'opening', 'checkout', 'verifying'].includes(state) ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onLoad={() => setRazorpayReady(true)} onError={() => { setRazorpayReady(false); setMessage('Razorpay could not load. Check your connection and try again.'); }} /> : null}
      <main className="payment-page">
        <div className="payment-shell">
          <a className="wordmark" href={bookingOrigin} aria-label="Alina home">ALINA</a>
          {state === 'loading' ? <section className="payment-card loading-card" aria-live="polite"><span className="loader" aria-hidden="true" /><p>{message}</p></section> : null}
          {state === 'error' ? <section className="payment-card error-card"><span className="status-dot" aria-hidden="true">!</span><p className="eyebrow">Payment link unavailable</p><h1>Return to your booking.</h1><p>{message}</p><a className="primary-action" href={bookingOrigin}>Back to Alina</a></section> : null}
          {checkout && state !== 'loading' && state !== 'error' ? (
            <section className="payment-card">
              <header className="creator-row">{checkout.creatorImageUrl ? <img src={checkout.creatorImageUrl} alt="" referrerPolicy="no-referrer" /> : <div className="creator-monogram" aria-hidden="true">{checkout.creatorName?.trim().charAt(0) || 'A'}</div>}<span><strong>{checkout.creatorName}</strong><small>Private creator session</small></span><span className="verified">Verified</span></header>
              <div className="payment-heading"><p className="eyebrow">Secure Razorpay checkout</p><h1>{state === 'confirmed' ? 'You’re booked.' : state === 'verifying' ? 'Confirming your booking…' : 'Confirm your session.'}</h1><p>{state === 'ready' || state === 'opening' ? 'The amount and time below come directly from your protected booking.' : message}</p></div>
              <div className="session-time"><strong>{dateLabel(checkout.sessionStart, checkout.timezone)}</strong><span>{timeLabel(checkout.sessionStart, checkout.timezone)}–{timeLabel(checkout.sessionEnd, checkout.timezone)}</span></div>
              <dl className="payment-summary"><div><dt>Experience</dt><dd>{checkout.experienceName}</dd></div><div><dt>Duration</dt><dd>{checkout.durationMinutes} minutes</dd></div><div><dt>Reference</dt><dd>{checkout.reference}</dd></div><div className="total"><dt>Total</dt><dd>{money(checkout.amountMinor, checkout.currency)} <small>{checkout.currency}</small></dd></div></dl>
              {message && state === 'ready' ? <p className="inline-message" role="status">{message}</p> : null}
              {state === 'ready' || state === 'opening' ? <><div className="hold-line"><span>Your time is protected</span><strong>{countdown}</strong></div><button className="primary-action" type="button" disabled={state === 'opening' || !razorpayReady || secondsRemaining === 0} onClick={() => void beginPayment()}>{state === 'opening' ? 'Opening Razorpay…' : razorpayReady ? `Pay ${money(checkout.amountMinor, checkout.currency)} & book` : 'Loading Razorpay…'}</button><p className="fine-print">No account is required. Razorpay shows the payment methods available for your device. Your booking is created only after server verification.</p></> : null}
              {state === 'verifying' ? <div className="processing" role="status"><span className="loader" aria-hidden="true" /><strong>Don’t pay again.</strong><span>{message}</span></div> : null}
              {state === 'checkout' ? <div className="processing" role="status"><strong>Razorpay is open.</strong><span>{message}</span></div> : null}
              {state === 'confirmed' ? <a className="primary-action" href={checkout.returnUrl}>View confirmed booking</a> : null}
            </section>
          ) : null}
          <footer className="payment-footer"><span>Encrypted checkout</span><span>·</span><a href={`${bookingOrigin}/legal/privacy`}>Privacy</a><span>·</span><a href={`${bookingOrigin}/legal/refunds`}>Refund policy</a></footer>
        </div>
      </main>
    </>
  );
}
