import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
await mkdir('work/floating-robot',{recursive:true});
const results=[];
const close=(a,b)=>assert(Math.abs(a-b)<1,`${a} != ${b}`);
try{
 for(const viewport of [{width:390,height:844,touch:true},{width:320,height:568,touch:true},{width:1280,height:900,touch:false}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},hasTouch:viewport.touch,isMobile:viewport.touch});
  const page=await context.newPage();
  await page.addInitScript(()=>localStorage.setItem('appClientToken',btoa('7:client:fixture')));
  await page.route('https://fonts.**',r=>r.abort());
  const apiFixture=r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p==='/api/app/me'?{status:'approved',licenseKey:'fixture'}:p==='/api/app/dashboard'?{mentor:{robotName:'SMC Blueprint EA V3+'},eas:[]}:p==='/api/app/trading-controls'?{copyingEnabled:true}:p==='/api/app/activity'?{events:[]}:p==='/api/app/activity/snapshot'?{observedAt:Date.now(),connected:false,engine:false,robotEnabled:true,tradeAllowed:false,symbols:[],account:null}:[]})};
  await page.route('**/api/**',apiFixture);
  const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5179/ea-app/';
  await page.goto(origin);await page.waitForSelector('.ea-startup',{state:'detached'});
  const button=page.getByRole('button',{name:'Open live trading activity',exact:true});
  const root=page.locator('.trading-activity-root');
  await button.waitFor();
  const cdp=viewport.touch?await context.newCDPSession(page):null;
  const drag=async(x,y)=>{
   const b=await button.boundingBox(),start={x:b.x+b.width/2,y:b.y+b.height/2};
   if(cdp){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(x-start.x)*i/6,y:start.y+(y-start.y)*i/6,id:1}]});await page.waitForTimeout(16)}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(x,y,{steps:12});await page.mouse.up()}
   await page.waitForTimeout(80);assert.equal(await page.getByRole('dialog').count(),0,'Drag release must not open the panel');
   return button.boundingBox();
  };
  let area=await root.boundingBox(),initial=await button.boundingBox();
  let topLeft=await drag(area.x+8+initial.width/2,area.y+8+initial.height/2);
  close(topLeft.x,area.x+8);close(topLeft.y,area.y+8);
  await page.screenshot({path:`work/floating-robot/${viewport.width}-top-left.png`});
  const middle=await drag(area.x+area.width/2,area.y+area.height*.45);
  await page.waitForTimeout(200);const settled=await button.boundingBox();close(middle.x,settled.x);close(middle.y,settled.y);
  await page.screenshot({path:`work/floating-robot/${viewport.width}-center.png`});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ea-cloud:floating-robot-position')));
  await page.reload();await page.waitForSelector('.ea-startup',{state:'detached'});
  const restored=await button.boundingBox();close(restored.x,middle.x);close(restored.y,middle.y);
  // Tap/click and keyboard activation retain the existing monitor function.
  if(viewport.touch)await button.tap();else await button.click();
  await page.getByRole('dialog',{name:'Live trading activity monitor'}).waitFor();await page.getByRole('button',{name:'Close trading activity',exact:true}).click();
  await button.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close trading activity',exact:true}).click();
  // The existing shared instance retains its location through each interface and navigation tab.
  for(const layout of ['Regular Interface','S2tone_','The Matrix Interface']){
   await page.getByRole('button',{name:'Settings',exact:true}).click();await page.waitForTimeout(350);
   const accordion=page.getByRole('button',{name:'Select Main Interface'});if(await accordion.locator('.lucide-chevron-down').count())await accordion.click();
   await page.getByRole('button',{name:layout,exact:false}).click({position:{x:20,y:20}});await page.getByRole('button',{name:'Home',exact:true}).click();await page.waitForTimeout(350);
   const unchanged=await button.boundingBox();close(unchanged.x,restored.x);close(unchanged.y,restored.y);
   // Scrolling the real Home content must not move the floating trigger.
   await page.locator('.absolute.inset-0.overflow-y-auto').first().evaluate(el=>{el.scrollTop=150});
   const scrolled=await button.boundingBox();close(scrolled.x,restored.x);close(scrolled.y,restored.y);
  }
  await page.getByRole('button',{name:'MetaTrader',exact:true}).click();await page.waitForTimeout(350);const nav=await button.boundingBox();close(nav.x,restored.x);close(nav.y,restored.y);await page.getByRole('button',{name:'Home',exact:true}).click();
  // Deliberate moves to every extreme are clamped inside the visible application.
  for(const [x,y]of [[area.x-100,area.y-100],[area.x+area.width+100,area.y+area.height+100],[area.x-100,area.y+area.height+100],[area.x+area.width+100,area.y-100]]){
   const edge=await drag(x,y);assert(edge.x>=area.x&&edge.y>=area.y);assert(edge.x+edge.width<=area.x+area.width+1);assert(edge.y+edge.height<=area.y+area.height+1);
  }
  await root.evaluate(el=>{el.style.setProperty('--robot-safe-top','25px');el.style.setProperty('--robot-safe-left','20px')});
  const safe=await drag(area.x-100,area.y-100);close(safe.x,area.x+20);close(safe.y,area.y+25);
  await root.evaluate(el=>{el.style.removeProperty('--robot-safe-top');el.style.removeProperty('--robot-safe-left')});
  await drag(area.x+area.width-35,area.y+area.height-35);
  await page.setViewportSize({width:viewport.touch?568:900,height:viewport.touch?320:500});await page.waitForTimeout(150);
  area=await root.boundingBox();const rotated=await button.boundingBox();assert(rotated.x>=area.x&&rotated.y>=area.y);assert(rotated.x+rotated.width<=area.x+area.width+1);assert(rotated.y+rotated.height<=area.y+area.height+1);
  // Closing and reopening the application tab preserves its saved position.
  const storageState=await context.storageState();const expected=await page.evaluate(()=>JSON.parse(localStorage.getItem('ea-cloud:floating-robot-position')));
  const finalViewport=page.viewportSize();await page.close();const reopened=await context.newPage();await reopened.setViewportSize(finalViewport);await reopened.route('**/api/**',apiFixture);await reopened.goto(origin);await reopened.waitForSelector('.ea-startup',{state:'detached'});const reopenedRoot=await reopened.locator('.trading-activity-root').boundingBox(),reopenedButton=await reopened.getByRole('button',{name:'Open live trading activity',exact:true}).boundingBox();close(reopenedButton.x,reopenedRoot.x+expected.x);close(reopenedButton.y,reopenedRoot.y+expected.y);
  results.push({viewport,reopenedPreserved:true,initial,topLeft,middle,saved,rotated,expected,storageStateHasPosition:storageState.origins.some(o=>o.localStorage.some(v=>v.name==='ea-cloud:floating-robot-position')),tapAndKeyboardOpened:true,dragDidNotOpen:true,interfaceSwitchesPreserved:true});
  await context.close();
 }
 await writeFile('work/floating-robot/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
