import {requestJson} from "./request";
export async function connectMt5Account(input:{login:string;server:string;password:string;broker?:string},token:string,signal:AbortSignal){
 if(!/^[0-9]+$/.test(input.login) || !Number.isSafeInteger(Number(input.login)) || Number(input.login)<=0)throw Error("Account number is outside the supported exact range");
 const data=await requestJson("/api/app/mt5-connect",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(input),signal},25000);
 if(data?.connected!==true || data?.status!=="connected" || String(data.login)!==String(Number(input.login)) || data.server!==input.server)throw Error("Account verification was not confirmed");
 return data;
}
export function readEngineStatus(token:string,signal?:AbortSignal){
 return requestJson("/api/app/engine/status",{headers:{Authorization:`Bearer ${token}`},signal},25000);
}
