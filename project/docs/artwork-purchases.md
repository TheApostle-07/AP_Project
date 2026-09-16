# Artwork purchases

The three catalog items are digital PNGs, not sessions or physical prints. `/artwork/<id>` opens a dedicated checkout on this site. Existing booking handoff routes and policy links remain unchanged.

## Delivery and payment

- Prices, currency, titles and file paths come from the server catalog; browser-supplied amounts are ignored.
- `artwork_purchases` and `artwork_payment_attempts` isolate artwork transactions from booking tables. Amount/title snapshots preserve an existing order if the catalog later changes.
- A persisted provider order is required before opening Razorpay. A unique open-attempt constraint and expiring creation lease handle duplicate requests and abandoned workers. A new lease uses a fresh receipt because a lost provider response may have consumed the old one; abandoned orders are never exposed to checkout.
- Razorpay signature verification **and** authoritative order/payment checks are required. Authorized-but-not-captured payments do not grant downloads. Duplicate callbacks/webhooks are idempotent; different captured payment IDs put the purchase in REVIEW.
- Originals are stored outside `public` and included in the API function file trace. Each download checks payment/refund state. Provider outages fail closed. Refunds revoke future downloads, not files already downloaded.
- Buyers can download immediately and copy a private purchase link. A random 256-bit capability is stored only as a scoped SHA-256 hash in the database. The private link carries it in the fragment, which is removed on load and submitted in a same-origin POST. Browser access uses an HttpOnly/Secure/SameSite cookie. Treat the copied link like a password; anyone holding it can access that purchase. This flow does not promise email delivery or login-based recovery.
- Public catalog files are smaller previews. Earlier versions exposed originals publicly; this change cannot revoke historic copies.

## Production requirements

1. Existing `DATABASE_URL` must point to the shared database containing the booking gateway's `request_rate_limits` and `webhook_events` tables. `npm run build` runs the additive, repeatable `db/artwork.sql` migration before building. Production builds fail if DATABASE_URL is missing. Local/preview builds without it explicitly skip migration.
2. Keep the existing Razorpay mode and keys. Test mode is visibly labelled and does not represent a live sale. Switching to live is a deliberate operator action with live merchant approval/credentials; never infer live readiness from a passing build. Test purchases cannot unlock live downloads.
3. Razorpay automatic capture must be enabled. The existing `/api/webhook` must have the matching mode's webhook signing secret and `payment.captured` / `order.paid` subscriptions; add `refund.processed` for prompt refund updates. Status and download reconciliation also catches missed callbacks/refunds.
4. When changing the production domain, update the provider website/webhook configuration and existing booking return URL allowlists separately. Artwork links use the current origin, not a hard-coded creator platform URL.
5. Refund operations remain in Razorpay; no automatic refund, new live charge, credential change or email send is performed by installing this feature. Monitor REVIEW purchases and webhook failures. Use the ART receipt plus provider order/payment ID for support, not the customer's private capability.

## Verification

Run `npm test`, `npm run check`, `npm run build`, `node scripts/check-artwork-catalog.mjs`, then `npm run test:browser`.

Unit/integration tests execute the real SQL in disposable PGlite and the real API handlers with a fake provider. Browser tests use an isolated local production server and intercept payment/API responses. They create no real charges and contact no production database. A supervised Razorpay checkout (including its actual hosted window, capture, refund and settlement) remains necessary before accepting live customers.

Chromium and WebKit browser fixtures omit only `upgrade-insecure-requests` from loopback HTTP document responses, because WebKit otherwise upgrades the local server's assets to unsupported HTTPS. All other CSP directives remain enforced; deployed application headers are unchanged.

Provider references: [Standard integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [Create order](https://razorpay.com/docs/api/orders/create/), [Webhook validation](https://razorpay.com/docs/webhooks/validate-test/).
