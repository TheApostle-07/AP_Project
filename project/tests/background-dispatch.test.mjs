import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsBookingDispatch, withBookingDispatch } from '../lib/background-dispatch.mjs';

test('only booking-producing mutations request a main-site wakeup', () => {
  for (const sql of ['UPDATE bookings SET id=id','SELECT record_checkout_capture($1)','WITH x AS (INSERT INTO fulfilment_jobs DEFAULT VALUES) SELECT 1']) assert.equal(needsBookingDispatch(sql),true);
  for (const sql of ['SELECT * FROM bookings FOR UPDATE','INSERT INTO artwork_purchases DEFAULT VALUES','INSERT INTO rate_limits SELECT id FROM bookings']) assert.equal(needsBookingDispatch(sql),false);
});
test('bridge persists recovery before commit and retains committed success when prompt dispatch fails', async () => {
  const oldFetch=globalThis.fetch, keys=['VERCEL_ENV','FULFILMENT_DISPATCH_SECRET','NEXT_PUBLIC_BOOKING_ORIGIN'];
  const old=Object.fromEntries(keys.map(key=>[key,process.env[key]])), calls=[];
  process.env.VERCEL_ENV='production';process.env.FULFILMENT_DISPATCH_SECRET='isolated-test';process.env.NEXT_PUBLIC_BOOKING_ORIGIN='https://alina.test';
  let failure=null,writes=0;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url.toString(),'https://alina.test/api/internal/dispatch');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer isolated-test');
    const {action}=JSON.parse(options.body);calls.push(action);
    if(action===failure)throw Error('OFFLINE');
    return Response.json({scheduled:true});
  };
  try {
    assert.equal(await withBookingDispatch('UPDATE bookings SET id=id',async()=>{assert.deepEqual(calls,['arm']);return ++writes;}),1);
    assert.deepEqual(calls,['arm','dispatch']);
    failure='arm';
    await assert.rejects(withBookingDispatch('UPDATE bookings SET id=id',async()=>++writes));
    assert.equal(writes,1);
    failure='dispatch';const error=console.error;console.error=()=>{};
    try {assert.equal(await withBookingDispatch('UPDATE bookings SET id=id',async()=>++writes),2);}finally{console.error=error;}
    const count=calls.length;
    await withBookingDispatch('SELECT * FROM bookings',async()=>[]);
    assert.equal(calls.length,count);
    delete process.env.FULFILMENT_DISPATCH_SECRET;
    await assert.rejects(withBookingDispatch('UPDATE bookings SET id=id',async()=>++writes),/NOT_CONFIGURED/);
    assert.equal(writes,2);
  } finally {
    globalThis.fetch=oldFetch;
    for(const key of keys)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];
  }
});
