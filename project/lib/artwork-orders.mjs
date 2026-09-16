import { createHash, randomUUID } from 'node:crypto';
import { findArtwork } from './artwork-catalog.mjs';

export const validAccessToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const accessHash = (token) => createHash('sha256').update(`artwork-access:${token}`).digest('hex');
export class ArtworkError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Dependency injection keeps payment/SQL integration tests offline and production-safe.
export function createArtworkService({ query, provider }) {
  const one = async (sql, values = []) => (await query(sql, values))[0] || null;

  async function purchaseForToken(artworkId, token) {
    if (!findArtwork(artworkId) || !validAccessToken(token)) return null;
    const purchase = await one('SELECT * FROM artwork_purchases WHERE token_hash = $1 AND artwork_id = $2', [accessHash(token), artworkId]);
    if (purchase && purchase.payment_mode !== provider.mode()) throw new ArtworkError(409, 'This purchase belongs to a different payment mode. Contact support with your receipt.');
    return purchase;
  }

  function summary(purchase) {
    return purchase ? {
      reference: purchase.reference, artworkId: purchase.artwork_id, title: purchase.title_snapshot,
      amountMinor: purchase.amount_minor, currency: purchase.currency, mode: purchase.payment_mode,
      state: purchase.status, paidAt: purchase.paid_at,
    } : null;
  }

  function orderMatches(order, attempt, purchase) {
    return order?.id === attempt.provider_order_id && order.receipt === attempt.receipt
      && Number(order.amount) === purchase.amount_minor && order.currency === purchase.currency;
  }

  async function fulfil(order, payment) {
    const attempt = await one('SELECT * FROM artwork_payment_attempts WHERE provider_order_id = $1', [order?.id]);
    if (!attempt) throw new ArtworkError(404, 'Artwork order not found.');
    const purchase = await one('SELECT * FROM artwork_purchases WHERE id = $1', [attempt.purchase_id]);
    if (purchase.payment_mode !== provider.mode()) throw new ArtworkError(409, 'Payment mode mismatch.');
    if (!orderMatches(order, attempt, purchase) || payment?.order_id !== order.id
      || !/^pay_[A-Za-z0-9]+$/.test(payment?.id || '') || Number(payment.amount) !== purchase.amount_minor
      || payment.currency !== purchase.currency) throw new ArtworkError(409, 'Payment details do not match this artwork purchase.');

    const refunded = payment.status === 'refunded' || Number(payment.amount_refunded) > 0;
    if (!refunded && (payment.status !== 'captured' || payment.captured !== true || order.status !== 'paid')) return purchase;
    // One atomic statement: retries cannot partially mark a purchase or grant a second delivery.
    const state = refunded ? 'REFUNDED' : 'PAID';
    return one(`WITH locked AS (
        SELECT * FROM artwork_purchases WHERE id = $1 FOR UPDATE
      ), attempt_updated AS (
        UPDATE artwork_payment_attempts SET status = $3, updated_at = now()
          WHERE id = $2 AND purchase_id = (SELECT id FROM locked) RETURNING id
      ) UPDATE artwork_purchases p SET
        status = CASE
          WHEN locked.provider_payment_id IS NOT NULL AND locked.provider_payment_id <> $4 THEN 'REVIEW'
          WHEN locked.status IN ('REFUNDED', 'REVIEW') THEN locked.status
          ELSE $3 END,
        provider_payment_id = COALESCE(locked.provider_payment_id, $4),
        paid_at = COALESCE(locked.paid_at, now()), updated_at = now()
      FROM locked, attempt_updated WHERE p.id = locked.id RETURNING p.*`, [purchase.id, attempt.id, state, payment.id]);
  }

  async function reconcile(purchase) {
    const attempts = await query('SELECT * FROM artwork_payment_attempts WHERE purchase_id = $1 AND provider_order_id IS NOT NULL ORDER BY created_at DESC', [purchase.id]);
    for (const attempt of attempts) {
      // Failed attempts are terminal at the provider; webhooks still accept any later capture.
      if (attempt.status === 'FAILED') continue;
      const [order, payments] = await Promise.all([provider.fetchOrder(attempt.provider_order_id), provider.fetchOrderPayments(attempt.provider_order_id)]);
      if (!orderMatches(order, attempt, purchase)) throw new ArtworkError(409, 'Payment details need review. Please contact support.');
      const settled = payments.filter((payment) => payment.status === 'captured' || payment.status === 'refunded' || Number(payment.amount_refunded) > 0);
      for (const payment of settled) purchase = await fulfil(order, payment);
      if (!settled.length && order.status !== 'paid' && payments.length && payments.every((payment) => payment.status === 'failed')) {
        await query("UPDATE artwork_payment_attempts SET status = 'FAILED', updated_at = now() WHERE id = $1 AND status = 'PENDING'", [attempt.id]);
      }
    }
    return (await one('SELECT * FROM artwork_purchases WHERE id = $1', [purchase.id]));
  }

  async function start(artworkId, token) {
    const artwork = findArtwork(artworkId);
    if (!artwork || !validAccessToken(token)) throw new ArtworkError(400, 'Choose a valid artwork and reopen checkout.');
    const mode = provider.mode();
    const keyId = provider.publicKey(); // Fail before creating a record when provider credentials are absent.
    const id = randomUUID();
    await query(`INSERT INTO artwork_purchases (id, reference, token_hash, artwork_id, title_snapshot, amount_minor, currency, payment_mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (token_hash) DO NOTHING`,
    [id, `ART-${id.replaceAll('-', '').toUpperCase()}`, accessHash(token), artwork.id, artwork.title, artwork.amountMinor, artwork.currency, mode]);
    let purchase = await purchaseForToken(artworkId, token);
    if (!purchase) throw new ArtworkError(409, 'This checkout belongs to another artwork.');
    purchase = await reconcile(purchase);
    if (purchase.status !== 'PENDING') return { purchase: summary(purchase) };

    const attemptId = randomUUID();
    await query(`WITH eligible AS (
        SELECT id FROM artwork_purchases WHERE id = $2 AND status = 'PENDING' FOR UPDATE
      ) INSERT INTO artwork_payment_attempts (id, purchase_id, receipt, status)
      SELECT $1, id, $3, 'CREATING' FROM eligible ON CONFLICT DO NOTHING`,
    [attemptId, purchase.id, `ART-${attemptId.replaceAll('-', '')}`]);
    let attempt = await one("SELECT * FROM artwork_payment_attempts WHERE purchase_id = $1 AND status IN ('CREATING', 'PENDING')", [purchase.id]);
    if (!attempt) {
      purchase = await purchaseForToken(artworkId, token);
      if (purchase.status !== 'PENDING') return { purchase: summary(purchase) };
      throw new ArtworkError(409, 'Your payment is being updated. Please check its status.');
    }
    if (!attempt.provider_order_id) {
      const leaseId = randomUUID();
      // A lost provider response may already have consumed its unique receipt.
      // Each lease gets a fresh receipt; abandoned orders were never exposed or payable.
      attempt = await one(`UPDATE artwork_payment_attempts SET lease_id = $2, lease_until = now() + interval '45 seconds', receipt = $3
        WHERE id = $1 AND status = 'CREATING' AND (lease_until IS NULL OR lease_until < now()) RETURNING *`, [attempt.id, leaseId, `ART-${leaseId.replaceAll('-', '')}`]);
      if (!attempt) throw new ArtworkError(409, 'Checkout is already opening. Please wait a moment and try again.');
      try {
        const order = await provider.createArtworkOrder({ amount: purchase.amount_minor, currency: purchase.currency,
          reference: attempt.receipt, artworkId: artwork.id, title: purchase.title_snapshot });
        if (!/^order_[A-Za-z0-9]+$/.test(order?.id || '') || !orderMatches(order, { ...attempt, provider_order_id: order.id }, purchase)) throw new Error('ARTWORK_ORDER_MISMATCH');
        // A provider order is never exposed to the browser until safely persisted by this lease owner.
        attempt = await one(`UPDATE artwork_payment_attempts SET provider_order_id = $3, status = 'PENDING',
          lease_id = NULL, lease_until = NULL, updated_at = now()
          WHERE id = $1 AND lease_id = $2 AND status = 'CREATING' RETURNING *`, [attempt.id, leaseId, order.id]);
        if (!attempt) throw new Error('ARTWORK_ORDER_NOT_STORED');
      } catch (error) {
        await query('UPDATE artwork_payment_attempts SET lease_until = now() WHERE lease_id = $1', [leaseId]).catch(() => undefined);
        throw error;
      }
    }
    return { purchase: summary(purchase), checkout: { keyId, orderId: attempt.provider_order_id,
      amountMinor: purchase.amount_minor, currency: purchase.currency, description: `Digital artwork: ${purchase.title_snapshot}` } };
  }

  async function verify(purchase, { razorpayOrderId, razorpayPaymentId, razorpaySignature } = {}) {
    if (!/^order_[A-Za-z0-9]+$/.test(razorpayOrderId || '') || !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId || '')
      || !/^[a-f0-9]{64}$/i.test(razorpaySignature || '')) throw new ArtworkError(400, 'Payment confirmation could not be authenticated.');
    const attempt = await one('SELECT * FROM artwork_payment_attempts WHERE purchase_id = $1 AND provider_order_id = $2', [purchase.id, razorpayOrderId]);
    if (!attempt || !provider.verifyPaymentSignature(attempt.provider_order_id, razorpayPaymentId, razorpaySignature)) throw new ArtworkError(400, 'Payment confirmation could not be authenticated.');
    const [order, payment] = await Promise.all([provider.fetchOrder(attempt.provider_order_id), provider.fetchPayment(razorpayPaymentId)]);
    return fulfil(order, payment);
  }

  return { start, purchaseForToken, summary, reconcile, fulfil, verify };
}
