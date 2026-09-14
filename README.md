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
