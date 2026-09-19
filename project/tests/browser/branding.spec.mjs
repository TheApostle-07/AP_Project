import { test, expect } from '@playwright/test';

test('booking handoff has the supplied logo and remains usable when a link is unavailable', async ({page}) => {
  await page.route('http://localhost:4308/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const headers = response.headers();
    headers['content-security-policy'] = headers['content-security-policy'].replace(/;?\s*upgrade-insecure-requests/g, '');
    await route.fulfill({response, headers});
  });
  await page.route('**/api/handoff/status', route => route.fulfill({status:404,json:{message:'This payment link is unavailable.'}}));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/pay');
    const brand = page.getByRole('link',{name:'Alina home'});
    await expect(brand).toHaveText('ALINA');
    await expect.poll(()=>brand.locator('img').evaluate(image=>image.complete && image.naturalWidth===96)).toBe(true);
    await expect(page.getByRole('link',{name:'Back to Alina'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('Razorpay receives the merchant logo without changing the server-owned amount', async ({page}) => {
  await page.route('http://localhost:4308/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const headers = response.headers();
    headers['content-security-policy'] = headers['content-security-policy'].replace(/;?\s*upgrade-insecure-requests/g, '');
    await route.fulfill({response, headers});
  });
  await page.route('**/api/handoff/status', route => route.fulfill({json:{checkout:{
    reference:'AP-AABBCCDDEEFF00112233',creatorName:'Test creator',experienceName:'Private video call',
    amountMinor:399900,currency:'INR',durationMinutes:20,timezone:'Asia/Kolkata',
    sessionStart:'2027-01-01T12:00:00Z',sessionEnd:'2027-01-01T12:20:00Z',expiresAt:new Date(Date.now()+600000).toISOString(),
  }}}));
  await page.route('**/api/order', route => route.fulfill({json:{checkout:{keyId:'rzp_test_fixture',orderId:'order_fixture',amountMinor:399900,currency:'INR',description:'Private session'}}}));
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({contentType:'application/javascript',body:'window.Razorpay=class {constructor(options){window.__brandCheckout=options;} on(){} open(){} };'}));
  await page.goto('/pay');
  await page.getByRole('button',{name:'Pay ₹3,999 & book'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__brandCheckout?.image)).toBe('http://localhost:4308/brand/alina-ap-v1-96.png');
  expect(await page.evaluate(()=>({amount:window.__brandCheckout.amount,currency:window.__brandCheckout.currency,order:window.__brandCheckout.order_id}))).toEqual({amount:399900,currency:'INR',order:'order_fixture'});
});
