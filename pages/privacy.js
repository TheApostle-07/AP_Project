// pages/privacy.js
import Head from 'next/head';

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy - ALINA POPOVA</title>
        <meta name="description" content="Read our Privacy Policy at ALINA POPOVA" />
      </Head>

      <header>
        <div className="logo-container">
          <img src="/images/APlogo.png" alt="Brand Logo" />
          <h1 className="brand-name">ALINA POPOVA</h1>
        </div>
        <nav>
          <ul className="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/aboutus">About Us</a></li>
            <li><a href="/privacy" className="active">Privacy Policy</a></li>
            <li><a href="/contact">Contact Us</a></li>
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

      <main className="privacy-policy">
        <h2>Privacy Policy</h2>
        <p>
          This Privacy Policy explains how ALINA POPOVA collects, uses, and protects your personal information.
          By using our website, you agree to the collection and use of information in accordance with this policy.
        </p>

        <h3>Information Collection</h3>
        <p>
          We collect information that you provide directly to us when you create an account, make a purchase, or
          contact us for support. This information may include your name, email address, phone number, and payment details.
        </p>

        <h3>Use of Information</h3>
        <p>
          Your information is used to process transactions, improve our services, and communicate with you about your
          account or our offerings. We also use this data to personalize your experience and send you promotional materials.
        </p>

        <h3>Sharing of Information</h3>
        <p>
          We do not sell your personal information to third parties. We may share your data with trusted partners
          who assist us in operating our website, conducting our business, or servicing you, provided that those parties agree to keep this information confidential.
        </p>

        <h3>Security</h3>
        <p>
          The security of your personal information is important to us. We use a variety of security measures to
          maintain the safety of your personal data when you place an order or enter, submit, or access your personal information.
        </p>

        <h3>Changes to This Policy</h3>
        <p>
          We may update our Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date.
        </p>

        <p>
          If you have any questions about this Privacy Policy, please <a href="/contact">contact us</a>.
        </p>
      </main>

      <footer>
        <p>&copy; 2024 ALINA POPOVA. All rights reserved.</p>
      </footer>
    </>
  );
}