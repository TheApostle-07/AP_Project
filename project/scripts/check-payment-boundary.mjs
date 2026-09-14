import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const order = await readFile(new URL('../pages/api/order.js', import.meta.url), 'utf8');
const verify = await readFile(new URL('../pages/api/verify.js', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../pages/api/webhook.js', import.meta.url), 'utf8');
const pay = await readFile(new URL('../pages/pay.js', import.meta.url), 'utf8');
const handoff = await readFile(new URL('../lib/handoff.js', import.meta.url), 'utf8');
const security = await readFile(new URL('../lib/security.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../lib/paymentGateway.js', import.meta.url), 'utf8');
const home = await readFile(new URL('../pages/index.js', import.meta.url), 'utf8');

assert.match(order, /amount: Number\(handoff\.amount_minor\)/, 'Razorpay order must use the server-held amount');
assert.doesNotMatch(order, /request\.body\?\.amount/, 'Order API must never accept a browser amount');
assert.match(verify, /verifyPaymentSignature\(handoff\.provider_order_id/, 'Verification must use the stored order ID');
assert.match(webhook, /bodyParser: false/, 'Webhook must preserve the raw signed body');
assert.match(webhook, /x-razorpay-event-id/, 'Webhook processing must deduplicate provider events');
assert.match(pay, /window\.location\.hash/, 'Handoff must arrive in a fragment, not a logged query parameter');
assert.doesNotMatch(pay, /prefill:/, 'Checkout must not contain dummy identity prefill');
assert.match(handoff, /token_hash = \$1/, 'Only the handoff token digest may be looked up in storage');
assert.match(handoff, /UNTRUSTED_RETURN_ORIGIN/, 'Database return origins must be checked against the configured booking origin');
assert.match(security, /__Host-alina_payment_handoff/, 'Production handoff cookie must use the __Host prefix');
assert.match(security, /SameSite=Strict/, 'The payment capability cookie must remain same-site request bound');
assert.doesNotMatch(security, /if \(!origin\) return true/, 'Missing Origin must never be trusted automatically');
assert.match(pay, /checkout && \['ready'/, 'Razorpay must not load for an unauthenticated payment-page visit');
assert.match(pay, /checkAuthoritativeStatus/, 'An interrupted browser callback must reconcile from server state');
assert.doesNotMatch(gateway, /description\.slice/, 'Provider metadata must not receive creator or session prose');
assert.match(home, /Portrait of Timeless Beauty/, 'The Razorpay-approved merchant homepage must remain at the root route');
assert.doesNotMatch(home, /new window\.Razorpay|init-payment|request\.body/, 'The approved homepage must not recreate the legacy client-controlled payment path');

console.log('Payment handoff, server-owned price, signature, and webhook invariants passed.');
