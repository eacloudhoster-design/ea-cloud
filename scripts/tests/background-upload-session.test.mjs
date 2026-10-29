// Real cookie-session middleware/auth routes with disposable PostgreSQL and R2 fixtures.
// No production credentials, DATABASE_URL, accounts or storage are used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sessionFixture} from './helpers/browser-session-fixture.mjs';
import {appRequest} from './helpers/in-process-http.mjs';
import {requestBackgroundUpload,storedBackground} from '../../functions/_lib/background-storage.js';

test('approved mentors upload all four images through the actual cookie authentication boundary',{skip:!process.env.PGLITE_MODULE&&'Set PGLITE_MODULE for isolated PostgreSQL'},async()=>{
 const {app,engine}=await sessionFixture();const nativeFetch=globalThis.fetch;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZbN8AAAAASUVORK5CYII=','base64');
 const objects=new Map();let verifications=0;
 const env={BACKEND_ORIGIN:'https://backend.example',BACKGROUND_IMAGES:{
  async put(key,bytes,options){if(objects.has(key))return null;objects.set(key,{bytes,options});return{key};},
  async get(key){const item=objects.get(key);return item?{body:item.bytes,size:item.bytes.length,httpEtag:'"fixture"',writeHttpMetadata(h){h.set('Content-Type',item.options.httpMetadata.contentType);}}:null;}
 }};
 const login=async(email,client=false)=>{const r=await appRequest(app,'https://backend.example/api/'+(client?'app/login':'auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Test-only-pass-123!'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 const ticket=cookie=>requestBackgroundUpload({env,request:new Request('https://site.example/api/storage/uploads/request-url',{method:'POST',headers:{Cookie:cookie,Origin:'https://site.example','Content-Type':'application/json'},body:JSON.stringify({name:'mode.png',size:png.length,contentType:'image/png'})})});
 const put=(url,cookie)=>storedBackground({env,request:new Request(url,{method:'PUT',headers:{Cookie:cookie,Origin:'https://site.example','Content-Type':'image/png'},body:png})});
 try{
 await engine.exec("INSERT INTO users(id,email,password,role,status) SELECT 4,'mentor4@example.invalid',password,'mentor','approved' FROM users WHERE id=1");
 await engine.exec("UPDATE users SET status='approved' WHERE id=3");
 const mentor=await login('mentor1@example.invalid'),other=await login('mentor4@example.invalid'),owner=await login('superadmin2@example.invalid'),pending=await login('mentor3@example.invalid'),client=await login('client@example.invalid',true);
 await engine.exec("UPDATE users SET status='pending' WHERE id=3");
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://backend.example/api/auth/me');assert.equal(options.headers.Authorization,undefined);assert.match(options.headers.Cookie,/^ea_portal_session=[a-f0-9]{64}$/);verifications++;
  // Use the actual API session verifier and /auth/me endpoint, not an unconditional mock.
  return appRequest(app,String(url),{headers:options.headers});
 };
 for(const cookie of [mentor,other])for(const mode of ['normal','beast','aggressive','ultimate']){
  const response=await ticket(cookie);assert.equal(response.status,200,mode+' upload ticket must accept signed-in mentor');const meta=await response.json();
  assert(meta.objectPath.startsWith(cookie===mentor?'/r2/1/':'/r2/4/'));
  assert.equal((await put(meta.uploadURL,cookie)).status,200);
  assert.equal((await storedBackground({env,request:new Request(meta.uploadURL)})).status,200,'saved files remain readable');
  assert.equal((await put(meta.uploadURL,cookie===mentor?other:mentor)).status,403,'another mentor cannot overwrite this account');
 }
 assert.equal(objects.size,8);assert(verifications>=24);
 assert.equal((await ticket(owner)).status,200,'existing approved owner access remains');
 assert.equal((await ticket(pending)).status,403,'pending account is not approved');
 assert.equal((await ticket(client)).status,401,'a client cookie cannot act as a mentor');
 await engine.exec("UPDATE browser_sessions SET expires_at=now()-interval '1 day' WHERE account_id=4 AND kind='portal'");assert.equal((await ticket(other)).status,401,'expired sessions rejected');
 await engine.exec("DELETE FROM browser_sessions WHERE account_id=1 AND kind='portal'");assert.equal((await ticket(mentor)).status,401,'revoked sessions rejected');
 assert.equal(objects.size,8,'failed checks do not change storage');
 }finally{globalThis.fetch=nativeFetch;await engine.close();delete globalThis.__sessionDb;delete globalThis.__sessionPool;delete globalThis.__sessionSchema;}
});
