import Head from 'next/head';
import Image from 'next/image';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { artworks, findArtwork, artworkPrice } from '../../lib/artwork-catalog.mjs';

const validToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
function newToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export default function ArtworkCheckout({ artwork }) {
  const [state, setState] = useState('loading');
  const [purchase, setPurchase] = useState(null);
  const [mode, setMode] = useState(null);
  const [message, setMessage] = useState('');
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [privateLink, setPrivateLink] = useState('');
  const [checking, setChecking] = useState(false);
  const token = useRef(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const checkoutRef = useRef(null);
  const verificationStarted = useRef(false);
  const storageKey = `alina-artwork:${artwork.id}`;

  const request = useCallback(async (action, body = {}) => {
    const response = await fetch(`/api/artwork/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artworkId: artwork.id, ...body }), signal: AbortSignal.timeout(55_000),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.message || 'Please check your connection and try again.'), { status: response.status });
    return result;
  }, [artwork.id]);

  const applyResult = useCallback((result) => {
    if (validToken(result.accessToken)) {
      token.current = result.accessToken;
      try { sessionStorage.setItem(storageKey, result.accessToken); } catch {}
    }
    setMode(result.mode || result.purchase?.mode || null);
    setPurchase(result.purchase);
    const next = result.purchase?.state;
    setState(next === 'PAID' ? 'paid' : next === 'REFUNDED' ? 'refunded' : next === 'REVIEW' ? 'review' : 'ready');
    setMessage('');
  }, [storageKey]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('access');
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    let saved;
    try { saved = sessionStorage.getItem(storageKey); } catch { /* Cookie recovery still works. */ }
    token.current = validToken(fragment) ? fragment : validToken(saved) ? saved : null;
    if (fragment && !validToken(fragment)) {
      setState('error'); setMessage('This private purchase link is invalid. Return to the artwork catalog to start again.');
    } else {
      void request('status', token.current ? { token: token.current } : {}).catch((error) => {
        if (error.status === 404 && !fragment) {
          token.current = null;
          try { sessionStorage.removeItem(storageKey); } catch {}
          return request('status');
        }
        throw error;
      }).then((result) => {
        if (!active) return;
        if (token.current) { try { sessionStorage.setItem(storageKey, token.current); } catch {} }
        applyResult(result);
      }).catch((error) => { if (active) { setState('error'); setMessage(error.message); } });
    }
    return () => { active = false; mounted.current = false; checkoutRef.current?.close(); };
  }, [applyResult, request, storageKey]);

  async function checkStatus() {
    if (busy.current) return;
    busy.current = true; setChecking(true);
    try {
      const result = await request('status', token.current ? { token: token.current } : {}).catch((error) => {
        if (error.status === 404 && !purchase) {
          token.current = null;
          try { sessionStorage.removeItem(storageKey); } catch {}
          return request('status');
        }
        throw error;
      });
      if (!mounted.current) return;
      applyResult(result);
      if (result.purchase?.state === 'PENDING') setMessage('Payment is not confirmed yet. If money was debited, wait and check again before retrying.');
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { busy.current = false; if (mounted.current) setChecking(false); }
  }

  useEffect(() => {
    if (state !== 'verifying') return;
    let active = true, timer, attempts = 0;
    async function poll() {
      attempts++;
      try {
        const result = await request('status', token.current ? { token: token.current } : {});
        if (!active) return;
        if (result.purchase && result.purchase.state !== 'PENDING') { applyResult(result); return; }
      } catch { /* The manual status action remains available if the network is unavailable. */ }
      if (active && attempts < 20) timer = window.setTimeout(poll, 4000);
      else if (active) setMessage('Confirmation is taking longer than usual. Don’t pay again if money was debited. You can check the status below or contact support.');
    }
    timer = window.setTimeout(poll, 3000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [state, request, applyResult]);

  async function beginPayment() {
    if (busy.current || state !== 'ready') return;
    if (!scriptReady || !window.Razorpay) { setMessage('The payment window is still loading. Please check your connection.'); return; }
    busy.current = true;
    setState('opening'); setMessage('');
    try {
      token.current ||= newToken();
      try { sessionStorage.setItem(storageKey, token.current); } catch { /* Capability remains in memory and the server sets a cookie. */ }
      const result = await request('order', { token: token.current });
      if (!mounted.current) return;
      setPurchase(result.purchase); setMode(result.purchase.mode);
      if (!result.checkout) { applyResult(result); return; }
      const order = result.checkout;
      verificationStarted.current = false;
      const checkout = new window.Razorpay({
        key: order.keyId, amount: order.amountMinor, currency: order.currency, order_id: order.orderId,
        name: 'ALINA POPOVA', description: order.description,
        handler: async (payment) => {
          verificationStarted.current = true;
          if (!mounted.current) return;
          setState('verifying'); setMessage('Confirming your payment securely…');
          try {
            const verified = await request('verify', {
              razorpayPaymentId: payment.razorpay_payment_id,
              razorpayOrderId: payment.razorpay_order_id,
              razorpaySignature: payment.razorpay_signature,
            });
            if (!mounted.current) return;
            if (verified.purchase?.state !== 'PENDING') applyResult(verified);
          } catch (error) { if (mounted.current) setMessage(error.message); }
        },
        modal: { confirm_close: true, ondismiss: () => {
          if (mounted.current && !verificationStarted.current) {
            setState('verifying'); setMessage('Payment window closed. Checking whether payment completed…');
          }
        } },
        // A failed payment gets a fresh server-owned attempt after reconciliation.
        retry: { enabled: false }, theme: { color: '#a52b4e' },
      });
      checkoutRef.current = checkout;
      checkout.on('payment.failed', () => {
        if (mounted.current && !verificationStarted.current) {
          setState('verifying'); setMessage('Payment was not completed. Check its status below before trying again.');
        }
      });
      setState('checkout');
      checkout.open();
    } catch (error) {
      if (mounted.current) { setState('error'); setMessage(error.message); }
    } finally { busy.current = false; }
  }

  async function savePrivateLink() {
    if (!token.current) { setMessage('Keep this browser open for access. Contact support with your receipt if you need help recovering a purchase.'); return; }
    const link = `${window.location.origin}/artwork/${artwork.id}#access=${token.current}`;
    try { await navigator.clipboard.writeText(link); setMessage('Private purchase link copied. Save it somewhere safe; anyone with it can download your artwork.'); }
    catch { setPrivateLink(link); }
  }

  async function downloadArtwork() {
    if (busy.current) return;
    busy.current = true; setChecking(true);
    try {
      const response = await fetch(`/api/artwork/download?artworkId=${artwork.id}`, { signal: AbortSignal.timeout(55_000) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message || 'Download is unavailable. Please check payment status.'); }
      const file = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `alina-${artwork.id}.png`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Your download has started. Save your private purchase link if you need to download again.');
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { busy.current = false; if (mounted.current) setChecking(false); }
  }

  const total = purchase?.amountMinor ?? artwork.amountMinor;
  return <>
    <Head><title>{artwork.title} · Buy artwork · Alina Popova</title><meta name="robots" content="noindex,nofollow" /></Head>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setScriptReady(true)} onError={() => setScriptFailed(true)} />
    <main className="artwork-checkout">
      <div className="artwork-checkout-shell">
        <a className="wordmark" href="/">ALINA POPOVA</a>
        <section className="artwork-checkout-card" aria-labelledby="artwork-title">
          <div className="artwork-checkout-visual"><Image src={artwork.image} alt={artwork.title} width={artwork.width} height={artwork.height} sizes="(max-width: 760px) calc(100vw - 64px), 440px" preload /><span>Digital artwork</span></div>
          <div className="artwork-checkout-details">
            <p className="eyebrow">{state === 'paid' ? (mode === 'test' ? 'Test payment confirmed' : 'Payment confirmed') : 'Your art collection'}</p>
            <h1 id="artwork-title">{artwork.title}</h1>
            <p className="artwork-intro">{state === 'paid' ? 'Your artwork is ready. Download the original PNG and save your private purchase link for later.' : artwork.description}</p>
            <dl className="artwork-summary"><div><dt>Format</dt><dd>Digital PNG</dd></div><div><dt>Dimensions</dt><dd>{artwork.width} × {artwork.height} px</dd></div><div><dt>Delivery</dt><dd>Download after payment</dd></div><div className="artwork-total"><dt>{state === 'paid' ? 'Paid' : 'Total'}</dt><dd>{artworkPrice(total)}</dd></div></dl>
            <p className="artwork-note">Digital file only. No physical print or shipping. This purchase does not include a creator session.</p>
            {mode === 'test' ? <p className="artwork-test" role="status">Test checkout — no real money is charged.</p> : null}
            <div className="artwork-actions" aria-busy={state === 'opening' || checking}>
              {state === 'loading' ? <p role="status">Checking secure checkout…</p> : null}
              {state === 'ready' || state === 'opening' ? <button className="primary-action" type="button" onClick={() => void beginPayment()} disabled={state === 'opening' || !scriptReady || checking}>{state === 'opening' ? 'Opening checkout…' : scriptReady ? `Pay ${artworkPrice(total)} & download` : 'Loading secure payment…'}</button> : null}
              {scriptFailed && state === 'ready' ? <><p role="alert">The payment window couldn’t load. No payment has started.</p><button className="artwork-secondary" type="button" onClick={() => window.location.reload()}>Reload checkout</button></> : null}
              {state === 'checkout' ? <p role="status">Complete payment in the Razorpay window.</p> : null}
              {state === 'paid' ? <><button className="primary-action" type="button" disabled={checking} onClick={() => void downloadArtwork()}>{checking ? 'Preparing download…' : 'Download artwork · PNG'}</button><button className="artwork-secondary" type="button" onClick={() => void savePrivateLink()}>Copy private purchase link</button></> : null}
              {state === 'refunded' ? <p role="status">This payment has been refunded. Download access is no longer available.</p> : null}
              {state === 'review' ? <p role="alert">This payment needs review. Please contact support with your receipt. Don’t pay again.</p> : null}
              {['verifying', 'error'].includes(state) ? <button className="artwork-secondary" type="button" disabled={checking} onClick={() => void checkStatus()}>{checking ? 'Checking…' : 'Check payment status'}</button> : null}
              {message ? <p className="artwork-message" role="status">{message}</p> : null}
              {privateLink ? <label className="artwork-private-link">Save this private link<input readOnly value={privateLink} onFocus={(event) => event.target.select()} /><span>Anyone with this link can access the download.</span></label> : null}
            </div>
            {purchase ? <p className="artwork-reference">Receipt <span>{purchase.reference}</span></p> : null}
            <p className="artwork-note">By continuing, you agree to the <a href="https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/terms">Terms</a> and <a href="https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/refund">Refund Policy</a>.</p>
          </div>
        </section>
        <footer className="artwork-checkout-footer"><a href="/">Back to artworks</a><a href="mailto:alinapopovabusiness@gmail.com">Need help?</a></footer>
      </div>
    </main>
  </>;
}

export function getStaticPaths() { return { paths: artworks.map(({ id }) => ({ params: { slug: id } })), fallback: false }; }
export function getStaticProps({ params }) { const artwork = findArtwork(params.slug); return artwork ? { props: { artwork } } : { notFound: true }; }
