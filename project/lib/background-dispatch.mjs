const workMutation = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?"?(?:bookings|checkout_sessions|schedule_reservations|meetings|fulfilment_jobs|notification_events|notification_outbox)"?\b/i;
export function needsBookingDispatch(sql) {
  return workMutation.test(sql) || /\brecord_checkout_capture\s*\(/i.test(sql);
}

async function dispatch(action) {
  const secret = process.env.FULFILMENT_DISPATCH_SECRET?.trim();
  if (!secret) throw new Error('FULFILMENT_DISPATCH_NOT_CONFIGURED');
  const url = new URL(process.env.NEXT_PUBLIC_BOOKING_ORIGIN || 'https://alina-popova-im.vercel.app');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('INVALID_BOOKING_ORIGIN');
  const result = await fetch(new URL('/api/internal/dispatch', url.origin), {
    method: 'POST', redirect: 'error', cache: 'no-store',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }), signal: AbortSignal.timeout(8_000),
  });
  if (!result.ok || (await result.json()).scheduled !== true) throw new Error('FULFILMENT_DISPATCH_UNAVAILABLE');
}

export async function withBookingDispatch(sql, write) {
  if (process.env.VERCEL_ENV !== 'production' || !needsBookingDispatch(sql)) return write();
  // Acknowledge durable recovery before the bounded DB transaction can commit.
  await dispatch('arm');
  try { return await write(); }
  finally {
    // A committed capture remains successful even if the immediate attempt fails.
    // The pre-armed deadline recovers independently of this process/browser.
    await dispatch('dispatch').catch(() => console.error('BOOKING_DISPATCH_RETRY_SCHEDULED'));
  }
}
