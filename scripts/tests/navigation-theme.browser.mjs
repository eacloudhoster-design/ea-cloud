import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5244';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output='work/navigation-theme';await mkdir(output,{recursive:true});
const picture=await readFile('artifacts/ea-cloud/public/default-robot.jpg');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const colours=[['Electric Blue','#3b82f6'],['Pure Red','#ef4444'],['Sunset Orange','#f97316'],['Royal Purple','#a855f7'],['Emerald Green','#22c55e'],['Hot Pink','#ec4899'],['Cyan','#06b6d4']];
const results=[];
async function setup(context){
  await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{get:()=>true});if(!localStorage.getItem('appClientToken'))localStorage.setItem('appClientToken',btoa('7:client:fixture'));});
  await context.routeWebSocket('**/api/ws?*',()=>{});await context.route('https://fonts.**',r=>r.abort());
  await context.route('**/theme-mentor.jpg',r=>r.fulfill({body:picture,contentType:'image/jpeg'}));
  await context.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p.endsWith('/app/me')?{id:7,status:'approved',licenseKey:'VALID'}:p.endsWith('/app/dashboard')?{mentor:{id:5,robotName:'Theme Test EA',backgroundImageUrl:'/theme-mentor.jpg'},eas:[]}:p.endsWith('/app/ea-mode-images')?{eas:[{id:11,name:'Theme Test EA',images:Array(4).fill('/theme-mentor.jpg')}]}:p.endsWith('/trading-controls')?{copyingEnabled:false}:p.endsWith('/activity/snapshot')?{observedAt:Date.now(),connected:false,engine:false,robotEnabled:false,account:null,symbols:[]}:p.endsWith('/scanner/status')?{configured:true}:p.endsWith('/scanner/history')?{records:[],hasMore:false}:[]});});
}
const options={viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1'};
async function open(context){const page=await context.newPage();page.setDefaultTimeout(15000);const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:47,bottom:34,left:0,right:0}});await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'detached'});return page;}
const inspect=page=>page.evaluate(()=>{
 const nav=document.querySelector('.ea-glass-navigation'),bar=nav.querySelector('.ea-glass-bar'),indicator=nav.querySelector('.ea-glass-indicator'),active=nav.querySelector('[aria-current="page"]');
 const css=getComputedStyle(nav),i=getComputedStyle(indicator),a=getComputedStyle(active);
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
 const rgba=value=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=value;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];};
 return {accent:rgba(css.getPropertyValue('--nav-accent')),border:i.borderTopColor,background:i.backgroundImage,glow:i.boxShadow,outline:css.borderTopColor,panel:css.backgroundImage,active:a.color,icon:getComputedStyle(active.querySelector('svg')).color,inactive:getComputedStyle(nav.querySelector('button:not([aria-current])')).color,nav:rect(nav),bar:rect(bar),transition:css.transitionDuration,scrollY,overflow:document.documentElement.scrollWidth>innerWidth};
});
try{
 let context=await browser.newContext(options);await setup(context);let page=await open(context);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let nav=page.getByRole('navigation',{name:'Main navigation'});const original=await inspect(page);
 const check=async(hex)=>{await page.waitForTimeout(550);const value=await inspect(page);assert.deepEqual(value.accent,[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)).concat(255));assert.equal(value.active,value.icon);assert.equal(value.inactive,original.inactive);assert.deepEqual(value.nav,original.nav);assert.deepEqual(value.bar,original.bar);assert.equal(value.nav.bottom,844);assert.equal(value.bar.bottom,810);assert.equal(value.scrollY,0);assert.equal(value.overflow,false);return value;};
 for(const [label,hex] of colours){
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();const option=page.getByRole('button',{name:label,exact:true});if(!await option.isVisible())await page.getByRole('button',{name:'Select Colour',exact:true}).click();
  const before=await inspect(page);await option.click();await page.waitForTimeout(70);const intermediate=await inspect(page);assert.notDeepEqual(intermediate.accent,before.accent,'theme transition starts without reload');
  const value=await check(hex);results.push({label,hex,...value});
  await nav.getByRole('button',{name:'Home',exact:true}).tap();await check(hex);await page.screenshot({path:`${output}/${label.replaceAll(' ','-')}.png`});
 }
 assert.equal(new Set(results.map(r=>r.border)).size,colours.length);assert.equal(new Set(results.map(r=>r.background)).size,colours.length);assert.equal(new Set(results.map(r=>r.glow)).size,colours.length);assert.equal(new Set(results.map(r=>r.outline)).size,colours.length);assert.equal(new Set(results.map(r=>r.panel)).size,colours.length);
 const hex=colours.at(-1)[1];
 for(const [style,label] of [['regular','Regular Interface'],['matrix','The Matrix Interface'],['s2tone','S2tone_']]){
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();const option=page.getByRole('button',{name:label,exact:false});if(!await option.isVisible())await page.getByRole('button',{name:'Select Main Interface',exact:true}).click();await option.click();await nav.getByRole('button',{name:'Home',exact:true}).tap();await page.locator(`[data-home-interface="${style}"]`).waitFor();await check(hex);
 }
 await nav.getByRole('button',{name:'MetaTrader',exact:true}).tap();await page.getByLabel('MT5 Connections',{exact:true}).waitFor();await check(hex);
 await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'Chart Scanner',exact:true}).click();await page.locator('.scanner-screen').waitFor();await check(hex);await page.getByRole('button',{name:'Close scanner',exact:true}).click();
 await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await check(hex);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ea-cloud:client:7:home-appearance')).accentColor),hex);
 const state=await context.storageState();await context.close();context=await browser.newContext({...options,storageState:state});await setup(context);page=await open(context);nav=page.getByRole('navigation',{name:'Main navigation'});await check(hex);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await inspect(page)).transition,'0s');
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify(results,null,2));await context.close();console.log('PASS all seven theme colours, live interpolation, neutral inactive buttons, all interfaces/tabs/scanner, reload/reopen persistence, unchanged geometry/safe area, reduced motion');
}finally{await browser.close();}
