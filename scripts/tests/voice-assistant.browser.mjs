import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5217';assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
await mkdir('work/announcement-tests',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const image=await readFile('artifacts/ea-cloud/public/default-robot.jpg');
const report={id:'00000000-0000-4000-8000-000000000007',kind:'chart',strategy:'SMC',createdAt:new Date().toISOString(),report:{signal:'SELL',symbol:'XAUUSD',timeframe:'M15',entry:2750.25,stopLoss:2760.5,takeProfit:2730,reasoning:'Bearish market structure rejects visible resistance.',limitations:null}};
const results=[];
try{
 for(const name of ['Mentor Alpha','Mentor Beta']){
  const spoken=[],writes=[];let connected=false,running=false,failBot=false,scanFail=false,executions=[];
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.addInitScript((blocked)=>{
   localStorage.setItem('appClientToken',btoa('7:client:fixture'));
   localStorage.setItem('ea-cloud:client:7:voice',JSON.stringify({enabled:false,provider:'neural'}));
   localStorage.setItem('ea-cloud:client:7:home-appearance',JSON.stringify({interfaceStyle:'regular',accentColor:'#00c9ed',showBg:true,backgroundAnimation:'none'}));
   window.__speech={calls:[],attempts:[],active:0,max:0,blocked};
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   let current=null,timer=null;const listeners=new EventTarget();
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    getVoices(){return [{name:'Samantha',lang:'en-US',localService:true}];},
    addEventListener:listeners.addEventListener.bind(listeners),removeEventListener:listeners.removeEventListener.bind(listeners),
    get speaking(){return !!current;},resume(){},
    speak(u){window.__speech.attempts.push({text:u.text,splash:!!document.querySelector('.ea-startup')});if(window.__speech.blocked){window.__speech.blocked=false;u.onerror?.({error:'not-allowed'});return;}
     current=u;window.__speech.active++;window.__speech.max=Math.max(window.__speech.max,window.__speech.active);window.__speech.calls.push({text:u.text,at:performance.now(),rate:u.rate});u.onstart?.();timer=setTimeout(()=>{current=null;window.__speech.active--;u.onend?.();},15);},
    cancel(){clearTimeout(timer);if(current){window.__speech.active--;current=null;}}
   }});
   window.SpeechRecognition=class{constructor(){throw Error('Microphone must never be used');}};
  },name==='Mentor Alpha');
  const sockets=[];await context.routeWebSocket('**/api/ws?*',socket=>sockets.push(socket));
  await context.route('https://fonts.**',r=>r.abort());
  await context.route('**/voice-image-*.jpg',r=>r.fulfill({body:image,contentType:'image/jpeg'}));
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON?.bind(request);
   if(request.method()!=='GET')writes.push(path);
   if(path.includes('/assistant/')){throw Error('Announcement made an unnecessary assistant request: '+path);}
   if(path==='/api/app/symbol-configs'){const configs=[{pairName:'XAUUSD',variations:['XAUUSD','XAUUSDm'],selectedSymbol:request.method()==='PATCH'?request.postDataJSON().configs[0].selectedSymbol:null,customLotSize:'0.05'}];await route.fulfill({json:configs});return;}
   if(path.endsWith('/trading-controls')){
    if(request.method()==='PATCH'){if(failBot){await route.fulfill({status:500,json:{error:'failed'}});return;}running=request.postDataJSON().copyingEnabled;}
    await route.fulfill({json:{copyingEnabled:running}});return;
   }
   if(path==='/api/app/scanner/chart'){await route.fulfill(scanFail?{status:503,json:{error:'AI unavailable',code:'AI_UNAVAILABLE',category:'ai',retryable:true}}:{json:report});return;}
   const json=path==='/api/app/me'?{status:'approved',licenseKey:'VALID'}:path==='/api/app/dashboard'?{mentor:{id:5,robotName:name,backgroundImageUrl:'/voice-image-1.jpg'},eas:[]}:path==='/api/app/ea-mode-images'?{eas:[{id:11,name,images:[1,2,3,4].map(i=>`/voice-image-${i}.jpg`)}]}:path.endsWith('/activity/snapshot')?{observedAt:Date.now(),connected:false,engine:false,robotEnabled:false,tradeAllowed:false,account:null,symbols:[]}:path.endsWith('/scanner/status')?{configured:true}:path.endsWith('/scanner/history')?{records:[],hasMore:false}:[];
   await route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__speech.attempts.length),0,'no voice before splash finishes');await page.locator('.ea-startup').waitFor({state:'detached'});await page.waitForFunction(()=>window.__speech.attempts.length>0);assert.ok((await page.evaluate(()=>window.__speech.attempts)).every(attempt=>!attempt.splash));
  const speech=()=>page.evaluate(()=>window.__speech.calls);
  assert.equal((await speech()).length,name==='Mentor Alpha'?0:1,'automatic welcome wherever permitted; blocked browsers await gesture');
  const nav=page.locator('.ea-app-content > .ea-glass-navigation');const originalNav=await nav.boundingBox();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.waitForTimeout(80);
  assert.equal((await speech()).filter(t=>t.text===`Welcome to ${name}.`).length,1,'earliest existing gesture unlocks welcome');
  assert.equal(await page.getByRole('button',{name:'Voice Assistant',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Microphone',exact:true}).count(),0);assert.equal(await page.locator('.ea-voice-controls').count(),0);
  await nav.getByRole('button',{name:'Home',exact:true}).tap();
  failBot=true;await page.getByText('START',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(100);assert.ok((await speech()).some(t=>t.text==='Bot activation failed.'));assert.ok(!(await speech()).some(t=>t.text===`${name} activated.`));
  failBot=false;await page.getByText('START',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(100);assert.ok((await speech()).some(t=>t.text===`${name} activated.`));
  await page.getByText('STOP',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(100);assert.ok((await speech()).some(t=>t.text===`${name} deactivated.`));
  const trade={id:99,status:'pending',signalKind:'OPEN',action:'BUY',symbol:'XAUUSD',ticket:null,retcode:null,updatedAt:new Date().toISOString()};
  for(const socket of sockets)socket.send(JSON.stringify({type:'TRADE_EXECUTION',execution:trade}));await page.waitForTimeout(80);assert.ok(!(await speech()).some(t=>/buy execution/.test(t.text)));
  trade.status='success';trade.ticket='verified-ticket';trade.retcode=10009;
  for(const socket of sockets)socket.send(JSON.stringify({type:'TRADE_EXECUTION',execution:trade}));await page.waitForTimeout(80);
  for(const socket of sockets)socket.send(JSON.stringify({type:'TRADE_EXECUTION',execution:trade}));await page.waitForTimeout(80);assert.equal((await speech()).filter(t=>/confirmed a buy execution for gold/.test(t.text)).length,1);
  for(const socket of sockets)socket.send(JSON.stringify({type:'TRADE_EXECUTION',execution:{...trade,id:100,status:'failed'}}));await page.waitForTimeout(80);assert.ok((await speech()).some(t=>/Trade execution failed/.test(t.text)));
  await page.getByText('SYMBOLS',{exact:true}).locator('..').locator('button').click();await page.getByRole('button',{name:'XAUUSD',exact:true}).click();await page.getByRole('button',{name:/Select your broker/}).click();await page.getByRole('button',{name:'XAUUSD',exact:true}).last().click();await page.getByPlaceholder('e.g. 0.05').fill('0.05');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForTimeout(100);assert.ok((await speech()).some(t=>t.text==='gold configured.'));
  // Return through existing close control.
  await page.waitForTimeout(750);await page.locator('.ea-nav-screen').first().locator('button').filter({has:page.locator('svg.lucide-chevron-left')}).click();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
  const prior=(await speech()).length;for(const mode of ['BEAST','AGGRESSIVE','ULTIMATE'])await page.getByRole('button',{name:`${mode} visual mode`}).tap();await page.waitForTimeout(400);assert.match((await speech()).slice(prior).filter(t=>/mode activated/.test(t.text)).at(-1).text,/Ultimate mode activated/);
  await nav.getByRole('button',{name:'MetaTrader',exact:true}).tap();await page.locator('#mt5-login').fill('123456');await page.locator('#mt5-password').fill('private-password');await page.locator('#mt5-server').fill('Exness-MT5Real1');await page.getByRole('button',{name:'Connect MT5',exact:true}).click();
  await page.waitForFunction(()=>window.__speech.calls.some(call=>call.text==='Connecting to Exness MT5 Real 1.'));await page.waitForFunction(()=>window.__speech.calls.some(call=>/account remains unverified/.test(call.text)));assert.ok(!(await speech()).some(call=>/connected successfully|private-password/.test(call.text)));
  // Synthetic outcomes exercise narration only, not real MT5 auth or execution.
  for(const status of ['backend-unreachable','authentication-failed']){await page.evaluate(status=>window.dispatchEvent(new CustomEvent('ea:assistant',{detail:{type:'mt5-result',outcome:{status}}})),status);await page.waitForTimeout(50);}
  assert.ok((await speech()).some(call=>call.text==='Connection failed. Backend unreachable.'));assert.ok((await speech()).some(call=>/check your account credentials/.test(call.text)));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ea:assistant',{detail:{type:'mt5-result',outcome:{status:'connected',verified:false}}})));await page.waitForTimeout(50);assert.ok(!(await speech()).some(call=>/connected successfully/.test(call.text)));
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();
  await page.getByRole('button',{name:'Chart Scanner',exact:true}).click();const scanner=page.getByRole('dialog',{name:new RegExp(name+' Chart Scanner')});await scanner.locator('input[type=file]').first().setInputFiles({name:'chart.jpg',mimeType:'image/jpeg',buffer:image});await scanner.getByRole('button',{name:'Analyse chart'}).click();await page.waitForTimeout(120);assert.ok((await speech()).some(t=>/gold sell setup detected.*Entry at 2,750\.25.*Stop loss at 2,760\.5.*Take profit at 2,730/.test(t.text)));assert.ok((await speech()).some(t=>t.text==='Chart analysis started.'));
  assert.deepEqual(await nav.boundingBox(),originalNav);assert.equal(await page.evaluate(()=>window.__speech.max),1);assert.equal((await speech()).filter(t=>t.text===`Welcome to ${name}.`).length,1);
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await page.tap('body');await page.waitForTimeout(80);assert.equal((await speech()).filter(t=>t.text===`Welcome to ${name}.`).length,1,'new launch welcomes once');assert.ok((await page.evaluate(()=>window.__speech.attempts)).every(attempt=>!attempt.splash));
  assert.deepEqual(errors,[]);results.push({name,announcements:await speech(),writes});await page.screenshot({path:`work/announcement-tests/${name.replaceAll(' ','-')}.png`});await context.close();
 }
 await writeFile('work/announcement-tests/browser-results.json',JSON.stringify(results,null,2));console.log('PASS automatic native welcome, gesture retry, no chatbot/microphone/cloud calls, saved Start/Stop/symbol, actual scanner price narration, honest MT5 preview and outcome categories, WebSocket execution/error/dedup, rapid modes, reopening and navigation bounds');
}finally{await browser.close();}
