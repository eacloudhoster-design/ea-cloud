import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const stage=process.env.MT5_VISUAL_STAGE||'after',origin=process.env.MT5_PREVIEW_ORIGIN||'http://127.0.0.1:5182';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
await mkdir('work/mt5-visual',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try{
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:430,height:932},{width:1024,height:900}]){
  const page=await browser.newPage({viewport});
  await page.addInitScript(()=>localStorage.setItem('appClientToken','visual-fixture'));
  await page.routeWebSocket('**/api/ws?*',()=>{});
  await page.route('https://fonts.**',r=>r.abort());
  await page.route('**/fixture-robot.jpg',r=>r.fulfill({path:'artifacts/ea-cloud/public/default-robot.jpg',contentType:'image/jpeg'}));
  await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:p==='/api/app/me'?{status:'approved',licenseKey:'fixture'}:p==='/api/app/dashboard'?{mentor:{robotName:'SMC Blueprint EA V3+',backgroundImageUrl:'/fixture-robot.jpg'},eas:[]}:p==='/api/app/trading-controls'?{copyingEnabled:true}:p==='/api/app/activity'?{events:[]}:p==='/api/app/activity/snapshot'?{observedAt:Date.now(),symbols:[],connected:false}:[]})});
  await page.goto(origin+'/ea-app/');await page.waitForSelector('.ea-startup',{state:'detached'});
  await page.getByRole('button',{name:'MetaTrader',exact:true}).click();await page.waitForTimeout(900);
  await page.evaluate(()=>document.fonts.ready);
  const result=await page.locator('.mt5-screen').evaluate(el=>{
   const rect=s=>{const b=el.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};
   const styles=(selector,props)=>{const s=getComputedStyle(el.querySelector(selector));return Object.fromEntries(props.map(p=>[p,s.getPropertyValue(p)]))};
   return {viewport:{width:innerWidth,height:innerHeight},boxes:Object.fromEntries(['.mt5-topline','.mt5-platform-logo','.mt5-intro h2','.mt5-intro p','#mt5-login','#mt5-password','#mt5-server','.mt5-connect-button','.mt5-availability-note'].map(s=>[s,rect(s)])),logoStyles:styles('.mt5-platform-logo',['width','height','object-fit','border-radius','box-shadow','filter']),buttonStyles:styles('.mt5-connect-button',['width','height','border','border-radius','background','box-shadow','font-family','font-size','font-weight','color']),heading:styles('.mt5-intro h2',['font-family','font-size','font-weight','letter-spacing','color']),labels:[...el.querySelectorAll('label')].map(l=>({text:l.textContent,font:getComputedStyle(l).fontFamily,weight:getComputedStyle(l).fontWeight,color:getComputedStyle(l).color})),image:{src:el.querySelector('.mt5-mentor-background').getAttribute('src'),opacity:getComputedStyle(el.querySelector('.mt5-mentor-background')).opacity},disclaimer:el.querySelector('.mt5-availability-note').textContent,headingFits:el.querySelector('h2').scrollWidth<=el.querySelector('h2').clientWidth};
  });
  assert(result.headingFits,'Heading must not overflow');
  if(stage==='after'){
   let old;
   try{old=JSON.parse(await readFile(`work/mt5-visual/before-${viewport.width}.json`,'utf8'))}
   catch{old=JSON.parse(await readFile('docs/mt5-visual/measurements.json','utf8')).before.find(r=>r.viewport.width===viewport.width)}
   for(const [selector,box]of Object.entries(result.boxes))for(const key of ['x','y','width','height'])assert(Math.abs(box[key]-old.boxes[selector][key])<1,`${viewport.width}: ${selector} ${key} moved: ${old.boxes[selector][key]} -> ${box[key]}`);
   assert.deepEqual(result.logoStyles,old.logoStyles);assert.deepEqual(result.buttonStyles,old.buttonStyles);assert.equal(result.disclaimer,old.disclaimer);assert.equal(result.image.src,old.image.src);assert(Number(result.image.opacity)>Number(old.image.opacity));assert(Number(result.heading['font-weight'])>Number(old.heading['font-weight']));
  }
  await page.screenshot({path:`work/mt5-visual/${stage}-${viewport.width}.png`});await writeFile(`work/mt5-visual/${stage}-${viewport.width}.json`,JSON.stringify(result,null,2));results.push(result);await page.close();
 }
 console.log(JSON.stringify({stage,viewports:results.map(r=>r.viewport),layoutPreserved:stage==='after'},null,2));
}finally{await browser.close()}
