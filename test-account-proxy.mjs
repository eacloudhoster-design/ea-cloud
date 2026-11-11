import fs from 'node:fs';
import assert from 'node:assert/strict';
const {onRequest}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('functions/api/[[path]].js','utf8')).toString('base64'));
const original=globalThis.fetch;
const env={BACKEND_ORIGIN:'https://backend.example',BACKEND_PROXY_TOKEN:'a'.repeat(64),MT5_MANAGEMENT_ORIGIN:'https://management.example',MT5_MANAGEMENT_PROXY_TOKEN:'b'.repeat(64)};
let checks=0;
try{
 for(const principal of ['app','admin'])for(const suffix of ['',...['status','select','disconnect'].map(action=>'/11111111-1111-4111-8111-111111111111/'+action)]){
  globalThis.fetch=async req=>{assert.equal(new URL(req.url).hostname,'management.example');assert.equal(req.headers.get('x-ea-cloud-origin-token'),'b'.repeat(64));assert.equal(req.headers.get('cookie'),'ea_fixture_session=FIXTURE');return Response.json({ok:true});};
  const response=await onRequest({request:new Request('https://website.example/api/'+principal+'/mt5-accounts'+suffix,{headers:{cookie:'ea_fixture_session=FIXTURE','x-ea-cloud-origin-token':'spoofed'}}),env});assert.equal(response.status,200);checks++;
 }
 for(const route of ['/api/admin/mt5-account-capabilities','/api/auth/me','/api/app/mt5-accounts/execute-trade','/api/admin/mt5-accounts-extra','/api/observer/sync-position']){
  const managed=route.endsWith('capabilities');
  globalThis.fetch=async req=>{assert.equal(new URL(req.url).hostname,managed?'management.example':'backend.example');assert.equal(req.headers.get('x-ea-cloud-origin-token'),(managed?'b':'a').repeat(64));return Response.json({ok:true});};
  await onRequest({request:new Request('https://website.example'+route),env});checks++;
 }
 console.log('PASS',checks,'owned-account proxy routes, session forwarding, isolated origin credentials, unchanged financial/auth routing; HTTP mocked');
}finally{globalThis.fetch=original;}
