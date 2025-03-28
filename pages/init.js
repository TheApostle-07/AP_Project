// pages/init.js

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function InitPage() {
  const router = useRouter();
  const { token, product_id, price } = router.query;

  useEffect(() => {
    // If dynamic parameters are provided, redirect automatically to the payment page.
    if (token && product_id && price) {
      router.push(`/payment?token=${token}&product_id=${product_id}&price=${price}`);
    }
  }, [token, product_id, price, router]);

  const handleProceed = () => {
    // In static mode, redirect to payment page without dynamic query parameters.
    router.push('/payment');
  };

  return (
    <>
      <Head>
        <title>Initialize Payment - ALINA POPOVA</title>
        <meta name="description" content="Initializing the payment process for ALINA POPOVA." />
      </Head>
      <div style={styles.container}>
        <h1 style={styles.heading}>Welcome to ALINA POPOVA Payment</h1>
        {token && product_id && price ? (
          <p style={styles.message}>Redirecting you to payment page...</p>
        ) : (
          <>
            <p style={styles.message}>
              No dynamic session detected. Proceed with a static payment demo.
            </p>
            <button style={styles.button} onClick={handleProceed}>
              Proceed to Payment
            </button>
          </>
        )}
      </div>
    </>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    backgroundColor: '#111d4a', // using --space-cadet color
    color: '#fff8f0',          // using --floral-white color for text
    textAlign: 'center',
  },
  heading: {
    fontSize: '2.5rem',
    marginBottom: '20px',
    fontFamily: 'Montserrat, sans-serif',
  },
  message: {
    fontSize: '1.2rem',
    marginBottom: '20px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '1.1rem',
    backgroundColor: '#92140c', // using --penn-red
    color: '#fff8f0',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s ease',
  },
};