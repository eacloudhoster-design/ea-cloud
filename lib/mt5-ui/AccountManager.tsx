import "./AccountManager.css";
import {useEffect,useRef,useState} from "react";
type Account={id:string;login:string;server:string;broker:string;accountMode:string;state:string;lastVerifiedAt:string;verified?:boolean;balance?:number|null;equity?:number|null;currency?:string|null};
export function AccountManager({role,onSelected}:{role:"master"|"follower";onSelected?:()=>void}){
 const base=role==="master"?"/api/admin/mt5-accounts":"/api/app/mt5-accounts";
 const [accounts,setAccounts]=useState<Account[]>([]),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [login,setLogin]=useState(""),[server,setServer]=useState(""),[password,setPassword]=useState("");
 const mounted=useRef(true),controller=useRef<AbortController|null>(null);
 async function request(path:string,method="GET",body?:unknown){
  const c=new AbortController();controller.current=c;const timer=setTimeout(()=>c.abort(),25000);
  try{const response=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},signal:c.signal,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){const messages:Record<string,string>={ACCOUNT_REBIND_REQUIRES_RECONCILIATION:"Existing position mappings require reconciliation before switching accounts.",ACCOUNT_ALREADY_BOUND:"This account is already assigned.",ACCOUNT_DISCONNECTED:"Reconnect this account with its credentials before checking or selecting it.",ACCOUNT_NOT_FOUND:"Account not found.",SOURCE_LOGIN_SCHEMA_LIMIT:"This account number exceeds the current master-account limit."};throw Error(messages[data.code]||"Account management could not be confirmed. Refresh before retrying.");}return data;}finally{clearTimeout(timer);}
 }
 async function refresh(){const data=await request(base);if(!Array.isArray(data.accounts))throw Error("Account list unavailable");if(mounted.current){setAccounts(data.accounts);setAvailable(true);}}
 useEffect(()=>{mounted.current=true;setAvailable(false);setAccounts([]);void refresh().catch(()=>{if(mounted.current)setAvailable(false);});return()=>{mounted.current=false;controller.current?.abort();};},[base]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setMessage("");try{await action();}catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:"Account management unavailable");}finally{if(mounted.current)setBusy(false);}}
 if(!available)return null;
 return <section className="mt5-account-manager" aria-label="Your linked MT5 accounts">
  <h3>Your linked accounts</h3>
  <p>Link each provisioned account using its own credentials. Select an account separately to use it in the app. Selecting pauses copying; retained position mappings can block a switch.</p>
  <form onSubmit={e=>{e.preventDefault();const secret=password;setPassword("");void run(async()=>{await request(base,"POST",{login,server,password:secret});await refresh();if(mounted.current)setMessage("Account verified and linked. Copying has not been enabled.");});}}>
   <label>Account number<input required inputMode="numeric" pattern="[1-9][0-9]*" value={login} onChange={e=>setLogin(e.target.value)} /></label>
   <label>Broker server<input required maxLength={256} value={server} onChange={e=>setServer(e.target.value)} /></label>
   <label>Account password<input required type="password" autoComplete="off" maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} /></label>
   <button disabled={busy}>Verify and link account</button>
  </form>
  <button disabled={busy} onClick={()=>void run(refresh)}>Refresh account list</button>
  <p role="status">{message}</p>
  <ul>{accounts.map(account=><li key={account.id}>
   <p>#{account.login} · {account.server} · {account.accountMode} · {account.verified?"Connection verified now":account.state==="disconnected"?"Disconnected":"Saved · connection unverified"}</p>
   {account.verified&&<p>Balance: {account.balance??"Unavailable"} {account.currency} · Equity: {account.equity??"Unavailable"}</p>}
   <button disabled={busy||account.state==="disconnected"} onClick={()=>void run(async()=>{const proof=await request(base+"/"+account.id+"/status");if(mounted.current)setAccounts(rows=>rows.map(row=>row.id===account.id?{...row,...proof}:row));})}>Check connection</button>
   <button disabled={busy||account.state==="disconnected"} onClick={()=>void run(async()=>{await request(base+"/"+account.id+"/select","POST",{});if(mounted.current){setMessage("Account selected. Copying is paused.");onSelected?.();}})}>Select account</button>
   <button disabled={busy||account.state==="disconnected"} onClick={()=>void run(async()=>{await request(base+"/"+account.id+"/disconnect","POST",{});await refresh();if(mounted.current){setMessage("Account disconnected. Existing positions are unchanged.");onSelected?.();}})}>Disconnect account</button>
   {account.state==="disconnected"&&<button disabled={busy} onClick={()=>{setLogin(account.login);setServer(account.server);setPassword("");setMessage("Enter this account's password to reconnect.");}}>Reconnect account</button>}
  </li>)}</ul>
 </section>;
}
