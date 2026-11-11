const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ts=require('typescript');
const file='artifacts/ea-app/src/lib/mt5-engine.ts';
let response,requests=[];
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,require:()=>({requestJson:async(path,init)=>{requests.push({path,init});return response;}}),Number,Error});
(async()=>{
 const input={login:'123',server:'FixtureDemo',broker:'justmarkets',password:'TEST_ONLY'};
 response={connected:true,status:'connected',login:'123',server:'FixtureDemo',broker:'justmarkets'};
 await exportsObject.connectMt5Account(input,'fixture',new AbortController().signal);
 for(const bad of [{...response,connected:false},{...response,server:'Other'},{...response,login:'999'},{...response,broker:'xm'}]){response=bad;await assert.rejects(()=>exportsObject.connectMt5Account(input,'fixture',new AbortController().signal));}
 response={connected:false,copyingEnabled:false};await exportsObject.disconnectMt5Account('fixture');
 response={connected:false,copyingEnabled:true};await assert.rejects(()=>exportsObject.disconnectMt5Account('fixture'));
 const route=fs.readFileSync('artifacts/api-server/src/routes/client-mt5.ts','utf8');
 assert(route.includes('const requireClientAuth = requireAppSession'));assert(!route.includes('Buffer.from'));assert(route.includes('eq(clientMt5ConnectionsTable.clientId, req.clientId)'));
 const backend=fs.readFileSync('artifacts/api-server/src/routes/client-settings.ts','utf8');assert(backend.includes('if(broker!==undefined && broker!==account.broker)'));assert(backend.includes('encryptMT5Password(password)'));
 console.log('PASS: connection proof, broker/identity mismatch, disconnect confirmation, session/ownership and encrypted-storage wiring checks');
})().catch(e=>{console.error(e);process.exitCode=1});
