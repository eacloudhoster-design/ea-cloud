/** GET-only transport acceptance. Never imports the server, SDK or order modules. */
import {pathToFileURL} from 'node:url';
import {validateHostedEngineEnvironment} from './hosted-engine-start.mjs';
export async function checkEngineConnectivity(env=process.env,transport=fetch){
  validateHostedEngineEnvironment(env);
  const report={protocol:'ea-hosted-engine-connectivity-v1',observedAt:new Date().toISOString(),financialRequestsSent:0,executionReadinessClaimed:false,checks:{}};
  const headers=prefix=>({'Authorization':'Bearer '+env[prefix==='MT5'?'MT5_VPS_TOKEN':'OBSERVER_MT5_VPS_TOKEN'],'CF-Access-Client-Id':env[prefix+'_ACCESS_CLIENT_ID'],'CF-Access-Client-Secret':env[prefix+'_ACCESS_CLIENT_SECRET']});
  async function call(name,origin,path,auth,validate,expected=200){
    try{
      const r=await transport(new URL(path,origin),{method:'GET',headers:auth,redirect:'error',signal:AbortSignal.timeout(15000)});
      if(r.status!==expected)throw Error();
      if(expected===200){
        if(!r.headers.get('content-type')?.includes('application/json'))throw Error();
        const text=await r.text();if(text.length>1048576)throw Error();
        const data=JSON.parse(text);if(!validate(data))throw Error();
      }
      report.checks[name]={ok:true,httpStatus:r.status};
    }catch{report.checks[name]={ok:false,code:'ENGINE_TRANSPORT_OR_CONTRACT_FAILED'};}
  }
  const status=headers('MT5'),gateway=headers('OBSERVER_MT5');
  await call('statusHealth',env.MT5_VPS_URL,'/healthz',status,d=>d.status==='ok'&&d.read_only===true&&d.execution_enabled===false&&Number.isSafeInteger(d.accounts)&&d.accounts>=0);
  await call('gatewayHealth',env.OBSERVER_MT5_VPS_URL,'/healthz',gateway,d=>d.status==='ok'&&d.service==='isolated-account-router'&&d.simulation===false&&d.execution_readiness_claimed===false&&Number.isSafeInteger(d.accounts)&&d.accounts>=0);
  const brokers=['justmarkets','deriv','exness','xm','rcg'];
  const identity=d=>Number.isSafeInteger(d.login)&&d.login>0&&typeof d.server==='string'&&d.server.length>0&&brokers.includes(d.broker);
  await call('gatewayAssignments',env.OBSERVER_MT5_VPS_URL,'/observer/assignments',gateway,d=>{
    if(d.version!==1||!Array.isArray(d.assignments)||!d.assignments.every(a=>identity(a)&&a.role==='client'&&Object.keys(a).sort().join(',')==='broker,login,role,server'))return false;
    const keys=d.assignments.map(a=>JSON.stringify([a.login,a.server]));if(new Set(keys).size!==keys.length)return false;
    report.registeredReceivers=d.assignments.length;return true;
  });
  await call('receivingSessions',env.OBSERVER_MT5_VPS_URL,'/observer/receiving-sessions',gateway,d=>{
    if(d.version!==1||!Array.isArray(d.sessions)||!d.sessions.every(a=>identity(a)&&['demo','live'].includes(a.mode)&&a.owner_kind==='client'&&Number.isSafeInteger(a.owner_id)&&a.owner_id>0))return false;
    report.activeReceivingSessions=d.sessions.length;return true;
  });
  for(const [name,origin,auth] of [['statusBearerRequired',env.MT5_VPS_URL,status],['gatewayBearerRequired',env.OBSERVER_MT5_VPS_URL,gateway]]){
    const edgeOnly={...auth};delete edgeOnly.Authorization;
    await call(name,origin,'/healthz',edgeOnly,()=>true,401);
  }
  report.ok=Object.values(report.checks).every(c=>c.ok);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const report=await checkEngineConnectivity();console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;}
  catch{console.log(JSON.stringify({ok:false,code:'HOSTED_ENGINE_CONFIGURATION_INVALID',financialRequestsSent:0,executionReadinessClaimed:false}));process.exitCode=1;}
}
