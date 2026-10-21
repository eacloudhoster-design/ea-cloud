import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const bundle=await build({entryPoints:['artifacts/api-server/src/lib/scanner-access.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {evaluateScannerAccess:check}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-10-21T12:00:00Z'),client={id:7,status:'approved'},active={status:'active',expiresAt:new Date(now+1000)};
test('valid separate scanner subscription or deliberate indefinite admin grant allows access without hosting rights',()=>{
 assert.equal(check({...client,licenseKey:null,mentorId:null},active,now).allowed,true);
 assert.equal(check(client,{...active,expiresAt:null},now).allowed,true);
});
test('hosting licences and client registration plans cannot grant scanner access',()=>{
 const decision=check({...client,plan:'lifetime',licenseKey:'active-hosting',scannerAccess:true},null,now);
 assert.equal(decision.allowed,false);assert.equal(decision.code,'SCANNER_ACCESS_REQUIRED');
});
test('expired, revoked, invalid and exact-boundary grants fail closed',()=>{
 for(const grant of [{...active,expiresAt:new Date(now)},{...active,expiresAt:new Date(now-1)},{...active,expiresAt:new Date(NaN)},{...active,status:'expired'},{...active,status:'revoked'},{...active,status:'pending'}]){
  const decision=check(client,grant,now);assert.equal(decision.allowed,false);assert.equal(decision.status,403);assert.equal(decision.category,'access');assert.equal(decision.retryable,false);
 }
});
test('grant never overrides approval or missing session',()=>{
 assert.equal(check(null,active,now).status,401);
 for(const status of ['pending','rejected','revoked'])assert.equal(check({...client,status},active,now).code,'SCANNER_ACCOUNT_NOT_APPROVED');
});
