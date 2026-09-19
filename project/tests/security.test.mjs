import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { transformSync } from 'esbuild';

const require=createRequire(import.meta.url);
function load(file,mocks={}) {
  const module={exports:{}};
  const code=transformSync(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{format:'cjs',platform:'node'}).code;
  new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),module,module.exports);
  return module.exports;
}
const security=load('lib/security.js',{'./db':{query:async()=>[{count:1}]}});

test('payment origin rejects forwarded-host spoofing, downgrade and local-host lookalikes',()=>{
  const check=headers=>security.requestIsSameOrigin({headers:{host:'pay.example.com',...headers}});
  assert.equal(check({origin:'https://pay.example.com'}),true);
  assert.equal(check({referer:'https://pay.example.com/pay'}),true);
  for(const headers of [{},{origin:'null'},{origin:'http://pay.example.com'},
    {origin:'https://evil.example','x-forwarded-host':'evil.example'},
    {origin:'https://pay.example.com','sec-fetch-site':'cross-site'},
    {host:'localhost.evil.example',origin:'http://localhost.evil.example'}])assert.equal(check(headers),false);
});

test('malformed cookies are rejected without throwing or leaking internal errors',()=>{
  assert.equal(security.readCookie({headers:{cookie:'session=%E0%A4%A'}},'session'),null);
  assert.equal(security.readCookie({headers:{cookie:'other=a; session=private-token'}},'session'),'private-token');
  assert.equal(security.readCookie({headers:{}},'session'),null);
});

test('raw payment webhooks cannot buffer unlimited chunks or dishonest lengths',async()=>{
  const request=(chunks,headers={})=>Object.assign(Readable.from(chunks),{headers});
  assert.equal(await security.readWebhookBody(request(['{"event":','"payment.captured"}'])),'{"event":"payment.captured"}');
  assert.equal(await security.readWebhookBody(request(['x'],{'content-length':'70000'})),null);
  assert.equal(await security.readWebhookBody(request([Buffer.alloc(40000),Buffer.alloc(40000)],{'content-length':'1'})),null);
});

test('invalid handoffs and blocked requests never query private checkout records',async()=>{
  let lookups=0;
  const handler=load('pages/api/handoff/open.js',{
    '../../../lib/handoff':{getHandoffByToken:async()=>{lookups++;return null;}},
    '../../../lib/db':{},'../../../lib/security':{...security,enforceRequestRateLimit:async()=>false},
  }).default;
  const response=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(body){return {status:this.statusCode,body};}});
  const request=body=>({method:'POST',headers:{host:'pay.example.com',origin:'https://pay.example.com'},body});
  assert.equal((await handler(request({token:'bad'}),response())).status,404);
  assert.equal((await handler(request({token:'a'.repeat(43)}),response())).status,429);
  assert.equal(lookups,0);
});
