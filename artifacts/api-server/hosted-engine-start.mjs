// Source ingestion only: the VPS remains the sole execution/provisioning consumer.
import {pathToFileURL} from 'node:url';
export function validateHostedEngineEnvironment(env=process.env){
  const fail=()=>{throw Error('HOSTED_ENGINE_CONFIGURATION_INVALID: use the external-consumer connection runbook');};
  for(const [name,value] of Object.entries({EA_MT5_MANAGEMENT_ONLY:'0',EA_SIGNAL_WORKER_MODE:'external',MT5_PROVISIONING_CONSUMER:'0',COPY_ENGINE_MULTI_ACCOUNT:'1',MT5_ACCOUNT_INVENTORY:'1',MT5_SELF_SERVICE_PROVISIONING:'1',OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE:'gateway',MT5_ACCESS_REQUIRED:'1'}))if(env[name]!==value)fail();
  if(env.EA_RELEASE_MODE!==undefined||env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS!==undefined||env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_FILE!==undefined)fail();
  const secret=(name,min=1)=>{if(typeof env[name]!=='string'||!new RegExp('^[\\x21-\\x7e]{'+min+',2048}$').test(env[name]))fail();};
  const httpsOrigin=name=>{
    try{const u=new URL(env[name]);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)fail();}catch{fail();}
  };
  for(const name of ['MT5_VPS_URL','OBSERVER_MT5_VPS_URL','PUBLIC_WEBSITE_ORIGIN'])httpsOrigin(name);
  for(const name of ['MT5_VPS_TOKEN','OBSERVER_MT5_VPS_TOKEN'])secret(name,32);
  for(const name of ['MT5_ACCESS_CLIENT_ID','MT5_ACCESS_CLIENT_SECRET','OBSERVER_MT5_ACCESS_CLIENT_ID','OBSERVER_MT5_ACCESS_CLIENT_SECRET'])secret(name);
  if(typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<16)fail();
  try{if(!['postgres:','postgresql:'].includes(new URL(env.DATABASE_URL).protocol))fail();}catch{fail();}
  if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0')fail();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  validateHostedEngineEnvironment();
  await import('./dist/index.mjs');
}
