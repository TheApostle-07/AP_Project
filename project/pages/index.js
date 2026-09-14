import Head from 'next/head';
import Image from 'next/image';
import { useState } from 'react';

const bookingOrigin = process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app';

const policyLinks = [
  ['Terms & Conditions', 'https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/terms'],
  ['Cancellation & Refund', 'https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/refund'],
  ['Shipping & Delivery', 'https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/shipping'],
];

export default function ApprovedMerchantHome() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Head>
        <title>Product Payment · Alina Popova</title>
        <meta name="description" content="Alina Popova digital art and secure private creator sessions." />
      </Head>
      <main className="legacy-home">
        <header className="legacy-header">
          <a className="legacy-logo" href="/" aria-label="Alina Popova home">
            <Image src="/images/APlogo.png" alt="Alina Popova" width={60} height={60} priority />
            <span>ALINA POPOVA</span>
          </a>
          <nav aria-label="Main navigation">
            <button className="legacy-menu-button" type="button" aria-expanded={menuOpen} aria-controls="legacy-navigation" onClick={() => setMenuOpen((current) => !current)}>
              <span /><span /><span /><span className="sr-only">Menu</span>
            </button>
            <ul id="legacy-navigation" className={menuOpen ? 'legacy-nav is-open' : 'legacy-nav'}>
              <li><a className="active" href="/">Home</a></li>
              <li><a href="/aboutus">About Us</a></li>
              <li><a href="/privacy">Privacy Policy</a></li>
              <li><a href="/contact">Contact Us</a></li>
              {policyLinks.map(([label, href]) => <li key={href}><a href={href} rel="noreferrer">{label}</a></li>)}
            </ul>
          </nav>
        </header>

        <section className="legacy-product" aria-labelledby="legacy-product-title">
          <Image className="legacy-product-image" src="/images/APlogo.png" alt="Portrait of Timeless Beauty" width={350} height={350} priority />
          <div className="legacy-product-details">
            <h1 id="legacy-product-title">Portrait of Timeless Beauty</h1>
            <p className="legacy-description">This digital masterpiece embodies the delicate balance between strength and softness, capturing the timeless beauty of a woman whose presence radiates warmth and allure.</p>
            <p className="legacy-original-price">Original Price: ₹99</p>
            <p className="legacy-price">Discounted Price: ₹9</p>
            <a className="legacy-buy" href={`${bookingOrigin}/@alina-popova`}>Explore creator sessions</a>
          </div>
        </section>

        <footer className="legacy-footer"><p>© 2026 ALINA POPOVA. All rights reserved.</p></footer>
      </main>
    </>
  );
}
