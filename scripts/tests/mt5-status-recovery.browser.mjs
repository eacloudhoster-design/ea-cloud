import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.MT5_PREVIEW_ORIGIN || 'http://127.0.0.1:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let reads=0,writes=0,historyReads=0,unavailable=false;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('appClientToken','isolated-browser-fixture'));
 await page.routeWebSocket('**/api/ws?*',()=>{});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();if(route.request().method()!=='GET')writes++;
  let data={};
  if(url.pathname==='/api/app/me')data={status:'approved',licenseKey:'FIXTURE',token:Buffer.from('10:client').toString('base64')};
  if(url.pathname==='/api/app/dashboard')data={mentor:{robotName:'Fixture'},eas:[]};
  if(url.pathname==='/api/app/engine/history'){historyReads++;data={observedAt:new Date().toISOString(),positions:[{ticket:'123',symbol:'EURUSD',volume:.1,price_current:1.1}],orders:[],deals:[{ticket:'456',symbol:'EURUSD',volume:.1,price:1.1,profit:3}],historyOrders:[],truncated:{}};}
  if(url.pathname==='/api/app/engine/status'){
   reads++;if(unavailable)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'ENGINE_STATUS_UNAVAILABLE'})});
   data={clientId:10,observedAt:new Date().toISOString(),account:{login:'91',server:'FixtureDemo',broker:'justmarkets'},connection:{verified:true,code:'VERIFIED_DEMO_READ_ONLY'},copier:{state:'read_only',executionPermitted:false,emergencyStopActive:null}};
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin+'/ea-app/');await page.getByRole('button',{name:'MetaTrader',exact:true}).click();
 const screen=page.getByRole('region',{name:'MT5 Connections'});
 await screen.getByText('Demo connection verified',{exact:true}).waitFor();
 await screen.getByRole('button',{name:'Read broker positions and history',exact:true}).click();
 await screen.getByText('#123 · EURUSD · Volume 0.1 · 1.1',{exact:true}).waitFor();assert.equal(historyReads,1);
 unavailable=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await screen.getByText('Saved account · status unverified',{exact:true}).waitFor();
 assert.equal(await screen.getByText('Demo connection verified',{exact:true}).count(),0);
 unavailable=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await screen.getByText('Demo connection verified',{exact:true}).waitFor();assert.equal(reads,3);
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
 await screen.getByText('Saved account · status unverified',{exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await screen.getByText('Demo connection verified',{exact:true}).waitFor();assert.equal(reads,4);
 await page.getByRole('button',{name:'Home',exact:true}).click();const before=reads;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(100);assert.equal(reads,before);
 await page.getByRole('button',{name:'MetaTrader',exact:true}).click();assert.equal(await screen.getByText('#123 · EURUSD · Volume 0.1 · 1.1',{exact:true}).count(),0);await screen.getByText('Demo connection verified',{exact:true}).waitFor();
 assert.equal(reads,before+1);assert.equal(writes,0);assert.deepEqual(errors,[]);
 console.log('PASS: current mobile MT5 screen verifies, renders bounded broker snapshot, clears on tab exit, recovers online; zero API writes');
}finally{await browser.close();}
