// Browser acceptance of real shared components with synthetic HTTP fixtures.
// This is not broker authentication, deployed session acceptance or order verification.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),requireBackend=createRequire(path.join(root,'artifacts/api-server/package.json'));
const {build}=requireBackend('esbuild');
const {chromium}=require(path.join(process.env.EA_BROWSER_TOOLS_ROOT,'node_modules/playwright'));
const output=process.env.EA_BROWSER_EVIDENCE_DIR||path.join(os.tmpdir(),'ea-account-browser-evidence');fs.mkdirSync(output,{recursive:true});
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'ea-account-browser-'));
const id='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
const secret='SYNTHETIC_BROWSER_PASSWORD';
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AccountManager,ProvisioningRequestForm} from ${JSON.stringify(path.join(root,'lib/mt5-ui/ProvisioningRequestForm.tsx'))};const role=new URLSearchParams(location.search).get('role')==='master'?'master':'follower';createRoot(document.getElementById('root')).render(<><AccountManager role={role}/><ProvisioningRequestForm role={role}/></>);`;
async function main(){
 await build({stdin:{contents:entry,resolveDir:path.join(root,'artifacts/ea-app'),loader:'tsx'},bundle:true,jsx:'automatic',outfile:path.join(scratch,'bundle.js'),logLevel:'error'});
 const html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{margin:16px;font:16px system-ui;max-width:700px}label{display:block}input,select{max-width:100%;box-sizing:border-box}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
 const server=http.createServer((req,res)=>{const filename=req.url==='/bundle.js'?'bundle.js':req.url==='/bundle.css'?'bundle.css':null;res.setHeader('Content-Type',filename?.endsWith('.js')?'text/javascript':filename?'text/css':'text/html');res.end(filename?fs.readFileSync(path.join(scratch,filename)):html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true});
  for(const role of ['follower','master'])for(const [label,viewport] of [['desktop',{width:1366,height:900}],['mobile',{width:390,height:844}]]){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let rows=[{id,login:'10001',server:'Fixture-Live',broker:'justmarkets',accountMode:'live',state:'linked'},{id:id2,login:'10002',server:'Fixture-Demo',broker:'exness',accountMode:'demo',state:'linked'}],submitted;
   await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url()),method=request.method();let response={};
    if(url.pathname.includes('capabilities')||url.pathname==='/api/app/mt5-provisioning')response={accountModes:['demo','live']};
    else if(url.pathname.includes('/mt5-provisioning/requests')){if(method==='POST'){submitted=request.postDataJSON();response={state:'queued',connected:false,executionEnabled:false};}else response={requests:submitted?[{id,login:submitted.login,server:submitted.server,accountRole:role,state:'queued'}]:[]};}
    else if(url.pathname.endsWith('/status'))response={...rows[0],verified:true,connected:true,balance:12,equity:11,currency:'USD'};
    else if(url.pathname.endsWith('/select'))response={selected:true,connected:true,copyingEnabled:false};
    else if(url.pathname.endsWith('/disconnect')){rows[0]={...rows[0],state:'disconnected'};response={connected:false,copyingEnabled:false};}
    else if(method==='POST'){const body=request.postDataJSON();assert.equal(body.password,secret);rows[0]={...rows[0],state:'linked'};response={connected:true,verified:true,executionEnabled:false};}
    else response={accounts:rows,executionEnabled:false};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
   });
   await page.goto(origin+'/?role='+role);
   const manager=page.getByRole('region',{name:'Your linked MT5 accounts'});await manager.waitFor();assert.equal(await manager.locator('li').count(),2);
   assert.equal(await manager.getByText('Saved · connection unverified',{exact:false}).count(),2);
   const first=manager.locator('li').first();await first.getByRole('button',{name:'Check connection',exact:true}).click();await first.getByText('Connection verified now',{exact:false}).waitFor();
   await first.getByRole('button',{name:'Select account',exact:true}).click();await manager.getByText('Account selected. Copying is paused.').waitFor();
   await first.getByRole('button',{name:'Disconnect account',exact:true}).click();await first.getByRole('button',{name:'Reconnect account'}).waitFor();assert(await first.getByRole('button',{name:'Select account',exact:true}).isDisabled());
   await first.getByRole('button',{name:'Reconnect account'}).click();assert.equal(await manager.getByLabel('Account number',{exact:true}).inputValue(),'10001');
   await manager.getByLabel('Account password',{exact:true}).fill(secret);await manager.getByRole('button',{name:'Verify and link account'}).click();await manager.getByText('Account verified and linked. Copying has not been enabled.').waitFor();assert.equal(await manager.getByLabel('Account password',{exact:true}).inputValue(),'');
   const provisioning=page.getByRole('region',{name:'Request your own MT5 account worker'});
   await provisioning.getByRole('combobox',{name:/Account mode/}).selectOption('live');await provisioning.getByLabel('MT5 login',{exact:true}).fill('10003');await provisioning.getByLabel('Exact broker server',{exact:true}).fill('Fixture-Live');await provisioning.getByLabel('MT5 password',{exact:true}).fill(secret);await provisioning.getByRole('checkbox').check();await provisioning.getByRole('button',{name:'Request account worker'}).click();await provisioning.getByText('queued',{exact:false}).waitFor();assert.equal(submitted.accountMode,'live');assert.equal(await provisioning.getByLabel('MT5 password',{exact:true}).inputValue(),'');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.evaluate(value=>JSON.stringify([localStorage,sessionStorage]).includes(value),secret),false);assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(output,role+'-'+label+'.png'),fullPage:true});results.push({role,viewport:label,pass:true});await page.close();
  }
  const evidence={pass:true,fixtureOnly:true,brokerConnections:0,orders:0,results};fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(evidence,null,2)+'\n');console.log('PASS desktop/mobile master/follower account management, selection/pause, disconnect/reconnect, live-read-only request, password clearing, overflow and runtime errors; synthetic HTTP fixtures only');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
