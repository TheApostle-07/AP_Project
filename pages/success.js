// pages/success.js
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect } from 'react';
import styles from '../styles/Payment.module.css';

export default function SuccessPage() {
  const router = useRouter();
  const { token, order_id, payment_id } = router.query;

  useEffect(() => {
    if (token && order_id && payment_id) {
      // After 3 seconds, redirect to the security checker to finalize payment.
      const timer = setTimeout(() => {
        router.push(
          `/api/payment-success?token=${token}&order_id=${order_id}&payment_id=${payment_id}`
        );
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [token, order_id, payment_id, router]);

  return (
    <>
      <Head>
        <title>Payment Successful - ALINA POPOVA</title>
        <meta
          name="description"
          content="Your payment was successful. Redirecting you to your content..."
        />
      </Head>
      <div className={styles.container}>
        <h1 className={styles.successMessage}>Payment Successful!</h1>
        <p className={styles.redirectMessage}>
          Thank you for your purchase. You will be redirected shortly...
        </p>
      </div>
    </>
  );
}