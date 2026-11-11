import type {DedicatedWorkerPort} from "./mt5-provisioning-consumer";
/** Separate provisioning origin/token; never reuse the public status gateway. */
export function createDedicatedWorkerPort():DedicatedWorkerPort{
 const raw=process.env.MT5_PROVISIONER_URL,token=process.env.MT5_PROVISIONER_TOKEN;
 if(!raw||!token||!/^[\x21-\x7e]{32,2048}$/.test(token))throw Error("PRIVATE_PROVISIONER_NOT_CONFIGURED");
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||(url.protocol!=="https:"&&!(url.protocol==="http:"&&url.hostname==="127.0.0.1")))throw Error("PRIVATE_PROVISIONER_ORIGIN_INVALID");
 return {async provisionDedicatedWorker(input){
  const {signal,...body}=input;
  const response=await fetch(new URL("/v1/provision",url),{method:"POST",redirect:"error",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal});
  const data:any=await response.json().catch(()=>null);
  if(!response.ok||data?.requestId!==input.requestId||data?.state!=="worker_prepared"||data?.executionEnabled!==false||data?.accountMode!==input.accountMode)throw Error("PROVISIONER_OUTCOME_UNCERTAIN");
 }};
}
