import {assistantEvent} from "@/lib/assistant-events";
import {ApiRequestError,botActivationMessage,requestJson} from "@/lib/request";
import {useEffect,useRef,useState} from "react";
type View={running:boolean;requested:boolean;confirmed:boolean;error:string|null};
type Session={token:string;version:number;snapshot:View|null;queue:Promise<void>;pending:number;abort:AbortController};
const unknown:View={running:false,requested:false,confirmed:false,error:null};
/** Commands are serialized; only read-back/acknowledged backend evidence changes status. */
export function useBotStatus(token:string|null,enabled:boolean){
 const session=useRef<Session|null>(null);
 const [state,setState]=useState({...unknown,token:null as string|null,pending:false});
 const read=async(current:Session,value?:boolean):Promise<View>=>{
  const data=await requestJson("/api/app/trading-controls",{method:value===undefined?"GET":"PATCH",headers:{Authorization:`Bearer ${current.token}`,...(value===undefined?{}:{"Content-Type":"application/json"})},...(value===undefined?{}:{body:JSON.stringify({copyingEnabled:value})}),signal:current.abort.signal},20000);
  if(typeof data?.copyingEnabled!=="boolean" || (data.botRunning===true&&data.copyingEnabled!==true))throw Error("Unconfirmed backend state");
  return {requested:data.copyingEnabled,running:data.botRunning===true,confirmed:data.copyingEnabled===false||typeof data.botRunning==="boolean",error:botActivationMessage(data.activation?.reason)};
 };
 const refresh=async(current:Session)=>{
  if(current.pending||session.current!==current)return;
  const version=++current.version;
  try{const view=await read(current);if(session.current===current&&current.version===version&&!current.pending){current.snapshot=view;setState({...view,token:current.token,pending:false});}}
  catch{if(session.current===current&&current.version===version&&!current.pending)setState(old=>({...old,confirmed:false,error:"Bot status could not be refreshed. Retry status before sending another command."}));}
 };
 useEffect(()=>{
  if(!enabled||!token){session.current=null;return;}
  const current:Session={token,version:0,snapshot:null,queue:Promise.resolve(),pending:0,abort:new AbortController()};session.current=current;
  setState({...unknown,token,pending:false});void refresh(current);
  const visible=()=>{if(!document.hidden)void refresh(current);};
  const timer=setInterval(visible,30000);window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
  return()=>{clearInterval(timer);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);current.abort.abort();if(session.current===current)session.current=null;};
 },[token,enabled]);
 const setBotRunning=(requested:boolean)=>{
  const current=session.current;if(!current||current.token!==token||!enabled)return;
  const version=++current.version;current.pending++;
  assistantEvent({type:"bot-request",enabled:requested});
  if(requested)window.dispatchEvent(new Event("ea:open-trading-activity"));
  setState(old=>({...old,pending:true,error:null}));
  current.queue=current.queue.then(async()=>{
   if(session.current!==current)return;
   try{
    const view=await read(current,requested);if(session.current!==current)return;current.snapshot=view;
    if(version===current.version){
     const accepted=view.confirmed&&view.requested===requested&&(!requested||view.running);
     const message=view.error??(accepted?null:"The backend did not confirm the requested bot state. Refresh status.");
     setState({...view,token:current.token,pending:false,error:message});
     assistantEvent(accepted?{type:"bot-saved",enabled:requested}:{type:"bot-failed",enabled:requested,message:message!});
    }
   }catch(error){
    if(session.current!==current)return;
    const rejection=error instanceof ApiRequestError&&(error.reason||error.category==="authentication"||error.category==="authorization")?error.message:null;
    // Read only. Never replay a Start/Stop POST/PATCH after rejection or lost acknowledgement.
    let view:View;
    try{view=await read(current);current.snapshot=view;}catch{view={...(current.snapshot??unknown),running:false,confirmed:false};}
    const message=rejection===null ? (view.confirmed?"The command response was unavailable. Current status was refreshed from the backend; no command was retried.":"The command outcome is unconfirmed. Refresh status before retrying."):rejection;
    if(session.current===current&&version===current.version){setState({...view,token:current.token,pending:false,error:message});assistantEvent({type:"bot-failed",enabled:requested,message});}
   }finally{current.pending--;}
  });
 };
 const current=enabled&&state.token===token;
 return {botRunning:!!(current&&state.confirmed&&!state.pending&&state.running),botRequested:current&&state.requested,botStatusConfirmed:!!(current&&state.confirmed),botPending:!!(current&&state.pending),botError:current?state.error:null,setBotRunning,refreshBotStatus:()=>{if(session.current)void refresh(session.current);}};
}
