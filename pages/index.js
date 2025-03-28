// pages/index.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Script from 'next/script';
import styles from '../styles/Payment.module.css'; // Local CSS for dynamic mode

export default function PaymentPage() {
  const router = useRouter();
  const { token, product_id } = router.query;

  // If both token & product_id exist, we consider "dynamic mode"
  const isDynamic = !!token && !!product_id;

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [razorLoaded, setRazorLoaded] = useState(false);
  const [orderId, setOrderId] = useState(null);

  // Static product details for static mode
  const staticProductDetails = {
    name: 'Portrait of Timeless Beauty',
    description:
      'This digital masterpiece embodies the delicate balance between strength and softness, capturing the timeless beauty of a woman whose presence radiates warmth and allure.',
    price: 99,
    discountedPrice: 9,
    thumbnailUrl: '/images/APlogo.png',
    contentReference: 'https://placeholder.megafile.link',
  };

  // On load, fetch data
  useEffect(() => {
    if (isDynamic) {
      // Validate token & product together
      setLoading(true);
      fetch(
        `http://localhost:3001/api/validate-token-and-product?token=${token}&product_id=${product_id}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            // If the backend returns an error, show it
            setError(data.error);
          } else if (data.product) {
            // If valid, store the product details
            setProduct(data.product);
          } else {
            // Fallback if no product returned
            setError('Invalid token or product.');
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('Error validating token/product:', err);
          setError('Error validating token/product');
          setLoading(false);
        });
    } else {
      // Static mode: use the predefined product
      setProduct(staticProductDetails);
      setLoading(false);
    }
  }, [isDynamic, token, product_id]);

  // Helper: compute discounted price
  const getDiscountedPrice = (prod) => {
    if (!prod) return 0;
    if (prod.discount) {
      if (prod.discount.amount) return prod.price - prod.discount.amount;
      if (prod.discount.percentage)
        return prod.price - (prod.price * prod.discount.percentage) / 100;
    }
    return prod.discountedPrice || prod.price;
  };

  // Create an order via your backend
  const createRazorOrder = async (amountInPaise) => {
    try {
      const res = await fetch('/api/init-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInPaise }),
      });
      const data = await res.json();
      return data.order?.id;
    } catch (err) {
      console.error('Error creating order:', err);
      setError('Error initializing payment. Please try again later.');
      return null;
    }
  };

  // Handle Buy Now click
  const handleBuyNow = async () => {
    if (!product) return;

    const finalPrice = getDiscountedPrice(product);
    const amountInPaise = finalPrice * 100;

    if (!razorLoaded || typeof window.Razorpay === 'undefined') {
      setError('Payment gateway not loaded. Please try again later.');
      return;
    }

    // Create an order for both modes
    const order_id = await createRazorOrder(amountInPaise);
    if (!order_id) return;
    setOrderId(order_id);

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY,
      amount: amountInPaise,
      currency: 'INR',
      order_id: order_id,
      name: product.name,
      description: product.description,
      image: product.thumbnailUrl,
      handler: function (response) {
        if (isDynamic) {
          // On success, dynamic mode -> /payment-success
          router.push(
            `http://localhost:3001/api/payment-success?token=${token}&order_id=${response.razorpay_order_id}&payment_id=${response.razorpay_payment_id}`
          );
        } else {
          // On success, static mode -> content link
          router.push(product.contentReference);
        }
      },
      prefill: { email: '' },
      theme: { color: '#92140c' },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function () {
      setError('Payment failed. Please try again.');
    });
    rzp.open();
  };

  // Loading UI
  if (loading) {
    return (
      <>
        <Head>
          <title>Processing Payment...</title>
        </Head>
        <div className={styles.loading}>Loading product details...</div>
      </>
    );
  }

  // Error UI
  if (error) {
    return (
      <>
        <Head>
          <title>Error</title>
        </Head>
        <div className={styles.error}>{error}</div>
      </>
    );
  }

  // =========================================
  // DYNAMIC MODE (valid token & product)
  // =========================================
  if (isDynamic) {
    return (
      <>
        <Head>
          <title>Pay for {product.name}</title>
          <meta name="description" content={`Pay for ${product.name}`} />
        </Head>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
          onLoad={() => setRazorLoaded(true)}
          onError={() => setError('Failed to load payment gateway. Please try again later.')}
        />

        <div className={styles.dynamicContainer}>
          {/* Dynamic header above the card */}
          <div className={styles.dynamicHeader}>
            <h3>For Security reasons</h3>
            <p>This is Your Dynamic Art</p>
            <p className={styles.postCardMessage}>
            <i>Don't worry you will be redirected to the file</i>
          </p>
          </div>

          {/* Payment card */}
          <div className={styles.dynamicCard}>
            <div className={styles.dynamicImage}>
              <img src={product.thumbnailUrl} alt={product.name} />
            </div>
            <div className={styles.dynamicDetails}>
              <h2 className={styles.productTitle}>{product.name}</h2>
              <p className={styles.productDesc}>{product.description}</p>
              <p className={styles.originalPrice}>
                Original Price: ₹{product.price}
              </p>
              <p className={styles.discountedPrice}>
                Discounted Price: ₹{getDiscountedPrice(product)}
              </p>
              <button
                className={styles.buyNowBtn}
                onClick={handleBuyNow}
                disabled={!razorLoaded}
              >
                {razorLoaded
                  ? `Buy Now @ ₹${getDiscountedPrice(product)}`
                  : 'Loading Payment Gateway...'}
              </button>
            </div>
          </div>

          {/* Message below the card */}
         

          <footer className={styles.dynamicFooter}>
            <p>&copy; 2024 ALINA POPOVA. All rights reserved.</p>
          </footer>
        </div>
      </>
    );
  }

  // =========================================
  // STATIC MODE (no token or product_id)
  // =========================================
  return (
    <>
      <Head>
        <title>Product Payment</title>
        <meta name="description" content="Product Payment" />
        <link rel="stylesheet" href="/styles.css" />
      </Head>

      <header>
        <div className="logo-container">
          <img src="/images/APlogo.png" alt="Brand Logo" />
          <h1 className="brand-name">ALINA POPOVA</h1>
        </div>
        <nav>
          <div className="burger-menu" id="burger-menu">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
          </div>
          <ul className="nav-links" id="nav-links">
            <li>
              <a href="/" className="active">
                Home
              </a>
            </li>
            <li>
              <a href="/aboutus">About Us</a>
            </li>
            <li>
              <a href="/privacy">Privacy Policy</a>
            </li>
            <li>
              <a href="/contact">Contact Us</a>
            </li>
            <li>
              <a href="https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/terms">
                Terms &amp; Conditions
              </a>
            </li>
            <li>
              <a href="https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/refund">
                Cancellation &amp; Refund
              </a>
            </li>
            <li>
              <a href="https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/shipping">
                Shipping &amp; Delivery
              </a>
            </li>
          </ul>
        </nav>
      </header>

      <div className="container">
        <div className="product-image">
          <img src="/images/APlogo.png" alt="Product Thumbnail" />
        </div>
        <div className="product-details">
          <h2>{product.name}</h2>
          <p className="description">{product.description}</p>
          <p className="price">Original Price: ₹{product.price}</p>
          <p className="discounted-price">
            Discounted Price: ₹{product.discountedPrice}
          </p>
          <button
            id="buy-button"
            className="buy-now"
            onClick={handleBuyNow}
          >
            Buy Now @ ₹{product.discountedPrice}
          </button>
        </div>
      </div>

      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setRazorLoaded(true)}
        onError={() =>
          setError('Failed to load payment gateway. Please try again later.')
        }
      />
      <Script src="/razorpay.js" strategy="afterInteractive" />
      <Script id="burger-menu-script" strategy="afterInteractive">{`
        document.getElementById('burger-menu').addEventListener('click', function () {
          const navLinks = document.getElementById('nav-links');
          navLinks.classList.toggle('nav-active');
        });
      `}</Script>

      <footer>
        <p>&copy; 2024 ALINA POPOVA. All rights reserved.</p>
      </footer>
    </>
  );
}