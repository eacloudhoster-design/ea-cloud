import type {DedicatedWorkerPort} from "./mt5-provisioning-consumer";
/** Separate provisioning origin/token; never reuse the public status gateway. */
export function createDedicatedWorkerPort():DedicatedWorkerPort{
 const raw=process.env.MT5_PROVISIONER_URL,token=process.env.MT5_PROVISIONER_TOKEN;
 if(!raw||!token||!/^[\x21-\x7e]{32,2048}$/.test(token))throw Error("PRIVATE_PROVISIONER_NOT_CONFIGURED");
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||(url.protocol!=="https:"&&!(url.protocol==="http:"&&url.hostname==="127.0.0.1")))throw Error("PRIVATE_PROVISIONER_ORIGIN_INVALID");
 return {async provisionDedicatedWorker(input){
  const {signal,...body}=input;
  if(!/^[0-9a-f-]{36}$/i.test(input.requestId))throw Error("PROVISIONER_REQUEST_INVALID");
  let response=await fetch(new URL("/v1/provision",url),{method:"POST",redirect:"error",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal});
  for(;;){
   const data:any=await response.json().catch(()=>null);
   if(!response.ok||data?.requestId!==input.requestId||data?.executionEnabled!==false||data?.accountMode!==input.accountMode)throw Error("PROVISIONER_OUTCOME_UNCERTAIN");
   if(response.status===200&&data.state==="worker_prepared")return;
   if(response.status!==202||data.state!=="provisioning")throw Error("PROVISIONER_OUTCOME_UNCERTAIN");
   await new Promise<void>((resolve,reject)=>{
    const onAbort=()=>{clearTimeout(timer);reject(Error("PROVISIONER_OUTCOME_UNCERTAIN"));};
    const timer=setTimeout(()=>{signal.removeEventListener("abort",onAbort);resolve();},1000);
    signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)onAbort();
   });
   response=await fetch(new URL("/v1/provision/"+input.requestId,url),{method:"GET",redirect:"error",headers:{Authorization:`Bearer ${token}`},signal});
  }
 }};
}
