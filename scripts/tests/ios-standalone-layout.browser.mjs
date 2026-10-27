import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5244';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output='work/ios-standalone-stripe';await mkdir(output,{recursive:true});
const picture=await readFile('artifacts/ea-cloud/public/default-robot.jpg');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1';
const cases=[
  {name:'iphone-notch',width:390,height:844,top:47,bottom:34,gap:47,standalone:true,ios:true},
  {name:'iphone-island',width:393,height:852,top:59,bottom:34,gap:59,standalone:true,ios:true},
  {name:'iphone-landscape',width:844,height:390,top:0,bottom:21,left:44,right:44,gap:21,standalone:true,ios:true},
  {name:'safari-tab',width:390,height:744,top:0,bottom:0,standalone:false,ios:true},
  {name:'android-pwa',width:412,height:915,top:0,bottom:0,standalone:true,ios:false},
];
try{for(const device of cases){
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:true,hasTouch:true,...(device.ios?{userAgent:iphone}:{})});
  await context.addInitScript(standalone=>{
    Object.defineProperty(navigator,'standalone',{get:()=>standalone});
    localStorage.setItem('appClientToken',btoa('7:client:fixture'));
    if(!localStorage.getItem('ea-cloud:client:7:home-appearance'))localStorage.setItem('ea-cloud:client:7:home-appearance',JSON.stringify({interfaceStyle:'regular',accentColor:'#00c9ed',showBg:true,backgroundAnimation:'none'}));
  },device.standalone);
  await context.routeWebSocket('**/api/ws?*',()=>{});await context.route('https://fonts.**',r=>r.abort());
  await context.route('**/stripe-mentor.jpg',r=>r.fulfill({body:picture,contentType:'image/jpeg'}));
  await context.route('**/api/**',r=>{
    const path=new URL(r.request().url()).pathname;
    const json=path.endsWith('/app/me')?{id:7,token:btoa('7:client:cookie'),status:'approved',licenseKey:'VALID'}:path.endsWith('/app/dashboard')?{mentor:{id:5,robotName:'Viewport Test EA',backgroundImageUrl:'/stripe-mentor.jpg'},eas:[]}:path.endsWith('/app/ea-mode-images')?{eas:[{id:11,name:'Viewport Test EA',images:Array(4).fill('/stripe-mentor.jpg')}]}:path.endsWith('/trading-controls')?{copyingEnabled:false}:path.endsWith('/activity/snapshot')?{observedAt:Date.now(),connected:false,engine:false,robotEnabled:false,account:null,symbols:[]}:path.endsWith('/scanner/status')?{configured:true}:path.endsWith('/scanner/history')?{records:[],hasMore:false}:[];
    return r.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:device.top,bottom:device.bottom,left:device.left||0,right:device.right||0}});
  await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'detached'});
  const attribute='data-ea-ios-standalone-layout';
  assert.equal(await page.evaluate(attribute=>document.documentElement.hasAttribute(attribute),attribute),device.ios&&device.standalone);
  const geometry=()=>page.evaluate(()=>{
    const box=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,position:getComputedStyle(el).position};};
    return {root:box('.ea-app-viewport'),background:box('[data-home-background]'),nav:box('.ea-glass-navigation'),bar:box('.ea-glass-bar'),scrollY,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  const check=async()=>{const g=await geometry();assert.equal(g.root.bottom,device.height);assert.equal(g.background.bottom,device.height);assert.equal(g.nav.bottom,device.height);assert.equal(g.bar.bottom,device.height-device.bottom);assert.equal(g.root.width,device.width);assert.equal(g.nav.width,device.width);assert.equal(g.scrollY,0);assert.equal(g.overflow,false);return g;};
  let baseline=null;
  const modelCss=`.ea-startup-home{contain:layout;height:calc(100vh - ${device.gap||0}px)} html{background-image:none!important}`;
  if(device.ios&&device.standalone){
    // Model the reported WebKit error: fixed descendants get a shorter containing
    // block while the full document canvas remains available. This is an explicit
    // regression model, NOT a claim to emulate native iOS compositing.
    await page.addStyleTag({content:modelCss});
    await page.evaluate(attribute=>document.documentElement.removeAttribute(attribute),attribute);
    baseline=await geometry();assert.equal(baseline.nav.bottom,device.height-device.gap);assert.equal(baseline.background.bottom,device.height-device.gap);
    await page.screenshot({path:`${output}/${device.name}-before.png`});
    // The real lifecycle hook must select the corrected layout on restoration.
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.waitForFunction(attribute=>document.documentElement.hasAttribute(attribute),attribute);
  }
  const corrected=await check();
  await page.waitForTimeout(350);await page.screenshot({path:`${output}/${device.name}-after.png`});
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  for(const style of ['regular','matrix','s2tone']){
    if(style!=='regular'){
      await nav.getByRole('button',{name:'Settings',exact:true}).tap();
      const option=page.getByRole('button',{name:style==='matrix'?'The Matrix Interface':'S2tone_',exact:false});
      if(!(await option.isVisible()))await page.getByRole('button',{name:'Select Main Interface',exact:true}).click();
      await option.click();await nav.getByRole('button',{name:'Home',exact:true}).tap();
    }
    await page.locator(`[data-home-interface="${style}"]`).waitFor();await check();
    const before=await geometry();await page.locator('[data-home-swipe-surface]').evaluate(el=>el.scrollTop=300);assert.deepEqual((await geometry()).nav,before.nav);
  }
  await nav.getByRole('button',{name:'MetaTrader',exact:true}).tap();await page.getByLabel('MT5 Connections',{exact:true}).waitFor();await check();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'Chart Scanner',exact:true}).click();await page.locator('.scanner-screen').waitFor();await check();
  await page.getByRole('button',{name:'Close scanner',exact:true}).click();await nav.getByRole('button',{name:'Home',exact:true}).tap();
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});
  if(device.ios&&device.standalone)await page.addStyleTag({content:modelCss});
  await check();
  if(device.ios&&device.standalone){assert.equal((await geometry()).root.position,'relative');assert.equal((await geometry()).nav.position,'absolute');}
  else {assert.equal((await geometry()).root.position,'fixed');assert.equal((await geometry()).nav.position,'fixed');}
  await page.setViewportSize({width:device.height,height:device.width});
  const rotated=await geometry();assert.equal(rotated.root.bottom,device.width);assert.equal(rotated.background.bottom,device.width);assert.equal(rotated.nav.bottom,device.width);assert.equal(rotated.root.width,device.height);assert.equal(rotated.overflow,false);
  await page.setViewportSize({width:device.width,height:device.height});await check();
  await page.waitForTimeout(350);await page.screenshot({path:`${output}/${device.name}-reopened.png`});
  // Existing session teardown must not leave standalone layout on the sign-in UI.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ea:session-invalidated',{detail:{token:btoa('7:client:cookie')}})));
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-ea-ios-standalone-layout'));
  assert.equal(await page.evaluate(attribute=>document.documentElement.hasAttribute(attribute),attribute),false);
  assert.deepEqual(errors,[]);results.push({device,baseline,corrected});console.log('PASS',device.name);await context.close();
}await writeFile(output+'/results.json',JSON.stringify(results,null,2));}finally{await browser.close();}
