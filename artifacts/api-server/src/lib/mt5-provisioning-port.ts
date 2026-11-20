import type {DedicatedWorkerPort} from "./mt5-provisioning-consumer";
/** Separate provisioning origin/token; never reuse the public status gateway. */
export function createDedicatedWorkerPort():DedicatedWorkerPort{
 const raw=process.env.MT5_PROVISIONER_URL,token=process.env.MT5_PROVISIONER_TOKEN;
 if(!raw||!token||!/^[\x21-\x7e]{32,2048}$/.test(token))throw Error("PRIVATE_PROVISIONER_NOT_CONFIGURED");
 const url=new URL(raw);
 if(process.env.RENDER&&["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw Error("PRIVATE_PROVISIONER_REMOTE_REQUIRED");
 const id=process.env.MT5_PROVISIONER_ACCESS_CLIENT_ID,secret=process.env.MT5_PROVISIONER_ACCESS_CLIENT_SECRET,required=process.env.MT5_PROVISIONER_ACCESS_REQUIRED;
 if((required!==undefined&&!["0","1"].includes(required))||(id!==undefined)!==(secret!==undefined)||(required==="1"&&(!id||!secret))||(id!==undefined&&secret!==undefined&&(url.protocol!=="https:"||! /^[\x21-\x7e]{1,1024}$/.test(id)||! /^[\x21-\x7e]{1,1024}$/.test(secret))))throw Error("PRIVATE_PROVISIONER_ACCESS_NOT_CONFIGURED");
 const access:Record<string,string>=id!==undefined&&secret!==undefined?{"CF-Access-Client-Id":id,"CF-Access-Client-Secret":secret}:{};
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||(url.protocol!=="https:"&&!(url.protocol==="http:"&&url.hostname==="127.0.0.1")))throw Error("PRIVATE_PROVISIONER_ORIGIN_INVALID");
 return {async provisionDedicatedWorker(input){
  const {signal,...submitted}=input;
  if(!/^\d+$/.test(input.login)||!Number.isSafeInteger(Number(input.login))||Number(input.login)<=0)throw Error("PROVISIONER_REQUEST_INVALID");
  const body={...submitted,login:String(Number(input.login))};
  if(!/^[0-9a-f-]{36}$/i.test(input.requestId))throw Error("PROVISIONER_REQUEST_INVALID");
  let response=await fetch(new URL("/v1/provision",url),{method:"POST",redirect:"error",headers:{...access,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal});
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
   response=await fetch(new URL("/v1/provision/"+input.requestId,url),{method:"GET",redirect:"error",headers:{...access,Authorization:`Bearer ${token}`},signal});
  }
 }};
}
