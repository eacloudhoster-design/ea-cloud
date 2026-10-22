// Real app UI and bundled fonts. API/account data are isolated local fixtures;
// no production login, trading or database calls are made.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.FONT_ORIGIN||'http://127.0.0.1:5180';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
mkdirSync('work/font-previews',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];let fontRequests=0;
const fonts=['Inter','Roboto','Orbitron','Rajdhani','Exo 2'];
try{
 for(const viewport of [{width:390,height:844},{width:360,height:800},{width:1280,height:900}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.routeWebSocket('**/api/ws?*',socket=>socket.onMessage(()=>{}));
  await context.addInitScript(()=>{if(!localStorage.getItem('appClientToken'))localStorage.setItem('appClientToken',btoa('7:client:isolated-font-test'));});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   // Existing global Inter link stays unchanged; selected bot fonts must still
   // render authentically with every external website deliberately blocked.
   if(url.origin!==origin)return route.abort();
   if(url.pathname.endsWith('.woff2'))fontRequests++;
   if(url.pathname==='/_fixture/mentor.jpg')return route.fulfill({contentType:'image/jpeg',body:readFileSync('artifacts/ea-cloud/public/default-robot.jpg')});
   if(!url.pathname.startsWith('/api/'))return route.continue();
   let data={};if(url.pathname==='/api/app/me')data={status:'approved',licenseKey:'ISOLATED'};
   if(url.pathname==='/api/app/dashboard')data={mentor:{robotName:'SMC BLUEPRINT EA V3+',backgroundImageUrl:'/_fixture/mentor.jpg'},eas:[]};
   if(url.pathname==='/api/app/trading-controls')data={mt5Connected:false,copyingEnabled:false};
   if(url.pathname==='/api/app/executions')data=[];
   if(url.pathname==='/api/app/activity')data={events:[]};
   if(url.pathname==='/api/app/activity/snapshot')data={observedAt:Date.now(),engine:false,robotEnabled:false,connected:false,tradeAllowed:false,account:null,symbols:[]};
   return route.fulfill({json:data});
  });
  await page.goto(origin+'/ea-app/');await page.locator('[data-bot-name="primary"]').waitFor();
  const client=await context.newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');
  const settings=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();};
  for(const [layout,label] of [['matrix','The Matrix Interface'],['regular','Regular Interface'],['s2tone','S2tone_']]){
   await settings();await page.getByRole('button',{name:'Select Main Interface',exact:true}).click();
   const option=page.getByRole('button').filter({has:page.getByText(label,{exact:true})});
   if(await option.count()!==1)throw Error('Cannot locate interface option '+label);
   await option.click();await page.getByRole('button',{name:'Select Font',exact:true}).click();
   for(const font of fonts){
    const choice=page.getByRole('button',{name:font,exact:true});await choice.click();assert.equal(await choice.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('button[aria-pressed="true"]').filter({has:page.locator('p').filter({hasText:new RegExp('^(Inter|Roboto|Orbitron|Rajdhani|Exo 2)$')})}).count(),1);
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.evaluate(()=>document.fonts.ready);
    const title=page.locator('[data-bot-name="primary"]');
    const metrics=await title.evaluate(el=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el);return {family:style.fontFamily,weight:style.fontWeight,left:rect.left,right:rect.right,centre:(rect.left+rect.right)/2,text:el.textContent,scroll:el.scrollWidth,width:el.clientWidth};});
    assert.ok(metrics.family.includes('EA Bot '+font));assert.equal(metrics.weight,font==='Rajdhani'?'700':'900');assert.ok(metrics.scroll<=metrics.width+1,'Bot name overflows');
    const appBounds=await page.locator('[data-bot-name="primary"]').evaluate(el=>{let parent=el;while(parent.parentElement&&parent.parentElement.getBoundingClientRect().width<=460)parent=parent.parentElement;return parent.getBoundingClientRect().toJSON();});
    assert.ok(Math.abs(metrics.centre-viewport.width/2)<=1,'Bot name is not horizontally centred');
    assert.ok(metrics.left>=-1&&metrics.right<=viewport.width+1,'Title outside viewport');
    const doc=await client.send('DOM.getDocument');const node=await client.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-bot-name="primary"]'});const actual=await client.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});
    assert.ok(actual.fonts.length>0&&actual.fonts.every(f=>f.isCustomFont),'Browser used a fallback font');assert.ok(actual.fonts.some(f=>f.familyName.toLowerCase().includes(font.toLowerCase().replace('exo 2','exo 2'))),JSON.stringify(actual.fonts));
    results.push({viewport,layout,font,actual:actual.fonts.map(f=>({family:f.familyName,custom:f.isCustomFont})),metrics});
    if(viewport.width===390&&layout==='matrix')await page.waitForTimeout(500);
    if(viewport.width===390&&layout==='matrix')await page.screenshot({path:`work/font-previews/${font.toLowerCase().replace(' ','-')}-mobile.png`});
    await settings();if(!await page.getByRole('button',{name:'Inter',exact:true}).isVisible())await page.getByRole('button',{name:'Select Font',exact:true}).click();assert.equal(await page.getByRole('button',{name:font,exact:true}).getAttribute('aria-pressed'),'true');
   }
  }
  // Reopening a new page in the same browser context exercises storage reload.
  await page.reload();await page.locator('[data-bot-name="primary"]').waitFor();await page.evaluate(()=>document.fonts.ready);assert.ok((await page.locator('[data-bot-name="primary"]').evaluate(el=>getComputedStyle(el).fontFamily)).includes('EA Bot Exo 2'));
  await settings();if(!await page.getByRole('button',{name:'Inter',exact:true}).isVisible())await page.getByRole('button',{name:'Select Font',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Exo 2',exact:true}).getAttribute('aria-pressed'),'true');
  const reopened=await context.newPage();await reopened.goto(origin+'/ea-app/');await reopened.locator('[data-bot-name="primary"]').waitFor();assert.ok((await reopened.locator('[data-bot-name="primary"]').evaluate(el=>getComputedStyle(el).fontFamily)).includes('EA Bot Exo 2'));
  assert.deepEqual(errors,[]);await context.close();
 }
 writeFileSync('work/font-previews/browser-results.json',JSON.stringify({results,fontRequests},null,2));console.log(`${results.length} real-app font/layout/viewport combinations passed; custom bundled glyphs confirmed; navigation/reload/reopen passed.`);
}finally{await browser.close();}
