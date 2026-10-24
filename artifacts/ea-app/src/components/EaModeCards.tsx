import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { useApp } from "@/context/AppContext";
import "./EaModeCards.css";

const modes = ["NORMAL", "BEAST", "AGGRESSIVE", "ULTIMATE"] as const;
type Ea = { id: number; name: string; images: (string | null)[] };
export default function EaModeCards() {
  const { clientToken } = useApp();
  const [data, setData] = useState<{token:string|null;eas:Ea[]}>({token:null,eas:[]});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selectedEa, setSelectedEa] = useState(0);
  const [selected, setSelected] = useState(0);
  let account = "";
  try { account = atob(clientToken || "").split(":")[0]; } catch { /* no persisted anonymous selection */ }
  const accountKey = `ea-cloud:client:${account}:visual-ea`;
  const eas = data.token === clientToken ? data.eas : [];
  const ea = eas.find(item => item.id === selectedEa) || eas[0];
  const modeKey = `ea-cloud:client:${account}:ea:${ea?.id}:visual-mode`;
  useEffect(() => {
    try { setSelectedEa(Number(localStorage.getItem(accountKey)) || 0); } catch { setSelectedEa(0); }
  }, [accountKey]);
  useEffect(() => {
    try { const value = Number(localStorage.getItem(modeKey)); setSelected(Number.isInteger(value) && value >= 0 && value < 4 ? value : 0); }
    catch { setSelected(0); }
  }, [modeKey]);
  useEffect(() => {
    if (!clientToken) { setLoading(false); setError("Sign in to load EA artwork."); return; }
    let alive = true;
    let controller: AbortController | undefined;
    const load = async (initial = false) => {
      if (document.hidden && !initial) return;
      controller?.abort(); const current = new AbortController(); controller = current;
      let timedOut=false;
      const timeout = window.setTimeout(()=>{timedOut=true;current.abort();},20000);
      try {
        const result = await fetch("/api/app/ea-mode-images", { cache:"no-store",headers:{Authorization:`Bearer ${clientToken}`}, signal:current.signal });
        if (!result.ok) {
          if (alive && (result.status === 401 || result.status === 403)) setData({token:clientToken,eas:[]});
          const body = await result.json().catch(()=>({}));
          throw new Error(body.error || "Unable to load mode images. Please retry.");
        }
        const response = await result.json();
        if (!alive || current.signal.aborted) return;
        if (!Array.isArray(response.eas)) throw new Error("Invalid mode image response.");
        setData({token:clientToken,eas:response.eas}); setError("");
      } catch (err) { if (alive && (!current.signal.aborted || timedOut)) setError(timedOut ? "Loading artwork timed out. Please retry." : (err as Error).message || "Unable to load mode images."); }
      finally { clearTimeout(timeout); if (alive && controller === current) setLoading(false); }
    };
    setLoading(true); void load(true);
    const refresh = () => { void load(); };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus",refresh); document.addEventListener("visibilitychange",refresh);
    return () => { alive=false; controller?.abort(); clearInterval(timer); window.removeEventListener("focus",refresh); document.removeEventListener("visibilitychange",refresh); };
  }, [clientToken,retry]);
  const choose = (index:number) => {
    setSelected(index);
    try { localStorage.setItem(modeKey,String(index)); } catch { /* session choice still works */ }
  };
  return <div className="ea-mode-settings">
    <p className="ea-mode-note">Appearance only · trading settings stay unchanged</p>
    {eas.length > 1 && <label className="ea-mode-ea">EA artwork
      <select aria-label="EA artwork" value={ea?.id} onChange={event=>{
        const id=Number(event.target.value);setSelectedEa(id);
        try {localStorage.setItem(accountKey,String(id));} catch { /* session only */ }
      }}>{eas.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </label>}
    {loading && !ea && <p role="status">Loading EA artwork…</p>}
    {error && <div role="alert" className="ea-mode-error">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    {!loading && !ea && !error && <p>No active EA is linked to this mentor.</p>}
    {ea && <div className="ea-mode-grid" role="group" aria-label={`${ea.name} visual modes`}>
      {modes.map((name,index)=><button type="button" key={`${ea.id}-${name}`} aria-label={`${name} visual mode`} aria-pressed={selected===index} className="ea-mode-card" onClick={()=>choose(index)}>
        {ea.images[index] ? <img key={ea.images[index]} src={ea.images[index]!} alt="" onError={event=>{event.currentTarget.style.display="none";}} /> : <ImageOff aria-hidden size={20} />}
        <span>{name}</span>
      </button>)}
    </div>}
  </div>;
}
