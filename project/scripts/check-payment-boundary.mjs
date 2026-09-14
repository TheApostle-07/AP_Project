import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const order = await readFile(new URL('../pages/api/order.js', import.meta.url), 'utf8');
const verify = await readFile(new URL('../pages/api/verify.js', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../pages/api/webhook.js', import.meta.url), 'utf8');
const pay = await readFile(new URL('../pages/pay.js', import.meta.url), 'utf8');
const handoff = await readFile(new URL('../lib/handoff.js', import.meta.url), 'utf8');

assert.match(order, /amount: Number\(handoff\.amount_minor\)/, 'Razorpay order must use the server-held amount');
assert.doesNotMatch(order, /request\.body\?\.amount/, 'Order API must never accept a browser amount');
assert.match(verify, /verifyPaymentSignature\(handoff\.provider_order_id/, 'Verification must use the stored order ID');
assert.match(webhook, /bodyParser: false/, 'Webhook must preserve the raw signed body');
assert.match(webhook, /x-razorpay-event-id/, 'Webhook processing must deduplicate provider events');
assert.match(pay, /window\.location\.hash/, 'Handoff must arrive in a fragment, not a logged query parameter');
assert.doesNotMatch(pay, /prefill:/, 'Checkout must not contain dummy identity prefill');
assert.match(handoff, /token_hash = \$1/, 'Only the handoff token digest may be looked up in storage');

console.log('Payment handoff, server-owned price, signature, and webhook invariants passed.');
