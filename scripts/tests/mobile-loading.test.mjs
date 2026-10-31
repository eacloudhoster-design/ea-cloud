import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../../artifacts/ea-app/src/lib/request.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('hanging connection times out and aborts', async () => {
  let signal;
  globalThis.fetch = async (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  await assert.rejects(requestJson('/api/app/me', {}, 10), /too long/);
  assert.equal(signal.aborted, true);
});
test('hanging response body also times out', async () => {
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(requestJson('/api/app/dashboard', {}, 10), /too long/);
});
test('only authentication rejection carries 401; outage is recoverable', async () => {
  for (const status of [401, 502, 503]) {
    globalThis.fetch = async () => new Response('', { status });
    await assert.rejects(requestJson('/api/app/me'), error => error.status === status);
  }
});
test('invalid JSON is actionable and successful branding stays intact', async () => {
  globalThis.fetch = async () => new Response('<html>');
  await assert.rejects(requestJson('/api/app/dashboard'), /invalid response/);
  const data = { mentor: { robotName: 'Custom mentor bot', backgroundImageUrl: '/api/storage/backgrounds/custom.png' } };
  globalThis.fetch = async () => Response.json(data);
  assert.deepEqual(await requestJson('/api/app/dashboard'), data);
});
test('diagnostics distinguish session schema, proxy configuration, throttling and permission failures without private responses',async()=>{
 for(const [status,code,category,retryable] of [[503,'SESSION_STORAGE_SCHEMA_UNAVAILABLE','configuration',true],[503,'API_BACKEND_NOT_CONFIGURED','configuration',true],[429,'UNKNOWN_PRIVATE_CODE','rate_limit',true],[403,'UNKNOWN_PRIVATE_CODE','authorization',false]]){
  globalThis.fetch=async()=>Response.json({error:'PRIVATE password and query',code},{status,headers:{'Retry-After':'20'}});
  await assert.rejects(requestJson('/api/app/me'),e=>e.status===status&&e.category===category&&e.retryable===retryable&&!e.message.includes('PRIVATE')&&e.retryAfterMs>=20000);
 }
});
test('caller cancellation is bounded even when fetch ignores abort; cookies remain same-origin',async()=>{
 const controller=new AbortController();let credentials;
 globalThis.fetch=async(_url,init)=>{credentials=init.credentials;return new Promise(()=>{});};
 const pending=requestJson('/api/app/me',{signal:controller.signal},10000);controller.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(credentials,'same-origin');
});
