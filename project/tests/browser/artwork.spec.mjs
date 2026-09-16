import { test, expect } from '@playwright/test';
import { artworks } from '../../lib/artwork-catalog.mjs';

// Network fixtures only: no production credentials, databases or financial transactions.
const access = 'a'.repeat(43);
const pending = { reference:'ART-TESTRECEIPT',artworkId:'rose-reverie',title:'Rose Reverie',amountMinor:399900,currency:'INR',mode:'test',state:'PENDING' };
async function setup(page, { behavior='success', recovered=null, outage=false, scriptBlocked=false, storageBlocked=false }={}) {
  const requests=[]; let paid=false;
  // The isolated server is HTTP. WebKit upgrades even loopback subresources;
  // omit only that directive on local document fixtures, never in app headers.
  await page.route('http://localhost:4308/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch(); const headers = response.headers();
    headers['content-security-policy'] = headers['content-security-policy'].replace(/;?\s*upgrade-insecure-requests/g, '');
    await route.fulfill({response, headers});
  });
  await page.route('https://checkout.razorpay.com/v1/checkout.js', async route => {
    if(scriptBlocked) return route.abort();
    await route.fulfill({contentType:'application/javascript',body:`window.Razorpay=class { constructor(options){this.options=options;} on(){} close(){} open(){
      window.__checkout=this.options;
      ${behavior==='dismiss' ? 'this.options.modal.ondismiss();' : "this.options.handler({razorpay_payment_id:'pay_fixture',razorpay_order_id:'order_fixture',razorpay_signature:'a'.repeat(64)});this.options.modal.ondismiss();"}
    }};`});
  });
  if(storageBlocked) await page.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{get(){throw new Error('Storage denied');}});});
  await page.route('**/api/artwork/**', async route => {
    const request=route.request(); const action=new URL(request.url()).pathname.split('/').pop();
    const body=request.method()==='POST' ? request.postDataJSON() : null; requests.push({action,body});
    if(outage) return route.fulfill({status:503,json:{message:'Artwork checkout is temporarily unavailable. If you attempted payment, don’t pay again—check the payment status shortly.'}});
    if(action==='download') return route.fulfill({contentType:'image/png',body:Buffer.from('fixture-download'),headers:{'content-disposition':'attachment; filename="alina-rose-reverie.png"'}});
    if(action==='order') return route.fulfill({json:{purchase:pending,checkout:{keyId:'rzp_test_fixture',orderId:'order_fixture',amountMinor:399900,currency:'INR',description:'Digital artwork: Rose Reverie'}}});
    if(action==='verify') {paid=true;return route.fulfill({json:{mode:'test',purchase:{...pending,state:'PAID'},accessToken:access}});}
    return route.fulfill({json:{mode:'test',purchase:paid?{...pending,state:'PAID'}:recovered, ...(recovered?{accessToken:access}:{})}});
  });
  return requests;
}

test('catalog links each artwork to its own checkout and preserves policy links', async ({page})=>{
  await setup(page);await page.goto('/');
  for(const artwork of artworks) await expect(page.getByRole('link',{name:`Buy ${artwork.title}`,exact:true})).toHaveAttribute('href',`/artwork/${artwork.id}`);
  await expect(page.getByRole('link',{name:'Explore creator sessions'})).toHaveCount(0);
  await expect(page.locator('a[href*="merchant.razorpay.com/policy/"]')).toHaveCount(3);
  await page.getByRole('link',{name:'Buy Rose Reverie',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Rose Reverie',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Pay ₹3,999 & download'})).toBeEnabled();
});
test('payment callback is verified before download, including modal-close race', async ({page})=>{
  const requests=await setup(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/artwork/rose-reverie');
  await page.getByRole('button',{name:'Pay ₹3,999 & download'}).click();
  await expect(page.getByRole('button',{name:'Download artwork · PNG'})).toBeVisible();
  expect(requests.filter(r=>r.action==='order')).toHaveLength(1);
  expect(requests.find(r=>r.action==='order').body).not.toHaveProperty('amount');
  expect(requests.find(r=>r.action==='verify').body.razorpayOrderId).toBe('order_fixture');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download artwork · PNG'}).click();
  expect((await download).suggestedFilename()).toBe('alina-rose-reverie.png');
  expect(errors).toEqual([]);
});
test('dismissed checkout offers safe status recovery, not fake success', async ({page})=>{
  const requests=await setup(page,{behavior:'dismiss'});await page.goto('/artwork/rose-reverie');
  await page.getByRole('button',{name:'Pay ₹3,999 & download'}).click();
  await expect(page.getByRole('button',{name:'Check payment status'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download artwork · PNG'})).toHaveCount(0);
  expect(requests.filter(r=>r.action==='verify')).toHaveLength(0);
});
test('private link recovers a purchase and clears the fragment', async ({page})=>{
  const requests=await setup(page,{recovered:{...pending,state:'PAID'}});
  await page.goto(`/artwork/rose-reverie#access=${access}`);
  await expect(page.getByRole('button',{name:'Download artwork · PNG'})).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');expect(requests.find(r=>r.action==='status').body.token).toBe(access);
});
test('cookie recovery still allows copying a private link when storage/clipboard are unavailable', async ({page})=>{
  await setup(page,{recovered:{...pending,state:'PAID'},storageBlocked:true});
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied');}}});});
  await page.goto('/artwork/rose-reverie');await page.getByRole('button',{name:'Copy private purchase link'}).click();
  await expect(page.getByRole('textbox')).toHaveValue(`http://localhost:4308/artwork/rose-reverie#access=${access}`);
});
for(const state of ['REFUNDED','REVIEW']) test(`${state} purchases cannot pay again or download`, async ({page})=>{
  await setup(page,{recovered:{...pending,state}});await page.goto('/artwork/rose-reverie');
  await expect(page.getByText(state==='REFUNDED' ? 'This payment has been refunded. Download access is no longer available.' : 'This payment needs review. Please contact support with your receipt. Don’t pay again.')).toBeVisible();
  await expect(page.getByRole('button',{name:/Pay|Download/})).toHaveCount(0);
});
test('provider outage gives a retry/status path and never opens payment', async ({page})=>{
  await setup(page,{outage:true});await page.goto('/artwork/rose-reverie');
  await expect(page.getByText(/Artwork checkout is temporarily unavailable/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Check payment status'})).toBeEnabled();
  await expect(page.getByRole('button',{name:/^Pay /})).toHaveCount(0);
});
test('blocked payment script has an explicit reload action', async ({page})=>{
  await setup(page,{scriptBlocked:true});await page.goto('/artwork/rose-reverie');
  await expect(page.getByRole('button',{name:'Reload checkout'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Loading secure payment…'})).toBeDisabled();
});
for(const width of [320,375,768,1440]) test(`checkout is usable without horizontal overflow at ${width}px`, async ({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await setup(page);await page.goto('/artwork/rose-reverie');
  await expect(page.getByRole('button',{name:'Pay ₹3,999 & download'})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`checkout-${width}.png`),fullPage:true});
});
