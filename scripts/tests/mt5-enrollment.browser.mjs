// Built frontends + actual cookie-authenticated enrollment routes + disposable PostgreSQL.
import assert from 'node:assert/strict';import express from '../../artifacts/api-server/node_modules/express/index.js';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';import {sessionFixture} from './helpers/browser-session-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');process.env.SESSION_SECRET=randomBytes(32).toString('hex');
const f=await sessionFixture(),dir=await mkdtemp(join(tmpdir(),'ea-enroll-browser-'));let server,browser;
try{
 const schema=globalThis.__sessionSchema,{getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
 for(const key of ['clientSettingsTable','mt5ConnectionsTable']){const c=getTableConfig(schema[key]);await f.engine.exec(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);}
 await f.engine.exec(await readFile('migrations/20261108_mt5_enrollment_requests.sql','utf8'));
 await build({entryPoints:['artifacts/api-server/src/routes/mt5-enrollment.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),logLevel:'silent',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},plugins:[{name:'db',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__sessionDb;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__sessionSchema.${k};`).join('')}`}));}}]});
 const api=await import(pathToFileURL(join(dir,'api.mjs'))),app=express();app.use(express.json());app.use('/api',f.api.browserSessionMiddleware,api.default);app.use(f.app);
 server=app.listen(0,'127.0.0.1');await onceListening(server);const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const role of ['client','mentor']){
  const context=await browser.newContext({viewport:role==='client'?{width:390,height:844}:{width:1280,height:900}});
  const login=await fetch(origin+'/api'+(role==='client'?'/app/login':'/auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role==='client'?'client@example.invalid':'mentor1@example.invalid',password:'Test-only-pass-123!'})});assert.equal(login.status,200);
  const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/Secure/);assert.match(setCookie,/HttpOnly/);const [name,value]=setCookie.split(';')[0].split('=');
  // HTTP loopback fixture only; production cookie flags above remain verified.
  await context.addCookies([{name,value,domain:'127.0.0.1',path:'/api',httpOnly:true,secure:false,sameSite:'Lax'}]);
  await context.addInitScript(()=>localStorage.setItem('ea-cloud:privacy-consent:v1',JSON.stringify({version:1,functional:false,analytics:false,marketing:false,expiresAt:Date.now()+86400000})));
  await context.routeWebSocket('**/api/ws?*',()=>{});let writes=0;const errors=[];
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(route.request().method()!=='GET'){writes++;assert.ok(path.endsWith('mt5-enrollment')||path.endsWith('mt5/enrollment'),'Only explicit enrollment writes expected');}
   if(path.endsWith('mt5-enrollment')||path.endsWith('mt5/enrollment')||path==='/api/app/me'||path==='/api/auth/me')return route.continue();
   let data={};if(path==='/api/app/dashboard')data={mentor:{id:1,robotName:'Fixture'},eas:[]};if(path==='/api/admin/engine/clients')data={clients:[]};if(path==='/api/admin/mt5/connections')data=[];
   if(path==='/api/app/engine/status')data={account:null,connection:{verified:false},copier:{state:'paused'}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+(role==='client'?'/ea-app/':'/admin/mt5-connections'));
  if(role==='client')await page.getByRole('button',{name:'MetaTrader',exact:true}).click();
  const loginValue=role==='client'?'301':'302';
  await page.getByRole('combobox',{name:role==='client'?'Broker':'Mentor broker',exact:true}).selectOption('justmarkets');
  await page.getByPlaceholder(role==='client'?'Enter account number':'e.g. 12345678',{exact:true}).fill(loginValue);
  await page.getByPlaceholder('MT5 account password',{exact:true}).fill('private-fixture-password');
  await page.getByPlaceholder(role==='client'?'Exact server shown by your broker':'e.g. Exness-MT5Real',{exact:true}).fill('FixtureDemo');
  await page.getByRole('button',{name:role==='client'?'Request demo provisioning':'Request dedicated demo provisioning',exact:true}).click();
  const section=page.getByRole(role==='client'?'complementary':'region',{name:role==='client'?'Account provisioning requests':'Mentor account provisioning'});
  await section.getByText(/Awaiting operator provisioning/).waitFor();assert.equal(await page.getByPlaceholder('MT5 account password',{exact:true}).inputValue(),'');
  await page.reload();if(role==='client')await page.getByRole('button',{name:'MetaTrader',exact:true}).click();await section.getByText(/Awaiting operator provisioning/).waitFor();
  assert.equal(writes,1);assert.deepEqual(errors,[]);await context.close();
 }
 const rows=(await f.engine.query('SELECT owner_kind,login,encrypted_password FROM mt5_enrollment_requests ORDER BY login')).rows;
 assert.deepEqual(rows.map(r=>[r.owner_kind,r.login]),[['client','301'],['mentor','302']]);assert.ok(rows.every(r=>r.encrypted_password!=='private-fixture-password'));
 console.log('PASS: built client and mentor provisioning requests persist through reload with real sessions/PostgreSQL, encrypted credentials and no connection or execution calls');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await f.engine.close();await rm(dir,{recursive:true,force:true});}
function onceListening(server){return new Promise(resolve=>server.once('listening',resolve));}
