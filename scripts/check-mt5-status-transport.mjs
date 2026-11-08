import {pathToFileURL} from 'node:url';
/** Read-only negative/positive probes; never submits broker credentials or a financial request. */
export async function checkMt5Transport(env=process.env,request=fetch){
 const url=new URL(env.MT5_VPS_URL);
 const local=env.EA_TRANSPORT_PROBE_ALLOW_LOOPBACK==='1'&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!local)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid transport origin');
 const token=env.MT5_VPS_TOKEN,id=env.MT5_ACCESS_CLIENT_ID,secret=env.MT5_ACCESS_CLIENT_SECRET;
 if(!token||! /^[\x21-\x7e]{32,1024}$/.test(token)||!id||!secret||![id,secret].every(s=>/^[\x21-\x7e]{1,1024}$/.test(s))||env.MT5_ACCESS_REQUIRED!=='1')throw Error('Paired required transport authentication is missing');
 const access={'CF-Access-Client-Id':id,'CF-Access-Client-Secret':secret},bearer={Authorization:'Bearer '+token};
 const call=async(path,headers)=>{const response=await request(new URL(path,url),{headers,redirect:'error',signal:AbortSignal.timeout(10000)});let data=null;try{data=await response.json();}catch{}return {status:response.status,data};};
 for(const headers of [bearer,access]){const denied=await call('/observer/capabilities',headers);if(![401,403].includes(denied.status))throw Error('Transport authentication negative probe failed');}
 const headers={...access,...bearer};const health=await call('/healthz',headers),capabilities=await call('/observer/capabilities',headers);
 if(health.status!==200||health.data?.read_only!==true||health.data.execution_enabled!==false||capabilities.status!==503||capabilities.data?.read_only!==true||capabilities.data.execution_enabled!==false||capabilities.data.persistentJournal!==false||capabilities.data.absoluteTargets!==false)throw Error('Status-only gateway proof unavailable');
 return {serviceAuthRequired:true,edgeAuthRequired:true,statusOnly:true,brokerCredentialsSent:false,financialRequestsSent:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){checkMt5Transport().then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(()=>{process.stderr.write('MT5 transport verification failed; check private configuration, network and gateway authentication.\n');process.exitCode=1;});}
