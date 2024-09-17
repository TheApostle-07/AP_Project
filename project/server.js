// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');  // For securing Razorpay webhook signatures
const app = express();

// Use body-parser to parse incoming request bodies
app.use(bodyParser.json());

// Endpoint to serve the payment page (index.html)
app.use(express.static('public'));  // Assuming your frontend files are in the 'public' folder

// POST endpoint to verify payment after success from Razorpay
app.post('/verify-payment', (req, res) => {
    const razorpayPaymentId = req.body.razorpay_payment_id;

    // Here, you can make an API call to Razorpay to verify the payment server-side
    // Assuming the payment is valid, for now:
    if (razorpayPaymentId) {
        console.log('Payment verified:', razorpayPaymentId);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Webhook endpoint to handle Razorpay events (like payment success, failure)
app.post('/razorpay-webhook', (req, res) => {
    const webhookSecret = 'YOUR_RAZORPAY_WEBHOOK_SECRET';  // Replace with your webhook secret

    // Validate the webhook signature
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest === req.headers['x-razorpay-signature']) {
        console.log('Webhook verified:', req.body);
        // Process the webhook event (e.g., handle successful payments or refunds)
        res.status(200).send('Webhook verified');
    } else {
        console.log('Invalid webhook signature');
        res.status(400).send('Invalid signature');
    }
});

// Success page after payment
app.get('/success', (req, res) => {
    res.send('<h1>Payment was successful!</h1><p>Thank you for your purchase.</p>');
});

// Error page in case of failure
app.get('/error', (req, res) => {
    res.send('<h1>Payment failed!</h1><p>Please try again.</p>');
});

// Start the server on port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});