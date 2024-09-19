document.getElementById('buy-button').onclick = function(e) {
    var options = {
        "key": "rzp_live_poKkS9p9jL4HEU",  // Your Razorpay key
        "amount": "900",  // Amount in paise (₹49.00)
        "currency": "INR",
        "name": "Alina Popova",
        "description": "Product Purchase",
        "image": "assets/APlogo.png",  // Path to your brand logo
        "handler": function(response) {
            // Directly redirect after successful payment
            window.location.href = "https://mega.nz/file/LJphjAaD#NMZFFqz1l8RjQa3Jm5CCrb_sykT2d_CrpMibGdoq7qk";
        },
        "prefill": {
            "name": "Customer Name",  // Prefill customer details if available
            "email": "customer@example.com",
            "contact": "9999999999"
        },
        "theme": {
            "color": "#cc444bff"  // Color to match your brand (Bittersweet Shimmer)
        },
        "modal": {
            "ondismiss": function() {
                // Handle modal dismissal, prompt to try payment again
                alert('Payment was not completed. Please try again.');
            }
        }
    };

    var rzp1 = new Razorpay(options);
    rzp1.open();
    e.preventDefault();  // Prevent the default action of the button
};
