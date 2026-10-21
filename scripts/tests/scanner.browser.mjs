// Actual production UI; every API response is an isolated fixture. No live AI or trades.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.SCANNER_ORIGIN || 'http://127.0.0.1:5180';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.SCANNER_SCREENSHOTS || 'work/scanner-previews'; mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[], calls=[], thirdParty=[]; let reports=[], mode='success', delay=1500, historyFails=false;
const mentor=readFileSync('artifacts/ea-cloud/public/default-robot.jpg');
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{ if(message.type()==='error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
await page.routeWebSocket('**/api/ws?*',socket=>socket.onMessage(()=>{}));
await page.addInitScript(()=>localStorage.setItem('appClientToken','isolated-scanner-client'));
const chartReport={signal:'BUY',symbol:'XAUUSD',timeframe:'H1',entry:3300,stopLoss:3280,takeProfit:3340,reasoning:'Isolated browser test result: visible structure suggests a retest. This is not live Gemini output.',limitations:'Fixture report only; no order was submitted.'};
await page.route('**/*',async route=>{
  const req=route.request(), url=new URL(req.url());
  if(url.origin!==origin){thirdParty.push(url.href);return route.abort();}
  if(url.pathname==='/_fixture/mentor.jpg')return route.fulfill({contentType:'image/jpeg',body:mentor});
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname.startsWith('/api/app/scanner/')){
    calls.push({path:url.pathname,method:req.method(),body:req.postData()});
    if(url.pathname.endsWith('/status'))return route.fulfill({json:{configured:true,executionAvailable:false}});
    if(url.pathname.endsWith('/history'))return route.fulfill(historyFails?{status:503,json:{error:'Scan history is unavailable. Please retry later.'}}:{json:{records:reports,hasMore:false}});
    if(req.method()==='POST'){
      await new Promise(resolve=>setTimeout(resolve,delay));
      if(mode==='failure')return route.fulfill({status:503,json:{error:'AI analysis is not configured yet. Please try again later.'}}).catch(()=>{});
      const fundamental=url.pathname.endsWith('/fundamentals');
      const report=fundamental?{summary:'Isolated report fixture: CPI and FOMC uncertainty; no current figures invented.',sources:[{title:'BLS CPI',url:'https://www.bls.gov/cpi/'}],asOf:'2026-10-21T10:00:00Z',context:JSON.parse(req.postData())}:mode==='no-trade'?{...chartReport,signal:'NO TRADE',entry:null,stopLoss:null,takeProfit:null}:chartReport;
      const saved={id:String(reports.length+1),kind:fundamental?'fundamental':'chart',strategy:fundamental?null:'SMC',report,createdAt:'2026-10-21T10:00:00Z'};
      reports=[saved,...reports]; return route.fulfill({status:201,json:saved}).catch(()=>{});
    }
  }
  let data={};
  if(url.pathname==='/api/app/me')data={status:'approved',licenseKey:'FIXTURE'};
  if(url.pathname==='/api/app/dashboard')data={mentor:{robotName:'Mentor Trading Lab',backgroundImageUrl:'/_fixture/mentor.jpg',robotTagline:'@mentor'},eas:[]};
  if(url.pathname==='/api/app/trading-controls')data={mt5Connected:false,copyingEnabled:false};
  return route.fulfill({json:data});
});
try{
  await page.goto(origin+'/ea-app/');
  const openScanner=async()=>{
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Chart Scanner',exact:true}).click();
    await page.getByRole('heading',{name:'AI Scanner',exact:true}).waitFor();
  };
  await openScanner();
  let dialog=page.getByRole('dialog',{name:'AI Scanner'});
  await dialog.getByText('Your next insight starts here.',{exact:true}).waitFor();
  assert.equal(await dialog.locator('.scanner-background').getAttribute('src'),'/_fixture/mentor.jpg');
  assert.equal(await dialog.locator('.scanner-background').evaluate(img=>getComputedStyle(img).objectFit),'cover');
  assert.equal(await dialog.getByRole('button',{name:'SMC',exact:true}).getAttribute('aria-pressed'),'true');
  assert.doesNotMatch(await dialog.innerText(),/13 \/ 13|10\/10|BUY Signal Detected/);
  await page.screenshot({path:output+'/01-ready-mobile.png'});
  await dialog.getByRole('button',{name:'Scanner trade settings',exact:true}).click();
  let sheet=page.getByRole('dialog',{name:'Trade Settings',exact:true});await sheet.waitFor();
  assert.equal(await sheet.getByRole('button',{name:'Decrease lot size',exact:true}).isDisabled(),true);
  assert.equal(await sheet.getByRole('button',{name:'Decrease positions',exact:true}).isDisabled(),true);
  await sheet.getByRole('button',{name:'Set lot size to 0.05',exact:true}).click();await sheet.getByRole('button',{name:'Set positions to 2',exact:true}).click();
  assert.equal(await sheet.getByRole('button',{name:'Set lot size to 0.05',exact:true}).getAttribute('aria-pressed'),'true');
  assert.match(await sheet.locator('.scanner-settings-summary').innerText(),/2 trades × 0.05 lots/);
  await page.waitForTimeout(350);await page.screenshot({path:output+'/07-trade-settings-mobile.png'});
  const beforeSettingsWrites=calls.filter(call=>call.method==='POST').length;
  await sheet.getByRole('button',{name:'Confirm settings',exact:true}).click();assert.equal(await sheet.count(),0);
  assert.equal(calls.filter(call=>call.method==='POST').length,beforeSettingsWrites,'Confirm settings must not submit any order or API write');
  assert.match(await dialog.locator('.scanner-settings-launch').innerText(),/2 positions · 0.05 lots each/);
  await dialog.getByRole('button',{name:'Scanner trade settings',exact:true}).click();sheet=page.getByRole('dialog',{name:'Trade Settings',exact:true});
  await sheet.getByRole('textbox',{name:'Lot size',exact:true}).fill('0.001');assert.equal(await sheet.getByRole('button',{name:'Confirm settings',exact:true}).isDisabled(),true);
  await sheet.getByRole('textbox',{name:'Lot size',exact:true}).fill('50.00');assert.equal(await sheet.getByRole('button',{name:'Increase lot size',exact:true}).isDisabled(),true);
  await sheet.getByRole('textbox',{name:'Positions',exact:true}).fill('20');assert.equal(await sheet.getByRole('button',{name:'Increase positions',exact:true}).isDisabled(),true);
  await sheet.getByRole('textbox',{name:'Positions',exact:true}).fill('0');assert.equal(await sheet.getByRole('button',{name:'Confirm settings',exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');assert.equal(await sheet.count(),0);assert.equal(await dialog.getByRole('button',{name:'Scanner trade settings',exact:true}).evaluate(el=>el===document.activeElement),true);
  assert.match(await dialog.locator('.scanner-settings-launch').innerText(),/2 positions · 0.05 lots each/,'Cancelled draft values must not overwrite confirmed settings');

  await dialog.locator('.scanner-fundamentals').evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:output+'/02-fundamentals-mobile.png'});
  // Make a small chart-like upload fixture in the browser, not a production image.
  const fixture=await page.evaluate(()=>{ const c=document.createElement('canvas');c.width=900;c.height=500;const x=c.getContext('2d');x.fillStyle='#101418';x.fillRect(0,0,900,500);x.fillStyle='#e9edf2';x.font='22px sans-serif';x.fillText('ISOLATED TEST CHART · XAUUSD H1',30,40);for(let i=0;i<32;i++){let y=320-i*6+Math.sin(i)*24;x.strokeStyle=i%3?'#53c296':'#e46c6c';x.beginPath();x.moveTo(30+i*25,y-25);x.lineTo(30+i*25,y+45);x.stroke();x.fillStyle=x.strokeStyle;x.fillRect(24+i*25,y,12,22);}return c.toDataURL('image/png').split(',')[1];});
  const upload={name:'fixture-chart.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')};
  const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'Gallery',exact:true}).click();await(await chooser).setFiles(upload);
  await dialog.getByRole('heading',{name:'Your chart is ready'}).waitFor();
  assert.equal(await dialog.getByRole('img',{name:'Selected chart to analyse'}).count(),1);
  assert.equal(calls.filter(c=>c.method==='POST').length,0,'Choosing an image must not send it to AI');
  await dialog.getByRole('button',{name:'ICT',exact:true}).click();
  await dialog.getByRole('button',{name:'Analyse chart',exact:true}).click();
  await dialog.getByRole('heading',{name:'Analyzing chart...',exact:true}).waitFor();
  assert.equal(await dialog.locator('.scanner-analysis-dots span').count(),5);
  assert.equal(await dialog.locator('.scanner-orbit-one').evaluate(el=>getComputedStyle(el).animationName),'scanner-rotate');
  await page.waitForTimeout(300);
  await page.screenshot({path:output+'/03-scanning-mobile.png'});
  await dialog.getByRole('heading',{name:'BUY',exact:true}).waitFor();
  assert.match(await dialog.locator('.scanner-levels').innerText(),/3300/);
  assert.equal(await dialog.getByRole('button',{name:'Execute Trade',exact:true}).isDisabled(),true);
  assert.match(await dialog.locator('.scanner-settings-launch').innerText(),/2 positions · 0.05 lots each/);
  await page.screenshot({path:output+'/04-report-fixture-mobile.png'});
  assert.match(calls.find(c=>c.path.endsWith('/chart')).body,/name="strategy"\r\n\r\nICT/);
  assert.ok(calls.find(c=>c.path.endsWith('/chart')).body.includes('image/jpeg'),'Client prepares bounded JPEG');
  // Report history survives modal close/reopen by reading server-backed records.
  await dialog.getByRole('button',{name:'Close scanner'}).click();await openScanner();dialog=page.getByRole('dialog',{name:'AI Scanner'});
  await dialog.locator('.scanner-history-list').getByRole('button').first().waitFor();
  await dialog.locator('.scanner-history-list').getByRole('button').first().click();await dialog.getByRole('heading',{name:'BUY',exact:true}).waitFor();
  await dialog.getByLabel('Analysis focus',{exact:true}).selectOption('CPI');await dialog.getByLabel('Outlook',{exact:true}).selectOption('This week');
  await dialog.getByRole('button',{name:'Fundamental Analysis',exact:true}).click();
  await dialog.getByRole('heading',{name:'Analyzing fundamentals...'}).waitFor();
  await dialog.getByRole('heading',{name:'Market outlook',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('link',{name:'BLS CPI'}).getAttribute('href'),'https://www.bls.gov/cpi/');
  assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/fundamentals')).body),{market:'XAUUSD',focus:'CPI',outlook:'This week'});
  mode='failure';await dialog.getByRole('button',{name:'Fundamental Analysis',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'not configured'}).waitFor();
  assert.equal(await dialog.getByRole('heading',{name:'Market outlook',exact:true}).count(),0);
  // Retry must retry fundamentals, even if a chart exists.
  await dialog.getByRole('button',{name:'Retry',exact:true}).click();
  await dialog.getByRole('heading',{name:'Analyzing fundamentals...'}).waitFor();
  await dialog.getByRole('alert').filter({hasText:'not configured'}).waitFor();
  await page.screenshot({path:output+'/05-unavailable-mobile.png'});
  await dialog.getByRole('button',{name:'Close scanner'}).click();await openScanner();dialog=page.getByRole('dialog',{name:'AI Scanner'});
  await dialog.locator('input[type=file]').first().setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await dialog.getByRole('alert').filter({hasText:'JPEG, PNG or WebP'}).waitFor();
  const cameraChooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'Camera',exact:true}).click();const cameraInput=await cameraChooser;assert.equal(await cameraInput.element().getAttribute('capture'),'environment');await cameraInput.setFiles(upload);
  await dialog.getByRole('heading',{name:'Your chart is ready'}).waitFor();
  mode='no-trade';await dialog.getByRole('button',{name:'Analyse chart',exact:true}).click();await dialog.getByRole('heading',{name:'NO TRADE',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Execute Trade',exact:true}).isDisabled(),true);
  mode='success';delay=2000;await dialog.getByRole('button',{name:'Analyse chart',exact:true}).click();
  await dialog.getByRole('heading',{name:'Analyzing chart...'}).waitFor();await dialog.getByRole('button',{name:'Cancel analysis',exact:true}).click();
  await page.waitForTimeout(2200);assert.equal(await dialog.getByRole('heading',{name:'BUY',exact:true}).count(),0,'Cancelled result must not reappear');
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:568});
  await dialog.locator('.scanner-scroll').evaluate(el=>el.scrollTop=0);await page.screenshot({path:output+'/06-small-mobile.png'});
  assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.equal(await dialog.locator('.scanner-analysis-dots').count(),0);
  // Honest history failure is distinct from an empty successful history.
  historyFails=true;await dialog.getByRole('button',{name:'Refresh scan history'}).click();await dialog.getByRole('alert').filter({hasText:'Scan history is unavailable'}).waitFor();
  delay=800;await dialog.getByRole('button',{name:'Analyse chart',exact:true}).click();await dialog.getByRole('heading',{name:'Analyzing chart...'}).waitFor();assert.equal(await dialog.locator('.scanner-orbit-one').evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await dialog.locator('.scanner-analysis-dots span').first().evaluate(el=>getComputedStyle(el).animationName),'none');await page.keyboard.press('Escape');
  await dialog.getByRole('button',{name:'Scanner trade settings'}).click();
  const smallSheet=page.getByRole('dialog',{name:'Trade Settings',exact:true});await smallSheet.waitFor();await smallSheet.getByRole('button',{name:'Confirm settings',exact:true}).scrollIntoViewIfNeeded();const sheetBox=await smallSheet.boundingBox();assert.ok(sheetBox.x>=0&&sheetBox.x+sheetBox.width<=320&&sheetBox.height<=568-85);await page.screenshot({path:output+'/08-settings-small-mobile.png'});await page.keyboard.press('Escape');assert.equal(await smallSheet.count(),0);
  await page.setViewportSize({width:1280,height:900});await dialog.locator('.scanner-scroll').evaluate(el=>el.scrollTop=0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await dialog.getByRole('button',{name:'Home',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(calls.some(c=>c.path.endsWith('/execute')),false);
  assert.equal(calls.some(c=>!c.path.startsWith('/api/app/scanner/')),false);
  assert.deepEqual(errors,[]);
  assert.ok(thirdParty.every(url=>!url.includes('generativelanguage')),'AI keys/calls stay server-side');
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));assert.doesNotMatch(storage,/3300|base64|fixture-chart|isolated-test-key/);
  console.log('PASS: real gallery/camera chooser, image preparation, explicit upload, strategy, scan animation, structured fixture result/NO TRADE, grounded fundamental fixture, history reopen/error, unavailable/retry/cancellation, disabled execution, small mobile, no runtime errors or live AI/trade calls');
}finally{await browser.close();}
