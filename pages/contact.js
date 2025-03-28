// pages/contact.js
import Head from 'next/head';
import { useState } from 'react';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Add your form submission logic here (e.g., call an API)
    console.log('Form data:', formData);
    setSubmitted(true);
  };

  return (
    <>
      <Head>
        <title>Contact Us - ALINA POPOVA</title>
        <meta
          name="description"
          content="Get in touch with ALINA POPOVA for inquiries, support, or more information."
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
              <a href="/aboutus">About Us</a>
            </li>
            <li>
              <a href="/privacy">Privacy Policy</a>
            </li>
            <li>
              <a href="/contact" className="active">
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

      <main className="contact-us">
        <h2>Contact Us</h2>
        <p>
          We'd love to hear from you! Please fill out the form below and we will
          get in touch with you shortly.
        </p>
        {submitted ? (
          <p>Thank you for contacting us! We will get back to you soon.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="name">Name:</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />

            <label htmlFor="email">Email:</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <label htmlFor="message">Message:</label>
            <textarea
              id="message"
              name="message"
              rows="5"
              value={formData.message}
              onChange={handleChange}
              required
            ></textarea>

            <button type="submit">Send Message</button>
          </form>
        )}
      </main>

      <footer>
        <p>&copy; 2024 ALINA POPOVA. All rights reserved.</p>
      </footer>
    </>
  );
}