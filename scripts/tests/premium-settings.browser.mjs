import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.APP_ORIGIN || 'http://127.0.0.1:5233/';
const output=process.env.SETTINGS_CAPTURE_DIR || 'work/premium-settings';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
for(const width of [390,360,1280]) {
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600, reducedMotion:width===1280?'reduce':'no-preference',
 userAgent:width<600?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':undefined});
 const style='matrix';
    await context.addInitScript(({ style }) => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
      localStorage.setItem('ea-cloud:client:7:home-appearance', JSON.stringify({ interfaceStyle: style, showBg: true, backgroundAnimation: 'none', accentColor: '#ef4444' }));
    }, { style });
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

 const page=await context.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 await page.waitForSelector('.ea-startup',{state:'detached',timeout:25000});
 const dock=()=>page.locator('nav[aria-label="Main navigation"]').boundingBox();
 const originalDock=await dock();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Settings',exact:true}).click();
 const settings=page.locator('.ea-settings');
 await page.waitForTimeout(300);
 for(const name of ['Select Main Interface','Control Panel','Select Shape','Select Colour','Select Font','EA Manipulation','Chart Scanner','Back Animation','Live Shot','Admin Portal','Sign Out'])
   assert.equal(await settings.getByRole(name==='Admin Portal'?'link':'button',{name,exact:true}).count(),1);
 await page.screenshot({path:`${output}/${width}-collapsed.png`});
 const open=async name=>{await settings.getByRole('button',{name,exact:true}).click(); await page.waitForTimeout(260);};
 await open('Select Main Interface');
 for(const name of ['Regular Interface','The Matrix Interface','S2tone_','Lumo']) await settings.getByRole('button',{name:new RegExp(name)}).click();
 await open('Select Shape');
 for(const name of ['None','The Orbit','The Neural Interface']) await settings.getByRole('button',{name:new RegExp('^'+name)}).click();
 await open('Select Colour');
 await settings.getByRole('button',{name:'Electric Blue',exact:true}).click();
 assert.equal(await settings.evaluate(n=>getComputedStyle(n).getPropertyValue('--settings-accent').trim()),'#3b82f6');
 await settings.getByRole('button',{name:'Royal Purple',exact:true}).click();
 await settings.locator('.ea-settings-scroll').evaluate(n=>n.scrollTop=0);
 await page.waitForTimeout(260);
 await page.screenshot({path:`${output}/${width}-purple-expanded.png`});
 assert.equal(await settings.evaluate(n=>getComputedStyle(n).getPropertyValue('--settings-accent').trim()),'#a855f7');
 await open('Select Font');
 await settings.getByRole('button',{name:'Inter',exact:true}).click();
 await open('EA Manipulation');
 for(const name of ['NORMAL','BEAST','AGGRESSIVE','ULTIMATE']) {
  const button=settings.getByRole('button',{name:`${name} visual mode`,exact:true}); await button.click(); assert.equal(await button.getAttribute('aria-pressed'),'true');
 }
 await open('Back Animation');
 for(const name of ['None','Pulse','Glow','Matrix Rain','Particles']) {
  const button=settings.getByRole('button',{name,exact:true}); await button.click(); assert.equal(await button.getAttribute('aria-pressed'),'true');
 }
 await settings.getByRole('button',{name:'None',exact:true}).click();
 await open('Back Animation');
 await settings.getByRole('button',{name:'Live Shot',exact:true}).click();
 await page.getByRole('button',{name:'Back from Live Shot',exact:true}).click();
 assert.equal(await settings.getByRole('link',{name:'Admin Portal'}).getAttribute('href'),'/admin/login');
 // Existing push/sign-out handlers are deliberately not invoked against services.
 assert.equal(await settings.getByRole('button',{name:'Enable or repair push notifications'}).count(),1);
 await settings.getByRole('button',{name:'Chart Scanner',exact:true}).click();
 assert(await page.getByRole('button',{name:'Close scanner',exact:true}).isVisible());
 await page.getByRole('button',{name:'Close scanner',exact:true}).click();
 await page.waitForTimeout(300);
 assert.deepEqual(await dock(),originalDock,'dock must retain its original geometry');
 assert(await settings.evaluate(n=>n.scrollWidth<=n.clientWidth),'settings must not overflow horizontally');
 await settings.getByRole('button',{name:'Sign Out',exact:true}).click();
 await page.waitForTimeout(500);
 await page.screenshot({path:`${output}/${width}-signed-out.png`});
 await page.locator('.get-app-field').first().waitFor();
 assert.equal(await page.locator('.ea-settings').count(),0);
 assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px: controls, themes, navigation geometry, overflow`);
 await context.close();
}
}finally{await browser.close();}
