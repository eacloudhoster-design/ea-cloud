import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.APP_ORIGIN || 'http://127.0.0.1:5191';
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
mkdirSync('work/ui-fixes',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try {
 for(const width of [390,320]) {
  const ctx=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true});
  const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);let writes=0;
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>localStorage.setItem('appClientToken',btoa('7:client:fixture')));
  await ctx.routeWebSocket('**/api/ws?*',()=>{});
  await ctx.route('https://fonts.**',r=>r.abort());
  await ctx.route('**/fixture-robot.jpg',r=>r.fulfill({path:'artifacts/ea-cloud/public/default-robot.jpg',contentType:'image/jpeg'}));
  await ctx.route('**/api/**',async r=>{
   const p=new URL(r.request().url()).pathname;
   if(r.request().method()!=='GET')writes++;
   if(p.endsWith('/scanner/chart')) { await new Promise(resolve=>setTimeout(resolve,1800));return r.fulfill({status:503,json:{error:'Isolated analysis fixture unavailable'}}).catch(()=>{}); }

   return r.fulfill({json:p.endsWith('/me')?{status:'approved',licenseKey:'fixture'}:p.endsWith('/dashboard')?{mentor:{robotName:'Fixture Bot',backgroundImageUrl:'/fixture-robot.jpg'},eas:[]}:p.endsWith('/trading-controls')?{copyingEnabled:false}:p.endsWith('/activity/snapshot')?{connected:false,engine:false,robotEnabled:false,tradeAllowed:false,account:null,symbols:[]}:p.endsWith('/activity')?{events:[]}:p.includes('/scanner/history')?{records:[],hasMore:false}:[]});
  });
  await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'detached'});
  const settings=()=>page.getByRole('button',{name:'Settings',exact:true});
  const open=async()=>{await settings().tap();await page.waitForTimeout(340)};
  const accordion=async name=>{const b=page.getByRole('button',{name,exact:true});if(await b.locator('.lucide-chevron-down').count())await b.tap()};
  const stored=()=>page.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort()));
  for(const iface of ['Regular Interface','S2tone_','The Matrix Interface']) {
   await open();await accordion('Select Main Interface');await page.getByRole('button',{name:iface}).tap({position:{x:30,y:20}});
   await accordion('Select Font');
   const before=await stored(),beforeWrites=writes;
   // Instrument the actual Home subtree: any accidental control activation is a failure.
   await page.locator('[inert]').first().evaluate(el=>{window.homeClicks=0;el.addEventListener('click',()=>window.homeClicks++,true)});
   const backdrop=page.getByRole('button',{name:'Close Settings',exact:true});
   assert.equal(await page.evaluate(()=>document.elementFromPoint(8,300)?.getAttribute('aria-label')),'Close Settings');
   await page.touchscreen.tap(8,300);
   assert.equal(await page.evaluate(()=>document.elementFromPoint(8,300)?.getAttribute('aria-label')),'Close Settings','closing animation must still intercept taps');
   await page.waitForTimeout(350);assert.equal(await backdrop.count(),0);
   assert.equal(await stored(),before);assert.equal(writes,beforeWrites);assert.equal(await page.evaluate(()=>window.homeClicks),0);
   assert.equal(await page.locator('[data-home-background]').evaluate(el=>getComputedStyle(el).opacity),'1');
   await open();await accordion('Select Shape');assert(await page.getByRole('button',{name:'The Orbit'}).isEnabled());
   await backdrop.tap();await page.waitForTimeout(350);
   results.push({width,interface:iface,dismissed:true,preferencesUnchanged:true,noHomeClicks:true});
  }
  for(const [label,color] of [['Pure Red','#ef4444'],['Emerald Green','#22c55e'],['Electric Blue','#3b82f6'],['Royal Purple','#a855f7']]) {
   await open();await accordion('Select Colour');await page.getByRole('button',{name:label,exact:true}).tap({position:{x:25,y:20}});
   await page.getByRole('button',{name:'Chart Scanner',exact:true}).tap();
   const scanner=page.locator('.scanner-screen');await scanner.waitFor();
   assert.equal(await scanner.evaluate(el=>getComputedStyle(el).getPropertyValue('--scanner-accent').trim()),color);
   const styles=await scanner.evaluate(el=>{
    const read=(sel,prop)=>getComputedStyle(el.querySelector(sel)).getPropertyValue(prop);
    return {primary:read('.scanner-primary','background-color'),selected:read('.scanner-strategies button[aria-pressed=true]','border-color'),orbit:read('.scanner-orbit','border-color'),glow:read('.scanner-orb-avatar','box-shadow'),geometry:el.querySelector('.scanner-ready').getBoundingClientRect().toJSON()};
   });
   if(results.filter(r=>r.color&&r.width===width).length){const first=results.find(r=>r.color&&r.width===width);assert.deepEqual(styles.geometry,first.styles.geometry);assert.notEqual(styles.primary,first.styles.primary)}
   await scanner.getByRole('button',{name:'SMC',exact:true}).tap();
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=500;c.getContext('2d').fillRect(0,0,900,500);return c.toDataURL().split(',')[1]});
   await scanner.locator('input[type=file]').first().setInputFiles({name:'test-chart.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await scanner.getByRole('heading',{name:'Your chart is ready'}).waitFor();
   await scanner.getByRole('button',{name:'Analyse chart',exact:true}).tap();
   await scanner.locator('.scanner-image-scan-beam').waitFor();
   styles.scanBeam=await scanner.locator('.scanner-image-scan-beam').evaluate(el=>getComputedStyle(el).backgroundImage);
   await page.screenshot({path:`work/ui-fixes/${width}-${label.replaceAll(' ','-')}-scanning.png`});
   await scanner.locator('.scanner-error').waitFor();
   assert.equal(await scanner.locator('.scanner-error').evaluate(el=>getComputedStyle(el).color),'rgb(255, 209, 200)','error colour must retain its semantic meaning');

   await scanner.getByRole('button',{name:'Edit trade settings',exact:true}).tap();
   const sheet=page.getByRole('dialog',{name:'Trade Settings',exact:true});await sheet.waitFor();
   assert.equal(await sheet.evaluate(el=>getComputedStyle(el).getPropertyValue('--scanner-accent').trim()),color);
   await page.screenshot({path:`work/ui-fixes/${width}-${label.replaceAll(' ','-')}.png`});
   await sheet.getByRole('button',{name:'Close trade settings',exact:true}).tap();await scanner.getByRole('button',{name:'Close scanner',exact:true}).tap();
   await page.getByRole('button',{name:'Close Settings',exact:true}).tap();await page.waitForTimeout(350);
   results.push({width,color,styles});
  }
  assert.deepEqual(errors,[]);await ctx.close();
 }
 writeFileSync('work/ui-fixes/results.json',JSON.stringify(results,null,2));console.log('PASS: 6 mobile interface dismissal cases and 8 scanner colour cases, using real touch input.');
} finally{await browser.close()}
