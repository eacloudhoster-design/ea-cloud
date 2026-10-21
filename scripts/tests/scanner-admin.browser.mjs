// Production dashboard UI with isolated fixtures. No server socket or live API needed.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let grant=null,updates=0;
const user={id:1,email:'admin@fixture.test',firstName:'Scanner',lastName:'Admin',role:'superadmin',status:'approved',createdAt:new Date().toISOString()};
await page.addInitScript(()=>localStorage.setItem('token','legacy-portal-fixture'));
const root=resolve('artifacts/ea-cloud/dist');
await page.route('**/*',async route=>{
 const url=new URL(route.request().url()),path=url.pathname;
 if(url.hostname!=='localhost')return route.abort();
 if(path.startsWith('/api/')){
  let data={};const req=route.request();
  if(path==='/api/auth/me')data=user;
  else if(path.endsWith('/scanner/session'))data={token:'opaque-scanner-fixture'};
  else if(path.endsWith('/scanner/readiness'))data={databaseReady:true,ai:{configured:true}};
  else if(path.endsWith('/scanner/users/7')){assert.equal(req.method(),'PUT');const body=req.postDataJSON();grant={status:body.status,creditsRemaining:body.creditsRemaining,expiresAt:body.expiresAt,reference:body.reference,updatedAt:new Date().toISOString()};updates++;data={entitlement:grant};}
  else if(path.endsWith('/scanner/users'))data={users:[{id:7,email:'client@fixture.test',firstName:'Client',lastName:'Seven',accountStatus:'approved',entitlement:grant,access:grant?.status==='active'?{allowed:true}:{allowed:false,error:grant?'Scanner access has been revoked.':'No scanner subscription or admin grant is linked to your account.'}}],hasMore:false};
  else if(path.endsWith('/scanner/test/chart'))data={report:{signal:'NO TRADE',reasoning:'Isolated UI fixture only.',entry:null,stopLoss:null,takeProfit:null},testOnly:true,executionAvailable:false};
  return route.fulfill({json:data});
 }
 const local=resolve(root,'.'+path),file=local.startsWith(root+'/')&&existsSync(local)&&extname(local)?local:root+'/index.html';
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';
 return route.fulfill({contentType:mime,body:readFileSync(file)});
});
try{
 await page.goto('http://localhost/superadmin/scanner');
 await page.getByRole('heading',{name:'AI Scanner Management',exact:true}).waitFor();
 await page.getByLabel('Password',{exact:true}).fill('fixture-password');
 await page.getByRole('button',{name:'Unlock scanner management'}).click();
 await page.getByText('PostgreSQL scanner tables verified').waitFor();
 await page.getByRole('button',{name:'Manage access',exact:true}).click();
 await page.getByLabel('Scan credits (absolute remaining balance)').fill('25');
 await page.getByLabel('Audit / subscription reference').fill('Verified UI test grant');
 await page.getByRole('button',{name:'Save scanner access'}).click();
 await page.getByText('Access active',{exact:true}).waitFor();assert.equal(grant.creditsRemaining,25);
 await page.getByRole('button',{name:'Manage access',exact:true}).click();
 await page.getByLabel('Status',{exact:true}).selectOption('revoked');
 await page.getByRole('button',{name:'Save scanner access'}).click();
 await page.getByText('Scanner access has been revoked.',{exact:true}).waitFor();assert.equal(updates,2);
 await page.getByLabel('Superadmin test chart').setInputFiles({name:'chart.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
 await page.getByRole('button',{name:'Analyse test chart'}).click();await page.getByText('NO TRADE',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 mkdirSync('work/scanner-management-preview',{recursive:true});await page.screenshot({path:'work/scanner-management-preview/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Lock management',exact:true}).click();await page.getByRole('button',{name:'Unlock scanner management'}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: production dashboard unlock, migration readiness, grant/credit edit, revoke, authenticated test UI, 390px layout and lock; isolated fixtures only.');
}finally{await browser.close();}
