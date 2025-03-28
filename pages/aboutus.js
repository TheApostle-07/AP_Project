// pages/aboutus.js
import Head from 'next/head';

export default function AboutUs() {
  return (
    <>
      <Head>
        <title>About Us - ALINA POPOVA</title>
        <meta
          name="description"
          content="Learn more about ALINA POPOVA and our journey."
        />
      </Head>

      <header>
        <div className="logo-container">
          <img src="/images/APlogo.png" alt="Brand Logo" />
          <h1 className="brand-name">ALINA POPOVA</h1>
        </div>
        <nav>
        <ul className="nav-links">
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/aboutus" className="active">About Us</a>
            </li>
            <li>
              <a href="/privacy">Privacy Policy</a>
            </li> 
            <li>
              <a href="/contact" >
                Contact Us
              </a>
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

      <main className="aboutus">
        {/* A container for spacing and layout */}
        <div className="aboutus-content">
          <h2>About ALINA POPOVA</h2>
          <p>
            Welcome to <strong>ALINA POPOVA</strong>! Our journey began with a passion for art
            and a vision to empower creative expression. We believe in the timeless beauty of art,
            blending modern technology with classic inspiration.
          </p>
          <p>
            Our collection is carefully curated to showcase art that resonates, inspires,
            and connects. With a deep respect for tradition and an eye on innovation, we strive
            to deliver an experience that is both immersive and transformative.
          </p>
          <p>
            Thank you for joining us on this creative journey. We invite you to explore our
            collection, learn more about our story, and become a part of the{' '}
            <strong>ALINA POPOVA</strong> experience.
          </p>
        </div>
      </main>

      <footer>
        <p>&copy; 2024 ALINA POPOVA. All rights reserved.</p>
      </footer>
    </>
  );
}