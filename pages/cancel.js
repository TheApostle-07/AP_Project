// pages/cancel.js
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../styles/Payment.module.css';

export default function CancelPage() {
  const router = useRouter();

  const handleRetry = () => {
    // Redirect the user to the payment page so they can try again.
    router.push('/payment');
  };

  return (
    <>
      <Head>
        <title>Payment Cancelled - ALINA POPOVA</title>
        <meta name="description" content="Your payment was cancelled. Please try again." />
      </Head>
      <div className={styles.container}>
        <h1 className={styles.cancelTitle}>Payment Cancelled</h1>
        <p className={styles.cancelMessage}>
          Your payment has been cancelled. If this was an error, please click the button below to try again.
        </p>
        <button className={styles.retryButton} onClick={handleRetry}>
          Retry Payment
        </button>
      </div>
    </>
  );
}