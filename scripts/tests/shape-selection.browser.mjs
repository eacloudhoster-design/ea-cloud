import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir('work/shape-selection',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:740}});
 await page.addInitScript(()=>localStorage.setItem('appClientToken',btoa('7:client:fixture')));
 await page.route('https://fonts.**',r=>r.abort());
 await page.route('**/fixture-robot.jpg',r=>r.fulfill({path:'artifacts/ea-cloud/public/default-robot.jpg',contentType:'image/jpeg'}));
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p==='/api/app/me'?{status:'approved',licenseKey:'fixture'}:p==='/api/app/dashboard'?{mentor:{robotName:'SMC Blueprint EA V3+',backgroundImageUrl:'/fixture-robot.jpg'},eas:[]}:p==='/api/app/trading-controls'?{copyingEnabled:true}:[]})});
 await page.goto(process.env.APP_ORIGIN || 'http://127.0.0.1:5177/ea-app/');
 await page.waitForSelector('.ea-startup',{state:'detached'});
 const settings=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.waitForTimeout(350)};
 const shapes=async()=>{const button=page.getByRole('button',{name:'Select Shape',exact:true});if(await button.locator('.lucide-chevron-down').count())await button.click()};
 const home=async()=>{await page.getByRole('button',{name:'Home',exact:true}).click();await page.waitForTimeout(350)};
 for(const [layout,label] of [['regular','Regular Interface'],['s2tone','S2tone_'],['matrix','The Matrix Interface']]){
  await settings();await page.getByRole('button',{name:'Select Main Interface'}).click();await page.getByRole('button',{name:label,exact:false}).click();await shapes();
  assert.equal(await page.getByRole('button',{name:/Cornerstone|Fortress/}).count(),0);
  for(const [shape,option] of [['none','None'],['orbit','The Orbit'],['neural','The Neural Interface'],['none','None']]){
   await page.getByRole('button',{name:new RegExp(option)}).click();
   // Changes must already be present behind Settings, with no navigation/reload.
   assert.equal(await page.locator('[data-robot-shape]').getAttribute('data-robot-shape'),shape);
   assert.equal(await page.evaluate(()=>localStorage.getItem('ea-cloud:client:7:robot-shape')),shape);
   await home();
   const frame=page.locator('[data-robot-shape]');
   const state=await frame.evaluate(el=>{const css=getComputedStyle(el);const img=el.tagName==='IMG'?el:el.querySelector('img');const box=el.getBoundingClientRect();return {tag:el.tagName,border:css.borderTopWidth,radius:css.borderRadius,background:css.backgroundImage,shadow:css.boxShadow,clip:css.clipPath,fit:css.objectFit,imageLoaded:img?.naturalWidth>0,x:box.x+box.width/2,viewport:innerWidth,naturalWidth:img?.naturalWidth,naturalHeight:img?.naturalHeight,width:box.width,height:box.height,parentChildren:el.parentElement.children.length}});
   assert(state.imageLoaded);assert(Math.abs(state.x-state.viewport/2)<1);
   if(shape==='none'){
    assert.equal(state.tag,'IMG');assert.equal(state.border,'0px');assert.equal(state.radius,'0px');assert.equal(state.background,'none');assert.equal(state.shadow,'none');assert.equal(state.clip,'none');assert.equal(state.fit,'contain');
    assert(Math.abs(state.width/state.height-state.naturalWidth/state.naturalHeight)<.01, 'Unframed image must keep its intrinsic proportions');
    assert.equal(await page.locator('.robot-frame-outline').count(),0);
    // With no frame wrapper, no rings or pulse siblings may surround this image.
    if(layout==='matrix')assert(await frame.locator('..').getAttribute('class').then(c=>c.includes('flex-col')));
   }else if(shape==='neural')assert.equal(await page.locator('.robot-frame-outline').count(),1);
   else assert.notEqual(state.border,'0px');
   await page.screenshot({path:`work/shape-selection/${layout}-${shape}.png`});results.push({layout,shape,...state});
   await settings();await shapes();
  }
  await page.reload();await page.waitForSelector('.ea-startup',{state:'detached'});
  assert.equal(await page.locator('[data-robot-shape]').getAttribute('data-robot-shape'),'none');
  await settings();await shapes();
  assert.equal(await page.getByRole('button',{name:/None/}).getAttribute('aria-pressed'),'true');
  // Close the shape accordion before choosing the next interface.
  await shapes();await home();
 }
 await writeFile('work/shape-selection/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({layout:r.layout,shape:r.shape,imageLoaded:r.imageLoaded,tag:r.tag})),null,2));
}finally{await browser.close()}
