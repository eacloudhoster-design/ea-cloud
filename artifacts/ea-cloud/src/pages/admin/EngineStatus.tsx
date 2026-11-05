import {useEffect,useState} from "react";
import {loadMentorClientStatus} from "./mentor-engine-status";
/** Mentor-scoped stored copier diagnostics; never presents these as live broker proof. */
export default function EngineStatus(){
 const [clients,setClients]=useState<any[]>([]),[selected,setSelected]=useState(""),[status,setStatus]=useState<any>(null),[error,setError]=useState(""),[revision,setRevision]=useState(0);
 useEffect(()=>{const c=new AbortController();fetch("/api/admin/engine/clients",{credentials:"same-origin",signal:c.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!c.signal.aborted)setClients(d.clients);}).catch(()=>{if(!c.signal.aborted)setError("Client engine status unavailable.");});return()=>c.abort();},[]);
 useEffect(()=>{setStatus(null);if(!selected)return;const c=new AbortController();setError("");loadMentorClientStatus(selected,c.signal).then(data=>{if(!c.signal.aborted)setStatus(data);}).catch(()=>{if(!c.signal.aborted)setError("Client engine status unavailable.");});return()=>c.abort();},[selected,revision]);
 return <section className="rounded-2xl border border-white/10 p-5 mb-6" aria-label="Client copier status"><h2 className="font-semibold">Client copier status</h2><p className="text-sm text-white/60">Retained mappings and execution outcomes with a fresh read-only account check.</p>
 <label>Client <select value={selected} onChange={e=>setSelected(e.target.value)} className="bg-slate-900 p-2 m-2"><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select></label>
 {selected&&<button type="button" onClick={()=>setRevision(v=>v+1)}>Refresh</button>}{error&&<p role="alert">{error}</p>}
 {status?.clientId===Number(selected)&&<><p>Account: {status.account?`${status.account.login} · ${status.account.server}`:"Not configured"}</p><p>Copying {status.copier.requested?"requested":"paused"} · Connection {status.connection.code.toLowerCase().replaceAll("_"," ")}</p><p>Copier: {status.copier.state} · Held submissions: {status.copier.unresolvedJournalHolds ?? "unverified"} · Emergency stop: {status.copier.emergencyStopActive === null ? "unverified" : status.copier.emergencyStopActive ? "active" : "clear"}</p><p>{status.mappings.length} retained mappings · {status.recentExecutions.length} recent attempts</p><ul>{status.recentExecutions.map((e:any)=><li key={e.id}>{e.kind} {e.symbol} · {e.status}{e.errorCode?" · review required":""}</li>)}</ul></>}
 </section>;
}
