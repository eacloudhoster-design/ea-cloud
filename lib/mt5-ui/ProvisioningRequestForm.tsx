export {AccountManager} from "./AccountManager";
import {useEffect,useRef,useState} from "react";
/** Same-origin cookie auth; passwords exist only until POST and are never persisted. */
export function ProvisioningRequestForm({role}:{role:"master"|"follower"}){
 const base=role==="master"?"/api/admin/mt5-provisioning/requests":"/api/app/mt5-provisioning/requests";
 const [broker,setBroker]=useState("justmarkets"),[login,setLogin]=useState(""),[server,setServer]=useState(""),[password,setPassword]=useState("");
 const [accountMode,setAccountMode]=useState("demo"),[liveAvailable,setLiveAvailable]=useState(false);
 const [ownershipConfirmed,setOwnershipConfirmed]=useState(false);
 const [rows,setRows]=useState<any[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const active=useRef<AbortController|null>(null),key=useRef<string|null>(null),mounted=useRef(true);
 async function request(path:string,method="GET",body?:unknown){
  active.current?.abort();const controller=new AbortController();active.current=controller;
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
   const data=await response.json();
   if(!response.ok)throw Error(data.code==="PROVISIONING_NOT_CONFIGURED"?"Provisioning requests are not yet available. Your existing connection is unchanged.":data.code==="PROVISIONING_ALREADY_PENDING"?"A request already exists. Refresh its status before submitting again.":"The request could not be confirmed. Refresh status before retrying.");
   return data;
  }finally{clearTimeout(timer);}
 }
 useEffect(()=>{const c=new AbortController();void fetch(role==="master"?"/api/admin/mt5-account-capabilities":"/api/app/mt5-provisioning",{credentials:"same-origin",cache:"no-store",signal:c.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!c.signal.aborted)setLiveAvailable(data?.accountModes?.includes("live")===true);}).catch(()=>{});return()=>c.abort();},[role]);
 async function refresh(){try{const data=await request(base);if(mounted.current){if(!Array.isArray(data.requests))throw Error("Provisioning status could not be verified");setRows(data.requests);setMessage("");}}catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:"Status unavailable");}}
 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;active.current?.abort();};},[base]);
 useEffect(()=>{
  if(busy||!rows.some(row=>["queued","provisioning"].includes(row.state)))return;
  const timer=setTimeout(()=>void refresh(),5000);
  return ()=>clearTimeout(timer);
 },[rows,busy,base]);
 return <section aria-label="Request your own MT5 account worker">
  <h3>Request your own MT5 connection</h3>
  <p>{liveAvailable?"Demo and approved live read-only accounts.":"Demo accounts only."} Provisioning does not connect an account or enable copying. Confirm your connection separately after the worker is verified.</p>
  <form onSubmit={async e=>{
   e.preventDefault();if(busy)return;setBusy(true);key.current??=crypto.randomUUID();
   const secret=password;setPassword("");
   try{await request(base,"POST",{requestKey:key.current,broker,login,server,password:secret,accountRole:role,accountMode,ownershipConfirmed});if(mounted.current){setMessage("Request accepted; broker authentication is still pending.");key.current=null;await refresh();}}
   catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:"Request unavailable");}
   finally{if(mounted.current)setBusy(false);}
  }}>
   {liveAvailable&&<label>Account mode<select value={accountMode} onChange={e=>{setAccountMode(e.target.value);key.current=null;}}><option value="demo">Demo</option><option value="live">Live — read-only connection</option></select></label>}
   <label>Account purpose<select value={role} disabled><option value="master">Master — mentor source</option><option value="follower">Follower — receiving client</option></select></label>
   <label>Broker<select value={broker} onChange={e=>{setBroker(e.target.value);key.current=null;}}>{[["justmarkets","JustMarkets"],["deriv","Deriv"],["exness","Exness"],["xm","XM Global"],["rcg","RCG Markets"]].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label>MT5 login<input required inputMode="numeric" pattern="[1-9][0-9]*" value={login} onChange={e=>{setLogin(e.target.value);key.current=null;}} /></label>
   <label>Exact broker server<input required maxLength={256} value={server} onChange={e=>{setServer(e.target.value);key.current=null;}} /></label>
   <label>MT5 password<input required type="password" autoComplete="off" maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} /></label>
   <label><input required type="checkbox" checked={ownershipConfirmed} onChange={e=>setOwnershipConfirmed(e.target.checked)} />I own or am authorized to connect this account.</label>
   <button disabled={busy||!ownershipConfirmed} type="submit">{busy?"Submitting…":"Request account worker"}</button>
  </form>
  <button type="button" disabled={busy} onClick={()=>void refresh()}>Refresh provisioning status</button>
  <p role="status">{message}</p>
  <ul>{rows.map(row=><li key={row.id}>#{row.login} · {row.server} · {row.accountRole} · {row.state}{row.errorCode?` · ${row.errorCode}`:""}{row.requiresConnectionVerification?" · Verify connection using the connection form":""}
   {row.state==="queued"&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await request(base+"/"+row.id+"/cancel","POST",{});await refresh();}catch{if(mounted.current)setMessage("Cancellation could not be confirmed.");}finally{if(mounted.current)setBusy(false);}}}>Cancel queued request</button>}
  </li>)}</ul>
 </section>;
}
