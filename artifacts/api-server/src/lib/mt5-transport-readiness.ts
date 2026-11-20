import {createDedicatedWorkerPort} from "./mt5-provisioning-port";
import {MT5_VPS_BASE,mt5Headers,mt5ConfigurationIssues} from "./mt5-endpoint";
/** Once per startup, outside readiness gating. Never calls account/SDK/order routes. */
export async function reportMt5TransportReadiness(log:{info:(fields:unknown,message:string)=>void;warn:(fields:unknown,message:string)=>void}){
 const event="mt5_transport_readiness",issues=mt5ConfigurationIssues();
 let provisioningTransportConfigured=false;try{createDedicatedWorkerPort();provisioningTransportConfigured=true;}catch{}
 log.info({event:"mt5_onboarding_configuration",requestSubmissionEnabled:process.env.MT5_SELF_SERVICE_PROVISIONING==="1",consumerEnabled:process.env.MT5_PROVISIONING_CONSUMER==="1",provisioningTransportConfigured},"Private onboarding configuration checked");
 if(issues.length){log.warn({event,code:"MT5_GATEWAY_NOT_CONFIGURED",configurationIssues:issues},"Private account transport unavailable");return;}
 try{
  const response=await fetch(`${MT5_VPS_BASE}/healthz`,{method:"GET",headers:mt5Headers(),redirect:"error",signal:AbortSignal.timeout(5000)});
  if(!response.ok){log.warn({event,code:[401,403].includes(response.status)?"MT5_GATEWAY_AUTH_REJECTED":"MT5_GATEWAY_UNAVAILABLE",upstreamStatus:response.status},"Private account relay health check rejected");return;}
  const data=await response.json().catch(()=>null) as Record<string,unknown>|null;
  if(data?.status!=="ok"||data.read_only!==true||data.execution_enabled!==false){log.warn({event,code:"MT5_GATEWAY_HEALTH_UNVERIFIED"},"Private account relay health response unverified");return;}
  log.info({event,code:"MT5_GATEWAY_REACHABLE",brokerConnectivityChecked:false,executionEnabled:false},"Authenticated private account relay reachable");
 }catch{log.warn({event,code:"MT5_GATEWAY_UNAVAILABLE"},"Private account relay health check unavailable");}
}
