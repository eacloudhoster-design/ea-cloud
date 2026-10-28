import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.APP_ORIGIN || 'http://127.0.0.1:5234/ea-app/';
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output='work/shared-controls'; await mkdir(output,{recursive:true});
const baseline=process.env.BASELINE==='1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const records=[];
try {
for(const width of (process.env.CONTROL_WIDTHS || '390,320,1280').split(',').map(Number)) for(const style of ['regular','matrix','lumo']) {
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,userAgent:width<600?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':undefined});
    await context.addInitScript(({ style }) => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
      localStorage.setItem('ea-cloud:client:7:home-appearance', JSON.stringify({ interfaceStyle: style, showBg: true, backgroundAnimation: 'none', accentColor: '#ef4444' }));
    }, { style });
    await context.route('https://fonts.**', r => r.abort());
    let signedOut = false, running = false;
    const writes = [];
    await context.route('**/api/**', async r => {
      const path = new URL(r.request().url()).pathname;
      if (path === '/api/app/logout') { signedOut = true; return r.fulfill({ json: { ok: true } }); }
      if (path === '/api/app/me' && signedOut) return r.fulfill({ status: 401, json: {} });
      let json = [];
      if (path === '/api/app/me') json = { id: 7, token: btoa('7:client:cookie'), status: 'approved', licenseKey: 'TEST' };
      if (path === '/api/app/dashboard') json = { mentor: { id: 5, robotName: 'EA Cloud Pro', backgroundImageUrl: '/default-robot.jpg' }, eas: [] };
      if (path === '/api/app/ea-mode-images') json = { eas: [{ id: 1, name: 'EA Cloud Pro', images: Array(4).fill('/default-robot.jpg') }] };
      if (path === '/api/app/trading-controls') { if(r.request().method()==='PATCH'){running=r.request().postDataJSON().copyingEnabled;writes.push(running);} json={copyingEnabled:running}; }
      if (path.endsWith('/activity/snapshot')) json={observedAt:Date.now(),engine:false,robotEnabled:running,connected:false,tradeAllowed:false,account:null,symbols:[]};
      if (path.endsWith('/activity')) json={events:[]};
      if (path === '/api/app/scanner/history') json = { records: [], hasMore: false };
      return r.fulfill({ json });
    });


 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin); await page.waitForSelector('.ea-startup',{state:'detached',timeout:25000});await page.waitForTimeout(300);
 const record=await page.evaluate(({style,width})=>{
  const rect=s=>{const n=document.querySelector(s);if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  return {style,width,name:rect('[data-bot-name="primary"]'),portrait:rect('[data-portrait-interactive]'),dock:rect('nav[aria-label="Main navigation"]'),lumo:style==='lumo'?rect('.lumo-controls'):null};
 },{style,width});records.push(record);
 if(!baseline){
  const controls=page.getByRole('group',{name:'Robot controls',exact:true});assert.equal(await controls.count(),1);
  const panel=await controls.boundingBox();
  assert(panel.width<=width&&panel.x>=0);assert.equal(panel.height,118);
  const styles=await controls.evaluate(n=>{const c=getComputedStyle(n);return {radius:c.borderRadius,background:c.backgroundImage,padding:c.padding,shadow:c.boxShadow,width:c.width};});
  const previous=records.find(r=>r.width===width&&r.panelStyle);if(previous)assert.deepEqual(styles,previous.panelStyle,'same Lumo skin across interfaces');record.panelStyle=styles;
  await controls.getByRole('button',{name:'Quotes',exact:true}).click();await page.getByRole('button',{name:'SELECTED SYMBOLS',exact:true}).waitFor();await page.locator('button:has(.lucide-chevron-left)').click();
  await controls.getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('heading',{name:'Remove EA?',exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(writes,[]);
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/app/trading-controls')&&r.request().method()==='PATCH',{timeout:5000}),controls.getByRole('button',{name:'Start',exact:true}).click()]);await page.getByRole('button',{name:'Close trading activity',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/app/trading-controls')&&r.request().method()==='PATCH',{timeout:5000}),controls.getByRole('button',{name:'Stop',exact:true}).click()]);
  await page.waitForFunction(()=>document.querySelector('.lumo-toggle')?.getAttribute('aria-label')==='Start');
  assert.deepEqual(writes,[true,false]);
  if(width===390) {
   const nav=page.getByRole('navigation',{name:'Main navigation'});
   for(const [label,colour] of [['Electric Blue','#3b82f6'],['Royal Purple','#a855f7'],['Pure Red','#ef4444']]) {
    await nav.getByRole('button',{name:'Settings',exact:true}).click();
    const option=page.getByRole('button',{name:label,exact:true});
    if(!await option.isVisible())await page.getByRole('button',{name:'Select Colour',exact:true}).click();
    await option.click();await nav.getByRole('button',{name:'Home',exact:true}).click();
    assert.equal(await controls.evaluate(n=>getComputedStyle(n).getPropertyValue('--lumo-accent').trim()),colour);
   }
  }
 }
 // Scroll only the existing Home surface to show the panel; do not resize it.
 const controls=page.locator('.lumo-controls');if(await controls.count())await controls.scrollIntoViewIfNeeded();
 await page.waitForTimeout(300);
 if(!baseline){const p=await controls.boundingBox(),d=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox();assert(p.y+p.height<=d.y,'control panel must not overlap the dock');}
 await page.screenshot({path:`${output}/${baseline?'before':'after'}-${width}-${style}.png`});
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${style} ${width}px`);
}
}finally{await browser.close();}
if(!baseline){const saved=await readFile(`${output}/before.json`,'utf8').catch(()=>null);if(saved){const before=JSON.parse(saved);for(const r of records){const b=before.find(v=>v.style===r.style&&v.width===r.width);const {panelStyle,...geometry}=r;assert.deepEqual(geometry,b,'non-panel geometry and complete Lumo panel must remain unchanged');}}}
await writeFile(`${output}/${baseline?'before':'after'}.json`,JSON.stringify(records,null,2));
