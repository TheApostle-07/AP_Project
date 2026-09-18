# Alina approved payment origin

This app is a dedicated Razorpay payment boundary for Alina creator bookings.
It does not accept amounts, creator IDs, or booking references from query
parameters. The main booking app creates a short-lived opaque handoff in the
shared PostgreSQL database and passes the capability in a URL fragment. This
app exchanges it for an HttpOnly cookie, creates the Razorpay order from the
server-held amount, verifies the response server-side, and transactionally
confirms the booking.

Required production variables are documented in `.env.example`. When a complete
`RAZORPAY_TEST_KEY_ID` and `RAZORPAY_TEST_KEY_SECRET` pair is present, the app
defaults safely to test mode. Set `RAZORPAY_MODE=live` explicitly and redeploy
only when real payments should begin. Configure the Razorpay webhook URL as
`https://ap-project-ebkr.vercel.app/api/webhook` for `payment.captured` and
`order.paid` events in the matching Razorpay dashboard mode.

## Shared database release prerequisite

Before deploying this version, apply the main booking application's migrations
through `031_scoped_expiry_indexes.sql` to the shared database. In particular,
`029_capture_evidence.sql` supplies `record_checkout_capture`, which this app
requires before confirming any payment. The main app's production build runs its
pending migrations; wait for that step to complete before releasing this bridge.
Do not run database migrations against an unrelated database or remove financial
history to resolve a migration failure.

Verified extra or mismatched captures are recorded for authorized review, never
converted into extra bookings or earnings. This release does not execute refunds
or payouts and does not activate live payments. Keep Razorpay in test mode until
the owner separately approves and tests the live-provider setup.
