import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {appRequest} from './in-process-http.mjs';
import {requestBackgroundUpload,storedBackground} from '../../../functions/_lib/background-storage.js';

export async function verifyModeBrowser(app,engine){
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const origin=process.env.MODE_ORIGIN||'http://127.0.0.1:5213';
 assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
 const output='work/ea-mode-tests';await mkdir(output,{recursive:true});
 const picture=await readFile('artifacts/ea-cloud/public/default-robot.jpg');
 const pictures=await Promise.all(['artifacts/ea-cloud/public/default-robot.jpg','artifacts/ea-app/public/apple-touch-icon.jpeg','artifacts/ea-cloud/public/ea-cloud-logo.jpeg','artifacts/ea-cloud/public/opengraph.jpg'].map(path=>readFile(path)));
 const bucket=new Map();const mutations=[];const nativeFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  if(new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).host==='backend.fixture')return Response.json({id:5,role:'mentor',status:'approved'});
  return nativeFetch(input,init);
 };
 const env={BACKEND_ORIGIN:'https://backend.fixture',BACKGROUND_IMAGES:{
  async put(key,bytes,options){if(bucket.has(key))return null;bucket.set(key,{bytes,options});return {key};},
  async get(key){const item=bucket.get(key);return item?{body:item.bytes,size:item.bytes.length,httpEtag:'"fixture"',writeHttpMetadata(headers){headers.set('Content-Type',item.options.httpMetadata.contentType);}}:null;}
 }};
 const wire=async(context)=>{
  await context.routeWebSocket('**/api/ws?*',()=>{});
  await context.route('https://fonts.**',r=>r.abort());
  await context.route('https://images.example/**',r=>r.fulfill({body:picture,contentType:'image/jpeg'}));
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()!=='GET')mutations.push({path,method:request.method()});
   let response;
   const raw=new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.method()!=='GET'&&request.method()!=='HEAD'?{body:request.postDataBuffer()}:{} )});
   if(path==='/api/storage/uploads/request-url')response=await requestBackgroundUpload({request:raw,env});
   else if(path.startsWith('/api/storage/r2/'))response=await storedBackground({request:raw,env});
   else if(path.endsWith('/mode-images')||path==='/api/app/ea-mode-images'||path==='/api/app/me')response=await appRequest(app,request.url(),{method:request.method(),headers:request.headers(),...(request.postDataBuffer()?{body:request.postDataBuffer()}:{} )});
   else if(path==='/api/auth/me'||path==='/api/profile')response=Response.json({id:5,role:'mentor',status:'approved',email:'mentor@example.invalid',backgroundImageUrl:'https://images.example/legacy.png'});
   else if(path==='/api/eas')response=Response.json([11,12].map(id=>({id,name:id===11?'EA One':'EA Two',symbol:'XAUUSD',lotSize:'0.01',riskLevel:'medium',isActive:true})));
   else if(path==='/api/app/me')response=Response.json({id:7,status:'approved',licenseKey:'VALID'});
   else if(path==='/api/app/dashboard'){
     const other=request.headers().authorization?.includes(Buffer.from('9:client:fixture').toString('base64'));
     response=Response.json({mentor:{id:other?6:5,robotName:other?'Other mentor':'EA One',backgroundImageUrl:other?null:'https://images.example/legacy.png'},eas:[]});
   }
   else if(path.endsWith('/trading-controls'))response=Response.json({copyingEnabled:false});
   else if(path.endsWith('/activity/snapshot'))response=Response.json({connected:false,robotEnabled:false,account:null,symbols:[]});
   else response=Response.json([]);
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
 };
 try{
  const mentor=await browser.newContext({viewport:{width:1100,height:900}});await wire(mentor);
  await mentor.addInitScript(()=>localStorage.setItem('token',btoa('5:mentor:fixture')));
  const portal=await mentor.newPage();await portal.goto(origin+'/admin/profile');
  const dialog=portal.locator('.mentor-background-editor');await dialog.getByRole('button',{name:'Save artwork',exact:true}).waitFor();
  await portal.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save artwork'&&!b.disabled));
  for(const [index,name] of ['NORMAL','BEAST','AGGRESSIVE','ULTIMATE'].entries()){
   await dialog.getByLabel(`Upload ${name} image`,{exact:true}).setInputFiles({name:name+'.jpg',mimeType:'image/jpeg',buffer:pictures[index]});
   await portal.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save artwork'&&!b.disabled));
  }
  assert.equal(await dialog.getByRole('alert').count(),0);
  assert.equal(bucket.size,4);
  for(const [index,value] of [...bucket.values()].entries())assert.deepEqual(Buffer.from(value.bytes),pictures[index]);
  await dialog.getByRole('button',{name:'Save artwork',exact:true}).click();
  await dialog.getByRole('status').filter({hasText:'Artwork saved'}).waitFor();
  const saved=(await engine.query('SELECT * FROM ea_mode_images WHERE ea_id=11')).rows[0];
  assert.ok(saved.normal&&saved.beast&&saved.aggressive&&saved.ultimate);
  await portal.screenshot({path:output+'/mentor-uploads.png'});
  await portal.reload();
  await portal.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save artwork'&&!b.disabled));
  assert.equal(await portal.getByAltText('BEAST artwork preview').getAttribute('src'),saved.beast);
  const client=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await wire(client);
  await client.addInitScript(()=>{
   if(!localStorage.getItem('appClientToken'))localStorage.setItem('appClientToken',btoa('7:client:fixture'));
   if(!localStorage.getItem('ea-cloud:client:7:home-appearance'))localStorage.setItem('ea-cloud:client:7:home-appearance',JSON.stringify({interfaceStyle:'regular',accentColor:'#00c9ed',showBg:true,backgroundAnimation:'none'}));
  });
  const page=await client.newPage();await page.goto(origin+'/ea-app/');await page.locator('.ea-startup').waitFor({state:'detached'});
  const nav=page.locator('.ea-app-viewport > .ea-glass-navigation');await nav.getByRole('button',{name:'Settings',exact:true}).tap();
  await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();await page.locator('.ea-mode-card').first().waitFor();
  const originalNav=await nav.boundingBox();
  const assertArtwork=async expected=>{
    await page.waitForFunction(url=>{
      const background=document.querySelector('[data-home-background]');
      const portrait=document.querySelector('.robot-image-frame img');
      const circle=document.querySelector('.trading-activity-trigger img');
      return [background,portrait,circle].every(img=>img&&img.getAttribute('src')===url&&img.complete&&img.naturalWidth>0);
    },expected);
  };
  await assertArtwork(saved.normal);
  assert.equal(await page.getByRole('button',{name:'NORMAL visual mode'}).getAttribute('aria-pressed'),'true');
  for(const [index,name] of ['NORMAL','BEAST','AGGRESSIVE','ULTIMATE'].entries())assert.equal(await page.locator('.ea-mode-card img').nth(index).getAttribute('src'),saved[name.toLowerCase()]);
  const before=mutations.length;
  for(const name of ['NORMAL','BEAST','AGGRESSIVE','ULTIMATE','NORMAL','BEAST']){
   await page.getByRole('button',{name:`${name} visual mode`}).tap();
   assert.equal(await page.locator('.ea-mode-card[aria-pressed=true]').count(),1);
   await assertArtwork(saved[name.toLowerCase()]);
  }
  await client.route('https://images.example/missing.jpg',r=>r.fulfill({status:404,body:'missing'}));
  await engine.query('UPDATE ea_mode_images SET ultimate=$1 WHERE ea_id=11',['https://images.example/missing.jpg']);
  await page.getByRole('button',{name:'ULTIMATE visual mode'}).tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelectorAll('.ea-mode-card img')[3]?.getAttribute('src')==='https://images.example/missing.jpg');
  await assertArtwork(saved.normal);
  assert.equal(await page.getByRole('button',{name:'ULTIMATE visual mode'}).getAttribute('aria-pressed'),'true');
  await engine.query('UPDATE ea_mode_images SET ultimate=$1 WHERE ea_id=11',[saved.ultimate]);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await assertArtwork(saved.ultimate);
  await page.getByRole('button',{name:'BEAST visual mode'}).tap();await assertArtwork(saved.beast);
  assert.equal(mutations.length,before,'mode selection sends no API writes');
  await assertArtwork(saved.beast);
  assert.deepEqual(await nav.boundingBox(),originalNav);
  await nav.getByRole('button',{name:'Home',exact:true}).tap();await nav.getByRole('button',{name:'Settings',exact:true}).tap();
  assert.equal(await page.getByRole('button',{name:'BEAST visual mode'}).getAttribute('aria-pressed'),'true');
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
  assert.equal(await page.getByRole('button',{name:'BEAST visual mode'}).getAttribute('aria-pressed'),'true');
  await page.getByLabel('EA artwork',{exact:true}).selectOption('12');
  assert.equal(await page.getByRole('button',{name:'NORMAL visual mode'}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.ea-mode-card img').count(),1);
  await assertArtwork('https://images.example/legacy.png');
  await page.getByRole('button',{name:'ULTIMATE visual mode'}).tap();await assertArtwork('https://images.example/legacy.png');
  await page.getByLabel('EA artwork',{exact:true}).selectOption('11');
  assert.equal(await page.getByRole('button',{name:'BEAST visual mode'}).getAttribute('aria-pressed'),'true');
  await portal.getByLabel('Upload BEAST image',{exact:true}).setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:picture});
  await portal.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save artwork'&&!b.disabled));
  await portal.getByRole('button',{name:'Save artwork',exact:true}).click();
  await portal.getByRole('status').filter({hasText:'Artwork saved'}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(old=>document.querySelectorAll('.ea-mode-card img')[1]?.getAttribute('src')!==old,saved.beast);
  const replacement=(await engine.query('SELECT beast FROM ea_mode_images WHERE ea_id=11')).rows[0].beast;
  await assertArtwork(replacement);
  assert.equal(await page.getByRole('button',{name:'BEAST visual mode'}).getAttribute('aria-pressed'),'true');
  let releaseSlow;
  const slow=new Promise(resolve=>{releaseSlow=resolve;});
  await client.route('https://images.example/slow.jpg',async route=>{await slow;await route.fulfill({body:picture,contentType:'image/jpeg'});});
  await engine.query('UPDATE ea_mode_images SET beast=$1 WHERE ea_id=11',['https://images.example/slow.jpg']);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelectorAll('.ea-mode-card img')[1]?.getAttribute('src')==='https://images.example/slow.jpg');
  await page.getByRole('button',{name:'AGGRESSIVE visual mode'}).tap();await assertArtwork(saved.aggressive);
  releaseSlow();
  await page.waitForFunction(()=>document.querySelectorAll('.ea-mode-card img')[1]?.complete);
  await page.waitForTimeout(200);await assertArtwork(saved.aggressive);
  await engine.query('UPDATE ea_mode_images SET beast=$1 WHERE ea_id=11',[replacement]);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(url=>document.querySelectorAll('.ea-mode-card img')[1]?.getAttribute('src')===url,replacement);
  await page.getByRole('button',{name:'BEAST visual mode'}).tap();await assertArtwork(replacement);
  await page.evaluate(()=>localStorage.setItem('appClientToken',btoa('9:client:fixture')));
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
  await page.getByRole('group',{name:'Other mentor visual modes'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'NORMAL visual mode'}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.ea-mode-card img').count(),0);
  await page.evaluate(()=>localStorage.setItem('appClientToken',btoa('7:client:fixture')));
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
  assert.equal(await page.getByRole('button',{name:'BEAST visual mode'}).getAttribute('aria-pressed'),'true');
  assert.ok(mutations.every(item=>item.path.endsWith('/mode-images')||item.path.startsWith('/api/storage/')),'no trading writes in entire flow');
  await assertArtwork(replacement);
  const modeSources={normal:saved.normal,beast:replacement,aggressive:saved.aggressive,ultimate:saved.ultimate};
  for(const style of ['regular','matrix','s2tone'])for(const shape of ['orbit','neural']){
    await page.evaluate(({style,shape})=>{
      const key='ea-cloud:client:7:home-appearance';const prefs=JSON.parse(localStorage.getItem(key)||'{}');
      localStorage.setItem(key,JSON.stringify({...prefs,interfaceStyle:style}));localStorage.setItem('ea-cloud:client:7:robot-shape',shape);
    },{style,shape});
    await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});
    await assertArtwork(replacement);
    await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
    const geometry=()=>page.locator('.robot-image-frame,.trading-activity-trigger,.ea-app-viewport > .ea-glass-navigation').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    const boxes=await geometry();
    for(const name of ['NORMAL','BEAST','AGGRESSIVE','ULTIMATE']){
      await page.getByRole('button',{name:`${name} visual mode`}).tap();await assertArtwork(modeSources[name.toLowerCase()]);
      assert.deepEqual(await geometry(),boxes,'image containers and navigation stay fixed');
    }
    await page.screenshot({path:`${output}/dynamic-${style}-${shape}.png`});
    await nav.getByRole('button',{name:'Home',exact:true}).tap();await page.waitForTimeout(250);
    await assertArtwork(modeSources.ultimate);await page.screenshot({path:`${output}/dynamic-home-${style}-${shape}.png`});
    await nav.getByRole('button',{name:'Settings',exact:true}).tap();
    await page.getByRole('button',{name:'BEAST visual mode'}).tap();await assertArtwork(replacement);
  }
  await nav.getByRole('button',{name:'Home',exact:true}).tap();
  await page.getByRole('button',{name:'Hide background image',exact:true}).click();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();
  await page.getByRole('button',{name:'AGGRESSIVE visual mode'}).tap();await assertArtwork(saved.aggressive);
  assert.equal(await page.locator('[data-home-background]').evaluate(el=>el.style.opacity),'0');
  await nav.getByRole('button',{name:'Home',exact:true}).tap();
  await page.getByRole('button',{name:'Show background image',exact:true}).click();
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await assertArtwork(saved.aggressive);
  assert.equal(await page.locator('[data-home-background]').evaluate(el=>el.style.opacity),'1');
  const layout=[];
  for(const width of [320,355,390,430]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(260);
   const cards=await page.locator('.ea-mode-card').evaluateAll(elements=>elements.map(el=>{
    const r=el.getBoundingClientRect(),span=el.querySelector('span');return {x:r.x,y:r.y,w:r.width,h:r.height,textWidth:span.scrollWidth,available:span.clientWidth};
   }));
   assert.equal(cards.length,4);assert.ok(cards.every(c=>c.h>c.w&&c.x>=0&&c.x+c.w<=width));
   assert.ok(cards.every(c=>Math.abs(c.y-cards[0].y)<1||Math.abs(c.y-cards[0].y)<=2));
   assert.ok(cards.every(c=>c.textWidth<=c.available),'labels fit: '+JSON.stringify(cards));
   await page.screenshot({path:`${output}/client-${width}.png`});layout.push({width,cards});
  }
  // Session revocation removes the entire authenticated app, not just its cards.
  await page.evaluate(()=>localStorage.setItem('appClientToken',btoa('7:client:fixture')));
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});
  await engine.exec("UPDATE licenses SET status='revoked' WHERE key='VALID'");
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>localStorage.getItem('appClientToken')===null);
  assert.equal(await page.locator('.ea-mode-grid').count(),0);
  await engine.exec("UPDATE licenses SET status='active' WHERE key='VALID'");
  await page.evaluate(()=>localStorage.setItem('appClientToken',btoa('7:client:fixture')));
  await page.reload();await page.locator('.ea-startup').waitFor({state:'detached'});
  await nav.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'EA Manipulation',exact:true}).tap();
  assert.equal(await page.locator('.ea-mode-card').count(),4);
  await page.bringToFront();
  await page.screenshot({path:`${output}/restored-four-cards.png`});
  await nav.getByRole('button',{name:'Home',exact:true}).tap();
  await page.waitForFunction(()=>document.querySelector('.ea-glass-bar button[aria-current="page"] span')?.textContent==='Home');
  await page.waitForFunction(()=>{const panels=document.querySelectorAll('.ea-nav-screen');const settings=panels[panels.length-1];return settings.inert&&Number(getComputedStyle(settings).opacity)<.01;});
  await page.waitForTimeout(350);await page.screenshot({path:`${output}/restored-home.png`});
  await writeFile(output+'/layout.json',JSON.stringify(layout,null,2));
  await client.close();await mentor.close();
 }finally{globalThis.fetch=nativeFetch;await browser.close();}
}
