import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5217';assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
await mkdir('work/voice-tests',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const image=await readFile('artifacts/ea-cloud/public/default-robot.jpg');
const report={id:'00000000-0000-4000-8000-000000000007',kind:'chart',strategy:'SMC',createdAt:new Date().toISOString(),report:{signal:'SELL',symbol:'XAUUSD',timeframe:'M15',entry:2750.25,stopLoss:2760.5,takeProfit:2730,reasoning:'Bearish market structure rejects visible resistance.',limitations:null}};
const results=[];
try{
 for(const name of ['Mentor Alpha','Mentor Beta']){
  const spoken=[],writes=[];let connected=false,running=false,failBot=false,scanFail=false,executions=[];
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{
   localStorage.setItem('appClientToken',btoa('7:client:fixture'));
   localStorage.setItem('ea-cloud:client:7:home-appearance',JSON.stringify({interfaceStyle:'regular',accentColor:'#00c9ed',showBg:true,backgroundAnimation:'none'}));
   window.__audioState={active:0,max:0,blocked:true,micStarts:0,micDenied:false};
   window.Audio=class{
    paused=true;ended=false;
    play(){if(window.__audioState.blocked){window.__audioState.blocked=false;return Promise.reject(Object.assign(Error(),{name:'NotAllowedError'}));}this.paused=false;this.ended=false;window.__audioState.active++;window.__audioState.max=Math.max(window.__audioState.max,window.__audioState.active);this.timer=setTimeout(()=>{if(!this.paused){this.paused=true;this.ended=true;window.__audioState.active--;this.onended?.();}},30);return Promise.resolve();}
    pause(){if(!this.paused){this.paused=true;window.__audioState.active--;clearTimeout(this.timer);this.onpause?.();}}
    load(){} removeAttribute(){}
   };
   window.SpeechRecognition=class{
    start(){window.__audioState.micStarts++;if(window.__audioState.micDenied){setTimeout(()=>{this.onerror?.({error:'not-allowed'});this.onend?.();},10);return;}this.onstart?.();this.timer=setTimeout(()=>{this.onresult?.({results:[[{transcript:'What is my balance?'}]]});this.onend?.();},30);}
    stop(){clearTimeout(this.timer);this.onend?.();}abort(){clearTimeout(this.timer);this.onend?.();}
   };
  });
  await context.routeWebSocket('**/api/ws?*',()=>{});await context.route('https://fonts.**',r=>r.abort());
  await context.route('**/voice-image-*.jpg',r=>r.fulfill({body:image,contentType:'image/jpeg'}));
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON?.bind(request);
   if(request.method()!=='GET')writes.push(path);
   if(path==='/api/app/assistant/speech'){const text=request.postDataJSON().text;spoken.push(text);await route.fulfill({body:Buffer.alloc(100),contentType:'audio/wav'});return;}
   if(path==='/api/app/assistant/intent'){const question=request.postDataJSON().question;await route.fulfill({json:{intent:/trade|execute|risk|lot/i.test(question)?'unsupported':/balance/i.test(question)?'balance':/mode/i.test(question)?'mode':/analysis/i.test(question)?'analysis':'help'}});return;}
   if(path.startsWith('/api/app/assistant/report/')){await route.fulfill({json:report});return;}
   if(path==='/api/app/assistant/facts'){await route.fulfill({json:{observedAt:Date.now(),botName:name,connected,engine:true,robotEnabled:running,tradeAllowed:true,account:connected?{balance:1250.5,equity:1260,profit:9.5,currency:'USD'}:null,positionsCount:connected?3:null,latest:report,executions}});return;}
   if(path.endsWith('/trading-controls')){
    if(request.method()==='PATCH'){if(failBot){await route.fulfill({status:500,json:{error:'failed'}});return;}running=request.postDataJSON().copyingEnabled;}
    await route.fulfill({json:{copyingEnabled:running}});return;
   }
   if(path==='/api/app/scanner/chart'){await route.fulfill(scanFail?{status:503,json:{error:'AI unavailable',code:'AI_UNAVAILABLE',category:'ai',retryable:true}}:{json:report});return;}
   const json=path==='/api/app/me'?{status:'approved',licenseKey:'VALID'}:path==='/api/app/dashboard'?{mentor:{id:5,robotName:name,backgroundImageUrl:'/voice-image-1.jpg'},eas:[]}:path==='/api/app/ea-mode-images'?{eas:[{id:11,name,images:[1,2,3,4].map(i=>`/voice-image-${i}.jpg`)}]}:path.endsWith('/activity/snapshot')?{observedAt:Date.now(),connected:false,engine:false,robotEnabled:false,tradeAllowed:false,account:null,symbols:[]}:path.endsWith('/scanner/status')?{configured:true}:path.endsWith('/scanner/history')?{records:[],hasMore:false}:[];
   await route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'detached'});assert.equal(spoken.length,0,'default off');
  const nav=page.locator('.ea-app-content > .ea-glass-navigation');const originalNav=await nav.boundingBox();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'Voice Assistant',exact:true}).tap();
  const panel=page.getByRole('region',{name:'Voice assistant settings'});
  await panel.getByLabel('Voice Assistant On / Off',{exact:true}).check();
  await page.waitForFunction(()=>document.querySelector('.ea-voice-panel')?.textContent.includes('Play queued voice'));
  await panel.getByRole('button',{name:'Play queued voice',exact:true}).click();await page.waitForTimeout(80);
  assert.ok(spoken.some(t=>t===`Welcome to ${name}.`));assert.equal(spoken.filter(t=>t===`Welcome to ${name}.`).length,1);
  const ask=async question=>{await panel.getByLabel('Question for assistant',{exact:true}).fill(question);await panel.getByRole('button',{name:'Ask',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ea-voice-answer')?.textContent&&!document.querySelector('.ea-voice-answer').textContent.includes('Checking'));await page.waitForTimeout(100);};
  await ask('What is my balance?');assert.match(await panel.locator('.ea-voice-answer').textContent(),/not verified/);
  connected=true;await ask('What is my balance?');assert.match(await panel.locator('.ea-voice-answer').textContent(),/1,250/);assert.ok(!spoken.some(t=>t.includes('1,250')),'account speech opt-in');
  await panel.getByLabel('Speak account values with neural voice',{exact:true}).check();await ask('What is my balance?');assert.ok(spoken.some(t=>t.includes('1,250 US dollars and 50 cents')));
  const patchCount=writes.filter(p=>p.endsWith('/trading-controls')).length;await ask('Execute a trade');assert.equal(writes.filter(p=>p.endsWith('/trading-controls')).length,patchCount);assert.match(await panel.locator('.ea-voice-answer').textContent(),/cannot execute/);
  await page.evaluate(()=>window.__audioState.micDenied=true);await panel.getByRole('button',{name:'Microphone',exact:true}).click();await panel.getByRole('alert').filter({hasText:'permission was denied'}).waitFor();
  await page.evaluate(()=>window.__audioState.micDenied=false);await panel.getByRole('button',{name:'Microphone',exact:true}).click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__audioState.micStarts),2);
  if(name==='Mentor Alpha'){
   await nav.getByRole('button',{name:'Home',exact:true}).tap();failBot=true;
   await page.getByText('START',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(150);assert.ok(spoken.some(t=>t.includes(`Unable to activate ${name}`)));assert.ok(!spoken.some(t=>t.includes(`${name} activated.`)));
   failBot=false;await page.getByText('START',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(200);assert.ok(spoken.some(t=>t.includes(`${name} activated.`)));
   await page.getByText('STOP',{exact:true}).locator('..').locator('button').click();await page.waitForTimeout(200);assert.ok(spoken.some(t=>t.includes(`${name} deactivated.`)));
   executions=[{id:99,status:'pending',signalKind:'OPEN',action:'BUY',symbol:'XAUUSD',ticket:null,retcode:null,updatedAt:new Date().toISOString()}];
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(100);
   assert.ok(!spoken.some(t=>t.includes('confirmed a buy execution for gold')));
   executions=[{...executions[0],status:'success',ticket:'verified-ticket',retcode:10009,updatedAt:new Date().toISOString()}];
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(200);
   assert.ok(spoken.some(t=>t.includes('confirmed a buy execution for gold')));
   await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
   const prior=spoken.length;for(const mode of ['BEAST','AGGRESSIVE','ULTIMATE'])await page.getByRole('button',{name:`${mode} visual mode`}).tap();await page.waitForTimeout(700);
   const modeTexts=spoken.slice(prior).filter(t=>/mode activated/.test(t));assert.equal(modeTexts.length,1);assert.match(modeTexts[0],/Ultimate mode activated/);
   await nav.getByRole('button',{name:'MetaTrader',exact:true}).tap();await page.locator('#mt5-login').fill('123456');await page.locator('#mt5-password').fill('private-password');await page.locator('#mt5-server').fill('Pepperstone-MT5-Live01');
   await page.getByRole('button',{name:'Connect MT5',exact:true}).click();await page.waitForTimeout(3500);assert.ok(spoken.some(t=>t.includes('Pepperstone')));assert.ok(spoken.some(t=>t.includes('account remains unverified')));assert.ok(!spoken.some(t=>t.includes('private-password')));
   await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'Chart Scanner',exact:true}).click();
   const scanner=page.getByRole('dialog',{name:new RegExp(name+' Chart Scanner')});await scanner.locator('input[type=file]').first().setInputFiles({name:'chart.jpg',mimeType:'image/jpeg',buffer:image});await scanner.getByRole('button',{name:'Analyse chart'}).click();await page.waitForTimeout(300);
   assert.ok(spoken.some(t=>t.includes('Sell directional bias for gold')&&t.includes('2750.25')));assert.ok(!spoken.some(t=>/trade executed successfully/i.test(t)));
   await scanner.getByRole('button',{name:'Replay analysis',exact:true}).click();await page.waitForTimeout(150);
   await scanner.getByRole('button',{name:'Stop speaking',exact:true}).click();await scanner.getByRole('button',{name:'Close scanner',exact:true}).click();
  }
  if(name==='Mentor Beta'){
    await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await page.waitForTimeout(50);
    assert.equal(spoken.filter(t=>t===`Welcome to ${name}.`).length,1,'wait for first interaction on reopen');
    assert.equal(await page.evaluate(()=>window.__audioState.micStarts),0,'no automatic microphone on reopen');
    await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.waitForTimeout(60);await page.getByRole('button',{name:'Voice Assistant',exact:true}).tap();await page.waitForTimeout(100);
    assert.equal(spoken.filter(t=>t===`Welcome to ${name}.`).length,2,'one welcome per actual reopen');
    await page.evaluate(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;});
    await panel.getByLabel('Voice speed',{exact:true}).focus();await panel.getByLabel('Voice speed',{exact:true}).press('ArrowRight');
    assert.equal(await panel.getByRole('button',{name:'Microphone',exact:true}).isDisabled(),true);
    await ask('What mode am I using?');assert.match(await panel.locator('.ea-voice-answer').textContent(),/Normal mode/);
  }
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();
  if(!(await panel.isVisible()))await page.getByRole('button',{name:'Voice Assistant',exact:true}).tap();
  await panel.getByLabel('Voice Assistant On / Off',{exact:true}).uncheck();assert.equal(await page.evaluate(()=>window.__audioState.active),0);
  assert.equal(await page.evaluate(()=>window.__audioState.max),1);assert.equal(await page.locator('.ea-voice-controls').count(),0);assert.deepEqual(await nav.boundingBox(),originalNav);
  assert.equal(spoken.filter(t=>t===`Welcome to ${name}.`).length,name==='Mentor Beta'?2:1);assert.deepEqual(errors,[]);
  await page.screenshot({path:`work/voice-tests/${name.replaceAll(' ','-')}.png`});results.push({name,spoken,writes});await context.close();
 }
 await writeFile('work/voice-tests/browser-results.json',JSON.stringify(results,null,2));console.log('PASS personalized welcome, autoplay, account privacy, read-only questions, microphone permissions, verified controls, MT5 honesty, scanner narration, final-mode dedup, disable and unchanged nav');
}finally{await browser.close();}
