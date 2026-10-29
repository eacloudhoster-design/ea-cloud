import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5234';assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});await mkdir('work/create-ea',{recursive:true});
try{for(const [width,height,device]of [[390,844,'ios'],[360,640,'android'],[1280,900,'desktop']]){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600,userAgent:device==='ios'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':device==='android'?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36':undefined});
 const existing={id:99,mentorId:5,name:'Existing EA',description:'Existing configuration',symbol:'EURUSD,GBPUSD',lotSize:'0.23',riskLevel:'high',isActive:false,createdAt:new Date().toISOString()};const rows=[{...existing}],posts=[],patches=[];
 await context.route('https://fonts.**',r=>r.abort());
 await context.route('**/api/**',async r=>{const req=r.request(),p=new URL(req.url()).pathname;let json=[];
  if(p==='/api/auth/me'||p==='/api/profile')json={id:5,role:'mentor',status:'approved',email:'mentor@example.invalid'};
  if(p==='/api/eas'){
   if(req.method()==='POST'){const body=req.postDataJSON();posts.push(body);const created={...existing,id:rows.length+100,...body,symbol:'XAUUSD',lotSize:'0.01',riskLevel:'medium'};rows.push(created);return r.fulfill({status:201,json:created});}
   json=rows;
  }
  if(p==='/api/eas/99'&&req.method()==='PATCH'){patches.push(req.postDataJSON());Object.assign(rows[0],req.postDataJSON());json=rows[0];}
  return r.fulfill({json});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/admin/ea-manager');
 const open=()=>page.getByRole('button',{name:'New EA',exact:true}).click();await open();const modal=page.getByRole('dialog',{name:'Create New EA',exact:true});
 await modal.waitFor();await page.waitForTimeout(500);
 assert.equal(await modal.locator('input').count(),2);
 for(const text of ['Trading Symbols','Lot Size','Risk Level'])assert.equal(await modal.getByText(text,{exact:true}).count(),0);
 assert.equal(await modal.getByRole('button',{name:'XAUUSD',exact:true}).count(),0);
 const rect=await modal.boundingBox();assert(rect.height<500,'creation modal naturally shrinks');assert(Math.abs(rect.x+rect.width/2-width/2)<1);assert(Math.abs(rect.y+rect.height/2-height/2)<1);assert(rect.y>=0&&rect.y+rect.height<=height);assert(await modal.evaluate(n=>n.scrollHeight<=n.clientHeight),'remaining fields need no internal scroll');
 await page.screenshot({path:`work/create-ea/${device}.png`});
 await modal.getByRole('button',{name:'Create EA',exact:true}).click();await modal.getByText('EA name is required',{exact:true}).waitFor();assert.equal(posts.length,0);
 await modal.getByPlaceholder('e.g. Gold Scalper Pro').fill('Name only EA');await modal.getByRole('button',{name:'Create EA',exact:true}).click();await modal.waitFor({state:'detached'});
 assert.deepEqual(posts[0],{name:'Name only EA',description:'',isActive:true});assert.deepEqual(rows[0],existing);
 await open();await modal.getByPlaceholder('e.g. Gold Scalper Pro').fill('Inactive EA');await modal.getByPlaceholder('Short description of your EA strategy').fill('Optional description');await modal.getByRole('button',{name:'Active Status',exact:true}).click();assert.equal(await modal.getByRole('button',{name:'Active Status',exact:true}).getAttribute('aria-pressed'),'false');await modal.getByRole('button',{name:'Create EA',exact:true}).click();await modal.waitFor({state:'detached'});
 assert.deepEqual(posts[1],{name:'Inactive EA',description:'Optional description',isActive:false});
 await open();await modal.getByRole('button',{name:'Cancel',exact:true}).click();await modal.waitFor({state:'detached'});assert.equal(posts.length,2);
 await page.locator('button:has(.lucide-pencil)').first().click();const edit=page.getByRole('dialog',{name:'Edit EA',exact:true});await edit.waitFor();
 await edit.getByText('Trading Symbols').waitFor();assert(await edit.getByText('Lot Size',{exact:true}).isVisible());assert(await edit.getByText('Risk Level',{exact:true}).isVisible());assert.equal(await edit.getByPlaceholder('0.01').inputValue(),'0.23');
 await edit.getByRole('button',{name:'Update EA',exact:true}).click();await edit.waitFor({state:'detached'});assert.equal(patches[0].symbol,existing.symbol);assert.equal(patches[0].lotSize,existing.lotSize);assert.equal(patches[0].riskLevel,existing.riskLevel);
 // Creation after editing must not inherit the old EA's trading settings.
 await open();await modal.getByPlaceholder('e.g. Gold Scalper Pro').fill('After editing');await modal.getByRole('button',{name:'Create EA',exact:true}).click();await modal.waitFor({state:'detached'});assert.deepEqual(Object.keys(posts[2]).sort(),['description','isActive','name']);
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${device} ${width}px: compact centered create, validation, defaults payload, optional description, inactive status, cancellation, unchanged editing`);
}}finally{await browser.close();}
