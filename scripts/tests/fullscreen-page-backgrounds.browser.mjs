import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.APP_ORIGIN || 'http://127.0.0.1:5234/ea-app/';
const output=process.env.CAPTURE_DIR || 'work/fullscreen-backgrounds';
const baseline=process.env.BASELINE==='1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const geometries=[];
try {
for(const [width,height,top,bottom,style,mobile] of [[390,844,44,34,'regular',true],[393,852,59,34,'matrix',true],[430,932,59,34,'s2tone',true],[844,390,0,21,'lumo',true],[1280,900,0,0,'matrix',false]]) {
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,userAgent:mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':undefined});
    await context.addInitScript(({ style, mobile }) => {
      Object.defineProperty(navigator, 'standalone', { value: mobile });
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
      localStorage.setItem('ea-cloud:client:7:home-appearance', JSON.stringify({ interfaceStyle: style, showBg: true, backgroundAnimation: 'none', accentColor: '#ef4444' }));
    }, { style, mobile });
    await context.route('https://fonts.**', r => r.abort());
    let signedOut = false;
    await context.route('**/api/**', async r => {
      const path = new URL(r.request().url()).pathname;
      if (path === '/api/app/logout') { signedOut = true; return r.fulfill({ json: { ok: true } }); }
      if (path === '/api/app/me' && signedOut) return r.fulfill({ status: 401, json: {} });
      let json = [];
      if (path === '/api/app/me') json = { id: 7, token: btoa('7:client:cookie'), status: 'approved', licenseKey: 'TEST' };
      if (path === '/api/app/dashboard') json = { mentor: { id: 5, robotName: 'EA Cloud Pro', backgroundImageUrl: '/default-robot.jpg' }, eas: [] };
      if (path === '/api/app/ea-mode-images') json = { eas: [{ id: 1, name: 'EA Cloud Pro', images: Array(4).fill('/default-robot.jpg') }] };
      if (path === '/api/app/trading-controls') json = { copyingEnabled: false };
      if (path === '/api/app/scanner/history') json = { records: [], hasMore: false };
      return r.fulfill({ json });
    });


 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.waitForSelector('.ea-startup',{state:'detached',timeout:25000});
 // Chromium has no native iOS safe-area environment. Inject only the existing
 // safe-area custom properties, never viewport/scale or foreground dimensions.
 await page.addStyleTag({content:`.ea-app-viewport {--ea-status-inset:${top}px;--ea-content-safe-bottom:${bottom}px}`});
 const rect=selector=>page.locator(selector).first().boundingBox();
 const geometry={width,height,style,home:await rect('[data-home-screen]'),dock:await rect('nav[aria-label="Main navigation"]')};
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.waitForTimeout(300);
 geometry.settings=await rect('.ea-settings-header');geometry.card=await rect('.ea-settings-card');
 assert(geometry.settings.y>=top,'Settings foreground must stay below the status bar');
 const verify=async selector=>{
  const bounds=await rect(selector); assert.deepEqual(bounds,{x:0,y:0,width,height});
  const image=page.locator(`${selector} img`).first();await image.evaluate(n=>n.decode());
  assert.equal(await image.getAttribute('src'),'/default-robot.jpg');
  assert.equal(await image.evaluate(n=>getComputedStyle(n).objectFit),'cover');
 };
 if(!baseline&&mobile) await verify('.ea-settings-fullscreen-background');
 if(!baseline&&!mobile) assert.equal(await page.locator('.ea-settings-fullscreen-background').count(),0,'desktop retains its original background');
 await page.screenshot({path:`${output}/${baseline?'before':'after'}-${width}-settings.png`});
 await page.getByRole('button',{name:'Chart Scanner',exact:true}).click();await page.getByRole('button',{name:'Close scanner',exact:true}).waitFor();
 geometry.scannerHeader=await rect('.scanner-header');geometry.scanner=await rect('.scanner-screen');
 assert.equal(geometry.scanner.y,top,'Scanner foreground retains its safe-area origin');
 if(!baseline&&mobile) { await verify('.scanner-fullscreen-background'); assert.equal(await page.locator('.ea-settings').evaluate(n=>getComputedStyle(n).visibility),'hidden','covered Settings controls must not bleed through Scanner'); }
 await page.screenshot({path:`${output}/${baseline?'before':'after'}-${width}-scanner.png`});
 await page.getByRole('button',{name:'Close scanner',exact:true}).click();
 await nav.getByRole('button',{name:'MetaTrader',exact:true}).click();await page.waitForTimeout(300);
 await nav.getByRole('button',{name:'Home',exact:true}).click();await page.waitForTimeout(300);
 assert.deepEqual(await rect('nav[aria-label="Main navigation"]'),geometry.dock);
 assert.equal(await page.evaluate(()=>innerWidth),width);
 assert.equal(await page.evaluate(()=>visualViewport.scale),1);
 assert.deepEqual(errors,[]);geometries.push(geometry);await context.close();
 console.log(`PASS ${width}x${height}, safe area ${top}/${bottom}, ${style}`);
}
}finally{await browser.close();}
if(!baseline){const saved=await readFile(`${output}/before.json`,'utf8').catch(()=>null);if(saved)assert.deepEqual(geometries,JSON.parse(saved),'foreground geometry must exactly match main');}
await writeFile(`${output}/${baseline?'before':'after'}.json`,JSON.stringify(geometries,null,2));
