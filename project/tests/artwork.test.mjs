import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { transformSync } from 'esbuild';
import { createArtworkService, accessHash, ArtworkError } from '../lib/artwork-orders.mjs';
import { artworks } from '../lib/artwork-catalog.mjs';
import { Readable } from 'node:stream';

// Disposable in-memory Postgres. Never reads DATABASE_URL or contacts Razorpay.
const root = path.resolve(import.meta.dirname, '..');
const db = new PGlite();
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
let orders, payments, createCalls, createHook, mode;
const provider = {
  mode: () => mode, publicKey: () => `rzp_${mode}_mock`,
  createArtworkOrder: async ({ amount, currency, reference, artworkId, title }) => {
    createCalls++; await createHook?.();
    const order = { id: `order_${randomUUID().replaceAll('-', '')}`, amount, currency, receipt: reference, status: 'created', notes: { product_type: 'digital_artwork', artworkId, title } };
    orders.set(order.id, order); payments.set(order.id, []); return order;
  },
  fetchOrder: async (id) => { if (!orders.has(id)) throw new Error('UNAVAILABLE'); return orders.get(id); },
  fetchOrderPayments: async (id) => payments.get(id) || [],
  fetchPayment: async (id) => [...payments.values()].flat().find((payment) => payment.id === id),
  verifyPaymentSignature: (_order, _payment, signature) => signature === 'a'.repeat(64),
};
const service = createArtworkService({ query, provider });
const token = () => randomBytes(32).toString('base64url');
async function pending(id = 'rose-reverie') {
  const access = token(); const result = await service.start(id, access);
  return { ...result, access, row: await service.purchaseForToken(id, access), order: orders.get(result.checkout.orderId) };
}
function pay(value, overrides = {}) {
  const payment = { id: `pay_${randomUUID().replaceAll('-', '')}`, order_id: value.order.id, amount: value.order.amount,
    currency: 'INR', status: 'captured', captured: true, amount_refunded: 0, ...overrides };
  value.order.status = 'paid'; payments.set(value.order.id, [payment]); return payment;
}

before(async () => {
  await db.exec(readFileSync(path.join(root, 'db/artwork.sql'), 'utf8'));
  await db.exec('CREATE TABLE request_rate_limits (key_hash text, route text, window_start timestamptz, count integer, PRIMARY KEY(key_hash,route,window_start));');
});
beforeEach(async () => {
  await db.exec('TRUNCATE artwork_payment_attempts, artwork_purchases, request_rate_limits CASCADE');
  orders = new Map(); payments = new Map(); createCalls = 0; createHook = null; mode = 'test';
});
after(async () => db.close());

test('migration is repeatable without modifying existing data', async () => {
  const value = await pending();
  await db.exec(readFileSync(path.join(root, 'db/artwork.sql'), 'utf8'));
  assert.equal((await service.purchaseForToken('rose-reverie', value.access)).id, value.row.id);
});
test('each product uses its server-owned price and truthful artwork metadata', async () => {
  for (const artwork of artworks) {
    const value = await pending(artwork.id);
    assert.equal(value.checkout.amountMinor, artwork.amountMinor);
    assert.equal(value.order.notes.product_type, 'digital_artwork');
    assert.equal(value.order.notes.title, artwork.title);
    assert.equal(value.row.token_hash, accessHash(value.access));
    assert.ok(!JSON.stringify(value.row).includes(value.access));
  }
});
test('unknown products and malformed capabilities cannot create orders', async () => {
  for (const [id, access] of [['__proto__', token()], ['rose-reverie', 'unsafe']]) await assert.rejects(service.start(id, access), /valid artwork/);
  assert.equal(createCalls, 0);
});
test('repeat checkout returns the persisted provider order', async () => {
  const value = await pending();
  const again = await service.start('rose-reverie', value.access);
  assert.equal(again.checkout.orderId, value.checkout.orderId); assert.equal(createCalls, 1);
});
test('a purchase capability cannot be used for another product', async () => {
  const value = await pending();
  await assert.rejects(service.start('midnight-bloom', value.access), /another artwork/);
  assert.equal(await service.purchaseForToken('midnight-bloom', value.access), null);
});
test('only one provider call is made while simultaneous checkout requests race', async () => {
  const access = token();
  let release, entered;
  const inside = new Promise((resolve) => { entered = resolve; });
  createHook = async () => { entered(); await new Promise((resolve) => { release = resolve; }); };
  const first = service.start('rose-reverie', access);
  await inside;
  await assert.rejects(service.start('rose-reverie', access), /already opening/);
  release(); await first; assert.equal(createCalls, 1);
});
test('expired creation lease recovers abandoned work', async () => {
  createHook = async () => { throw new Error('PROVIDER_TIMEOUT'); };
  const access = token(); await assert.rejects(service.start('rose-reverie', access), /PROVIDER_TIMEOUT/);
  await query("UPDATE artwork_payment_attempts SET lease_until = now() - interval '1 minute'");
  createHook = null;
  assert.ok((await service.start('rose-reverie', access)).checkout.orderId);
});
test('a stale creation worker cannot expose an order after its lease is replaced', async () => {
  createHook = async () => { await query("UPDATE artwork_payment_attempts SET lease_id = $1", [randomUUID()]); };
  await assert.rejects(service.start('rose-reverie', token()), /NOT_STORED/);
  assert.equal((await query('SELECT provider_order_id FROM artwork_payment_attempts'))[0].provider_order_id, null);
});
test('signed callback must also have captured funds and a paid provider order', async () => {
  const value = await pending();
  const payment = pay(value, { status: 'authorized', captured: false }); value.order.status = 'attempted';
  const result = await service.verify(value.row, { razorpayOrderId: value.order.id, razorpayPaymentId: payment.id, razorpaySignature: 'a'.repeat(64) });
  assert.equal(result.status, 'PENDING');
});
test('invalid signatures and another purchase order do not grant access', async () => {
  const value = await pending(), another = await pending(); const payment = pay(value);
  await assert.rejects(service.verify(value.row, { razorpayOrderId: value.order.id, razorpayPaymentId: payment.id, razorpaySignature: 'b'.repeat(64) }), /authenticated/);
  await assert.rejects(service.verify(another.row, { razorpayOrderId: value.order.id, razorpayPaymentId: payment.id, razorpaySignature: 'a'.repeat(64) }), /authenticated/);
});
test('amount, currency, receipt and order mismatches are rejected', async () => {
  const value = await pending(); const payment = pay(value);
  for (const changed of [{ amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }]) await assert.rejects(service.fulfil(value.order, { ...payment, ...changed }), /do not match/);
  for (const changed of [{ amount: 1 }, { currency: 'USD' }, { receipt: 'other' }]) await assert.rejects(service.fulfil({ ...value.order, ...changed }, payment), /do not match/);
  assert.equal((await service.purchaseForToken('rose-reverie', value.access)).status, 'PENDING');
});
test('capture, duplicate webhook and interrupted browser callback converge on one paid purchase', async () => {
  const value = await pending(); const payment = pay(value);
  await service.fulfil(value.order, payment);
  await service.fulfil(value.order, payment);
  const reconciled = await service.reconcile(value.row);
  assert.equal(reconciled.status, 'PAID'); assert.equal(reconciled.provider_payment_id, payment.id);
  assert.equal((await service.start('rose-reverie', value.access)).checkout, undefined);
  assert.equal(createCalls, 1);
});
test('failed payment gets a new provider attempt, not a duplicate purchase', async () => {
  const value = await pending(); pay(value, { status: 'failed', captured: false }); value.order.status = 'attempted';
  const retried = await service.start('rose-reverie', value.access);
  assert.notEqual(retried.checkout.orderId, value.order.id);
  assert.equal(retried.purchase.reference, value.purchase.reference);
  assert.equal((await query('SELECT * FROM artwork_purchases')).length, 1);
});
test('authorized / unknown payments never start another provider attempt', async () => {
  const value = await pending(); pay(value, { status: 'authorized', captured: false }); value.order.status = 'attempted';
  assert.equal((await service.start('rose-reverie', value.access)).checkout.orderId, value.order.id);
  assert.equal(createCalls, 1);
});
test('refund before capture notification stays refunded after stale capture', async () => {
  const value = await pending(); const payment = pay(value);
  await service.fulfil(value.order, { ...payment, status: 'refunded', amount_refunded: payment.amount });
  await service.fulfil(value.order, payment);
  assert.equal((await service.purchaseForToken('rose-reverie', value.access)).status, 'REFUNDED');
});
test('missed refund webhooks are caught by download/status reconciliation', async () => {
  const value = await pending(); const payment = pay(value);
  await service.fulfil(value.order, payment); payment.amount_refunded = 100;
  assert.equal((await service.reconcile(value.row)).status, 'REFUNDED');
});
test('second captured payment is flagged for review', async () => {
  const value = await pending(); const payment = pay(value);
  await service.fulfil(value.order, payment);
  const updated = await service.fulfil(value.order, { ...payment, id: 'pay_secondCapture' });
  assert.equal(updated.status, 'REVIEW');
});
test('test purchases cannot be treated as live purchases', async () => {
  const value = await pending(); mode = 'live';
  await assert.rejects(service.purchaseForToken('rose-reverie', value.access), /different payment mode/);
});

// Execute the real route with only network/database dependencies replaced.
const require = createRequire(import.meta.url);
function loadRoute(route = 'pages/api/artwork/[action].js', overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const localRequire = (specifier) => {
      if (specifier in overrides) return overrides[specifier];
      if (specifier.endsWith('/artwork-server')) return { artworkService: service };
      if (specifier.endsWith('/artwork-orders.mjs')) return { accessHash, ArtworkError, validAccessToken: (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) };
      if (specifier.endsWith('/paymentGateway')) return { publicKey: provider.publicKey, razorpayMode: provider.mode };
      if (specifier === './db') return { query };
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), specifier);
        return load(path.extname(target) ? target : `${target}.js`);
      }
      return require(specifier);
    };
    const { code } = transformSync(readFileSync(filename, 'utf8'), { format: 'cjs', target: 'es2022' });
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(path.join(root, route)).default;
}
async function api(action, { body = {}, cookie, origin = 'http://localhost:4308', method = 'POST', extraHeaders = {} } = {}) {
  const response = { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.statusCode=code; return this; }, json(value) { this.body=value; return this; }, send(value) { this.body=value; return this; } };
  const request = { method, query: { action, artworkId: body.artworkId }, body,
    headers: { host: 'localhost:4308', origin, ...(cookie ? {cookie} : {}), ...extraHeaders }, socket: {remoteAddress: '127.0.0.1'} };
  await loadRoute()(request,response); return response;
}
test('API rejects cross-origin order creation and unknown actions/methods', async () => {
  assert.equal((await api('order',{origin:'https://attacker.example',body:{artworkId:'rose-reverie',token:token()}})).statusCode,403);
  assert.equal((await api('order',{method:'GET'})).statusCode,405);
  assert.equal((await api('unsafe')).statusCode,404);
});
test('API ignores browser-supplied totals and sets a separate HttpOnly purchase cookie', async () => {
  const result = await api('order',{body:{artworkId:'rose-reverie',token:token(),amount:1,currency:'USD'}});
  assert.equal(result.statusCode,200); assert.equal(result.body.checkout.amountMinor,399900);
  assert.match(result.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(result.headers['Set-Cookie'],/payment_handoff/);
});
test('unpaid, wrong-artwork and missing-token downloads are denied', async () => {
  const value = await pending();
  const cookie = `alina_art_rose-reverie=${value.access}`;
  assert.equal((await api('download',{method:'GET',body:{artworkId:'rose-reverie'},cookie})).statusCode,403);
  assert.equal((await api('download',{method:'GET',body:{artworkId:'midnight-bloom'},cookie})).statusCode,404);
  assert.equal((await api('download',{method:'GET',body:{artworkId:'rose-reverie'}})).statusCode,404);
});
test('paid cookie grants original PNG; refunded payment revokes it', async () => {
  const value = await pending(); const payment = pay(value);
  const cookie = `alina_art_rose-reverie=${value.access}`;
  const response = await api('download',{method:'GET',body:{artworkId:'rose-reverie'},cookie});
  assert.equal(response.statusCode,200); assert.equal(response.headers['Content-Type'],'image/png');
  assert.ok(Buffer.isBuffer(response.body)); assert.ok(response.body.equals(readFileSync(path.join(root,'assets/artwork/rose-reverie.png'))));
  assert.match(response.headers['Cache-Control'],/no-store/);
  payment.amount_refunded=payment.amount;
  assert.equal((await api('download',{method:'GET',body:{artworkId:'rose-reverie'},cookie})).statusCode,403);
});
test('malformed cookies fail safely and invalid products cannot traverse file paths', async () => {
  const response=await api('status',{body:{artworkId:'rose-reverie'},cookie:'alina_art_rose-reverie=%EA'});
  assert.equal(response.statusCode,200); assert.equal(response.body.purchase,null);
  assert.equal((await api('download',{method:'GET',body:{artworkId:'../../package.json'}})).statusCode,404);
});
test('private-link recovery works without a previous cookie', async () => {
  const value=await pending(); pay(value);
  const response=await api('status',{body:{artworkId:'rose-reverie',token:value.access}});
  assert.equal(response.body.purchase.state,'PAID'); assert.equal(response.body.accessToken,value.access);
  assert.match(response.headers['Set-Cookie'],/HttpOnly/);
});
test('provider outages fail closed instead of delivering an unverified file', async () => {
  const value=await pending(); pay(value); orders.delete(value.order.id);
  const response=await api('download',{method:'GET',body:{artworkId:'rose-reverie'},cookie:`alina_art_rose-reverie=${value.access}`});
  assert.equal(response.statusCode,503); assert.match(response.body.message,/don’t pay again/);
});
test('order endpoint limits repeated requests', async () => {
  for(let i=0;i<10;i++) await api('order',{body:{artworkId:'rose-reverie',token:token()}});
  assert.equal((await api('order',{body:{artworkId:'rose-reverie',token:token()}})).statusCode,429);
});

test('API returns domain validation errors without misreporting a provider outage', async () => {
  const value = await pending(); mode = 'live';
  assert.equal((await api('status', {body:{artworkId:'rose-reverie',token:value.access}})).statusCode,409);
});
test('abandoned creation never reuses a potentially consumed provider receipt', async () => {
  createHook = async () => { throw new Error('LOST_RESPONSE'); };
  const access = token(); await assert.rejects(service.start('rose-reverie', access));
  const previous = (await query('SELECT receipt FROM artwork_payment_attempts'))[0].receipt;
  createHook = null;
  const result = await service.start('rose-reverie', access);
  assert.notEqual(orders.get(result.checkout.orderId).receipt, previous);
});

async function webhook(event, { signature = true } = {}) {
  let bookingCalls = 0; const writes = [];
  const handler = loadRoute('pages/api/webhook.js', {
    '../../lib/db': { query: async (sql) => { writes.push(sql); return [{id:'event'}]; } },
    '../../lib/paymentGateway': { ...provider, verifyWebhookSignature: () => signature },
    '../../lib/fulfilment': { fulfilRazorpayPayment: async () => { bookingCalls++; } },
  });
  const request = Readable.from([JSON.stringify(event)]);
  request.method='POST'; request.headers={'x-razorpay-signature':'a'.repeat(64),'x-razorpay-event-id':randomUUID()};
  const response = { statusCode:200, setHeader(){}, status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;} };
  await handler(request,response); return {...response,bookingCalls,writes};
}
test('captured artwork webhooks fulfil only artwork; duplicates are safe', async () => {
  const value=await pending(); pay(value);
  const event={event:'order.paid',payload:{order:{entity:{id:value.order.id}}}};
  for(let i=0;i<2;i++) { const result=await webhook(event); assert.equal(result.statusCode,200);assert.equal(result.bookingCalls,0); }
  assert.equal((await service.purchaseForToken('rose-reverie',value.access)).status,'PAID');
});
test('late capture and refund webhooks preserve refunded artwork state', async () => {
  const value=await pending(); const payment=pay(value,{status:'refunded',amount_refunded:399900});
  assert.equal((await webhook({event:'payment.captured',payload:{payment:{entity:{order_id:value.order.id}}}})).statusCode,200);
  assert.equal((await webhook({event:'refund.processed',payload:{refund:{entity:{payment_id:payment.id}}}})).statusCode,200);
  assert.equal((await service.purchaseForToken('rose-reverie',value.access)).status,'REFUNDED');
});
test('existing booking webhook routing remains unchanged', async () => {
  const value=await pending(); value.order.receipt='AP-BOOKING';pay(value);
  const result=await webhook({event:'order.paid',payload:{order:{entity:{id:value.order.id}}}});
  assert.equal(result.statusCode,200);assert.equal(result.bookingCalls,1);
});
test('unsigned webhook cannot fulfil or write any event', async () => {
  const result=await webhook({event:'order.paid'}, {signature:false});
  assert.equal(result.statusCode,400);assert.equal(result.writes.length,0);
});
