import {requestJson} from "./request";
export async function connectMt5Account(input:{login:string;server:string;password:string;broker?:string;requestAssignment?:boolean;requestKey?:string;ownershipConfirmed?:boolean;accountMode?:"demo"|"live"},token:string,signal:AbortSignal){
 if(!/^[0-9]+$/.test(input.login) || !Number.isSafeInteger(Number(input.login)) || Number(input.login)<=0)throw Error("Account number is outside the supported exact range");
 const data=await requestJson("/api/app/mt5-connect",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(input),signal},25000);
 if(data?.status==="provisioning"){
  const job=data.provisioning;
  if(data.connected!==false || data.executionEnabled!==false || !job || !/^[0-9a-f-]{36}$/i.test(job.id) || job.login!==String(Number(input.login)) || job.server!==input.server || job.broker!==input.broker || job.accountRole!=="follower" || job.accountMode!==input.accountMode || job.connected!==false || job.executionEnabled!==false)throw Error("Account assignment request was not confirmed");
  return data;
 }
 if(data?.broker!==input.broker && input.broker!==undefined)throw Error("Verified broker does not match the selected broker");
 if(data?.connected!==true || data?.status!=="connected" || String(data.login)!==String(Number(input.login)) || data.server!==input.server)throw Error("Account verification was not confirmed");
 return data;
}
export function readEngineStatus(token:string,signal?:AbortSignal){
 return requestJson("/api/app/engine/status",{headers:{Authorization:`Bearer ${token}`},signal},25000);
}

/** Disconnect only this authenticated client; credentials remain server-side for reconciliation. */
export async function disconnectMt5Account(token:string,signal?:AbortSignal){
 const data=await requestJson("/api/app/mt5-disconnect",{method:"POST",headers:{Authorization:`Bearer ${token}`},signal},25000);
 if(data?.connected!==false || data?.copyingEnabled!==false)throw Error("Disconnect was not confirmed");
 return data;
}

export async function readMt5Provisioning(token:string,signal?:AbortSignal){
 const data=await requestJson("/api/app/mt5-provisioning",{headers:{Authorization:`Bearer ${token}`},signal},25000);
 if(data?.connectionMode!=="provisioned-account-only" || data?.selfServiceProvisioning!==false || data?.executionEnabled!==false)throw Error("Provisioning capability could not be verified");
 return data;
}

export async function readAccountAssignment(id:string,token:string,signal:AbortSignal){
 const data=await requestJson("/api/app/mt5-provisioning/requests",{headers:{Authorization:`Bearer ${token}`},signal},20000);
 if(!Array.isArray(data?.requests))throw Error("Account assignment status unavailable");
 const job=data.requests.find((row:any)=>row.id===id);
 if(!job || job.executionEnabled!==false)throw Error("Account assignment status unavailable");
 return job;
}
