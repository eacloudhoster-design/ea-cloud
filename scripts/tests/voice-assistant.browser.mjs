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
const neural=true;
const manifest=JSON.parse(await readFile('artifacts/ea-app/public/natural-voice/manifest.json','utf8'));
const phrases=JSON.parse(await readFile('lib/api-zod/src/common-voice-phrases.json','utf8'));
const {createHash}=await import('node:crypto');const byHash=Object.fromEntries(phrases.map(text=>[createHash('sha256').update(text).digest('hex'),text]));
const fixtureWav=text=>{const data=Buffer.from(text+'\0'.repeat(Buffer.byteLength(text)%2)),h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+data.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data]);};
try{
 for(const name of ['Mentor Alpha','Mentor Beta']){
  const spoken=[],writes=[];let connected=false,running=false,failBot=false,scanFail=false,quotaBlocked=false,executions=[];
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.addInitScript(({blocked,neural})=>{
   localStorage.setItem('appClientToken',btoa('7:client:fixture'));
   localStorage.setItem('ea-cloud:client:7:voice',JSON.stringify({enabled:false,provider:'neural'}));
   localStorage.setItem('ea-cloud:client:7:home-appearance',JSON.stringify({interfaceStyle:'regular',accentColor:'#00c9ed',showBg:true,backgroundAnimation:'none'}));
   window.__speech={calls:[],attempts:[],active:0,max:0,blocked};
   window.SpeechSynthesisUtterance=class{constructor(){throw Error('System speech is forbidden');}};
   Object.defineProperty(window,'speechSynthesis',{configurable:true,get(){throw Error('System speech is forbidden');}});
   if(neural){
    class AudioContextFixture extends EventTarget{
     state=blocked?'suspended':'running';destination={};
     resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
     async decodeAudioData(data){return {text:new TextDecoder().decode(new Uint8Array(data,44)).replace(/\0+$/,''),length:1000,numberOfChannels:1};}
     createBufferSource(){return {connect(){},disconnect(){},onended:null,
      start(){window.__speech.attempts.push({text:this.buffer.text,splash:!!document.querySelector('.ea-startup')});window.__speech.active++;window.__speech.max=Math.max(window.__speech.max,window.__speech.active);window.__speech.calls.push({text:this.buffer.text,at:performance.now(),rate:1});this.timer=setTimeout(()=>{this.timer=null;window.__speech.active--;this.onended?.();},15);},
      stop(){if(this.timer){clearTimeout(this.timer);this.timer=null;window.__speech.active--;}}
     };}
    }
    window.AudioContext=AudioContextFixture;
   }else{Object.defineProperty(window,'AudioContext',{value:undefined});Object.defineProperty(window,'webkitAudioContext',{value:undefined});}
   window.Worker=class{
    postMessage({id,text}){const data=new TextEncoder().encode(text+'\0'.repeat(new TextEncoder().encode(text).length%2)),wav=new ArrayBuffer(44+data.length),v=new DataView(wav),put=(n,s)=>{for(let i=0;i<s.length;i++)v.setUint8(n+i,s.charCodeAt(i));};put(0,'RIFF');put(8,'WAVEfmt ');new Uint8Array(wav,44).set(data);this.timer=setTimeout(()=>this.onmessage?.({data:{id,wav}}),5);}
    terminate(){clearTimeout(this.timer);}
   };
   window.SpeechRecognition=class{constructor(){throw Error('Microphone must never be used');}};
  },{blocked:name==='Mentor Alpha',neural});
  const sockets=[];await context.routeWebSocket('**/api/ws?*',socket=>sockets.push(socket));
  await context.route('https://fonts.**',r=>r.abort());
  await context.route('**/voice-image-*.jpg',r=>r.fulfill({body:image,contentType:'image/jpeg'}));
  await context.route('**/ea-app/natural-voice/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return name==='manifest.json'?route.fulfill({json:manifest}):route.fulfill({body:fixtureWav(byHash[name.replace('.wav','')]||'Unknown.'),contentType:'audio/wav'});});
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
   const json=path==='/api/app/me'?{status:'approved',licenseKey:'VALID'}:path==='/api/app/dashboard'?{mentor:{id:5,robotName:name,backgroundImageUrl:'/voice-image-1.jpg'},eas:[]}:path==='/api/app/ea-mode-images'?{eas:[{id:11,name,images:[1,2,3,4].map(i=>`/voice-image-${i}.jpg`)}]}:path.endsWith('/activity')?{events:[]}:path.endsWith('/activity/snapshot')?{observedAt:Date.now(),connected,engine:true,robotEnabled:running,tradeAllowed:connected,account:null,symbols:[]}:path.endsWith('/scanner/status')?{configured:true}:path.endsWith('/scanner/history')?{records:[],hasMore:false}:[];
   await route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__speech.attempts.length),0,'no voice before splash finishes');await page.locator('.ea-startup').waitFor({state:'detached'});if(name==='Mentor Alpha'&&neural)await page.waitForTimeout(100);else await page.waitForFunction(()=>window.__speech.attempts.length>0);assert.ok((await page.evaluate(()=>window.__speech.attempts)).every(attempt=>!attempt.splash));
  const speech=()=>page.evaluate(()=>window.__speech.calls);
  assert.equal((await speech()).length,name==='Mentor Alpha'?0:1,'automatic welcome wherever permitted; blocked browsers await gesture');
  const nav=page.locator('.ea-app-viewport > .ea-glass-navigation');const originalNav=await nav.boundingBox();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.waitForTimeout(80);
  assert.equal((await speech()).filter(t=>t.text===`Welcome to ${name}.`).length,1,'earliest existing gesture unlocks welcome');
  assert.equal(await page.getByRole('button',{name:'Voice Assistant',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Microphone',exact:true}).count(),0);assert.equal(await page.locator('.ea-voice-controls').count(),0);
  await nav.getByRole('button',{name:'Home',exact:true}).tap();
  failBot=true;await page.getByText('START',{exact:true}).locator('..').locator('button').click();await page.waitForFunction(()=>window.__speech.calls.some(t=>t.text==='Bot activation failed.')).catch(async error=>{console.log('failure details',JSON.stringify({speech:await speech(),writes,errors}));throw error;});assert.ok((await speech()).some(t=>t.text==='Bot activation failed.'));assert.ok(!(await speech()).some(t=>t.text==='Robot started.'));await page.getByRole('button',{name:'Close trading activity',exact:true}).click();
  failBot=false;await page.getByText('START',{exact:true}).locator('..').locator('button').click();await page.waitForFunction(()=>window.__speech.calls.some(t=>t.text==='Robot started.'));assert.ok((await speech()).some(t=>t.text==='Robot started.'));assert.equal(await page.getByRole('dialog',{name:'Live trading activity monitor'}).count(),1);assert.ok(!(await speech()).some(t=>t.text==='Connected to trade server.'));connected=true;await page.getByRole('button',{name:'Refresh activity',exact:true}).click();await page.waitForFunction(()=>window.__speech.calls.some(t=>t.text==='Ready to trade.'));assert.ok((await speech()).some(t=>t.text==='Connected to trade server.'));await page.getByRole('button',{name:'Close trading activity',exact:true}).click();
  failBot=true;await page.getByText('STOP',{exact:true}).locator('..').locator('button').click();await page.waitForFunction(()=>window.__speech.calls.some(t=>t.text==='Bot deactivation failed.'));assert.ok(!(await speech()).some(t=>t.text==='Robot stopped.'));failBot=false;
  await page.getByText('STOP',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(100);assert.ok((await speech()).some(t=>t.text==='Robot stopped.'));
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
  await scanner.getByRole('button',{name:'Close scanner',exact:true}).click();
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'EA_PUSH_NAVIGATE',tab:'metatrader',activity:true,accountScope:'client:9'}})));await page.waitForTimeout(30);assert.equal(await page.getByRole('dialog',{name:'Live trading activity monitor'}).count(),0,'other-account notification routing is ignored');
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'EA_PUSH_NAVIGATE',tab:'metatrader',activity:true,accountScope:'client:7'}})));await page.locator('#mt5-login').waitFor({state:'visible'});await page.getByRole('dialog',{name:'Live trading activity monitor'}).waitFor({state:'visible'});await page.getByRole('button',{name:'Close trading activity',exact:true}).click();
  assert.deepEqual(await nav.boundingBox(),originalNav);assert.equal(await page.evaluate(()=>window.__speech.max),1);assert.equal((await speech()).filter(t=>t.text===`Welcome to ${name}.`).length,1);
  const speechRequestsBefore=writes.filter(path=>path==='/api/app/assistant/speech').length;quotaBlocked=true;
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await page.tap('body');await page.waitForTimeout(80);assert.equal((await speech()).filter(t=>t.text===`Welcome to ${name}.`).length,1,'new launch welcomes once');assert.ok((await page.evaluate(()=>window.__speech.attempts)).every(attempt=>!attempt.splash));
  assert.equal(writes.filter(path=>path==='/api/app/assistant/speech').length,speechRequestsBefore,'persisted welcome/common clips survive reload without speech API calls');
  assert.deepEqual(errors,[]);results.push({name,announcements:await speech(),writes});await page.screenshot({path:`work/announcement-tests/${name.replaceAll(' ','-')}.png`});await context.close();
 }
 await writeFile('work/announcement-tests/browser-results.json',JSON.stringify(results,null,2));console.log('PASS automatic welcome, gesture retry, no chatbot/microphone/intent calls, saved Start/Stop/symbol, actual scanner price narration, honest MT5 preview and outcome categories, WebSocket execution/error/dedup, rapid modes, reopening and navigation bounds');
}finally{await browser.close();}
