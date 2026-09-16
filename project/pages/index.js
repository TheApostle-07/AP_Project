import Head from 'next/head';
import Image from 'next/image';
import { useState } from 'react';
import { artworks, artworkPrice } from '../lib/artwork-catalog.mjs';

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

        <section className="legacy-catalog" aria-labelledby="legacy-catalog-title">
          <h1 id="legacy-catalog-title" className="sr-only">Digital artwork</h1>
          {artworks.map((artwork, index) => (
            <article className="legacy-product" aria-labelledby={`${artwork.id}-title`} key={artwork.id}>
              <Image
                className="legacy-product-image"
                src={artwork.image}
                alt={artwork.title}
                width={1024}
                height={1024}
                sizes="(max-width: 560px) calc(100vw - 50px), (max-width: 899px) 350px, (max-width: 1287px) calc((100vw - 88px) / 3 - 50px), 350px"
                preload={index === 0}
              />
              <div className="legacy-product-details">
                <h2 id={`${artwork.id}-title`}>{artwork.title}</h2>
                <p className="legacy-description">{artwork.description}</p>
                <p className="legacy-price"><span className="sr-only">Price: </span>{artworkPrice(artwork.amountMinor)}</p>
                <a className="legacy-purchase" href={`/artwork/${artwork.id}`} aria-label={`Buy ${artwork.title}`}>Buy artwork</a>
                <p className="legacy-delivery">Digital PNG · Download after payment</p>
              </div>
            </article>
          ))}
        </section>

        <footer className="legacy-footer"><p>© 2026 ALINA POPOVA. All rights reserved.</p></footer>
      </main>
    </>
  );
}
