import {assistantEvent} from "@/lib/assistant-events";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronRight, Eye, EyeOff, Fingerprint, LockKeyhole, RotateCcw, Server, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { brokers, detectBroker, validateMt5Preview } from "@/lib/brokers";
import { connectMt5Account,readEngineStatus } from "@/lib/mt5-engine";
import { startMt5StatusRefresh } from "@/lib/mt5-status-refresh";
import { requestJson,ApiRequestError } from "@/lib/request";
import BrokerLogo from "@/components/mt5/BrokerLogo";
import FloatingField from "@/components/mt5/FloatingField";
import "./MetaTraderTab.css";

const mt5Logo = new URL("../assets/platform/metatrader5.png", import.meta.url).href;
type ConnectionState = "idle" | "connecting" | "unverified" | "verified";
interface SavedAccount { login: string; server: string }

export default function MetaTraderTab({ backgroundHost, backgroundImage }: { backgroundHost: HTMLElement | null; backgroundImage: string }) {
  const { eaName, clientToken, activeTab, accentColor } = useApp();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [selectedBroker,setSelectedBroker]=useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedAccount | null>(null);
  const [savedError, setSavedError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [engine,setEngine]=useState<any>(null);
  const [snapshot,setSnapshot]=useState<any>(null);
  const [historyError,setHistoryError]=useState("");
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyController=useRef<AbortController|null>(null);
  useEffect(()=>{
    const invalidate=()=>{historyController.current?.abort();setSnapshot(null);setHistoryError("");setHistoryLoading(false);};
    invalidate();
    if(!clientToken || activeTab!=="metatrader")return;
    window.addEventListener("ea:engine-refresh",invalidate);
    return ()=>{historyController.current?.abort();window.removeEventListener("ea:engine-refresh",invalidate);};
  },[clientToken,activeTab,restoreAttempt]);
  const refreshHistory=async()=>{
    historyController.current?.abort();const c=new AbortController();historyController.current=c;
    setHistoryLoading(true);setHistoryError("");setSnapshot(null);
    try{const data=await requestJson("/api/app/engine/history",{signal:c.signal},25000);if(!c.signal.aborted)setSnapshot(data);}
    catch{if(!c.signal.aborted)setHistoryError("Broker history unavailable. The assigned worker needs a valid private demo-session authorization.");}
    finally{if(!c.signal.aborted)setHistoryLoading(false);}
  };
  const [enrollments,setEnrollments]=useState<any[]>([]);
  const [enrolling,setEnrolling]=useState(false);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const broker = brokers.find(b=>b.id===selectedBroker) ?? detectBroker(server);
  const modalOpen = state !== "idle";

  useEffect(() => { setBackgroundFailed(false); }, [backgroundImage]);
  // Read-only restoration: a saved account is never treated as verified live auth.
  useEffect(() => {
    setSaved(null);
    setEngine(null);
    setSavedError(false);
    if (!clientToken || activeTab !== "metatrader") return;
    return startMt5StatusRefresh({
      read: signal => readEngineStatus(clientToken, signal),
      success: data => {
        setEngine(data);
        setSavedError(false);
        setSaved(data.account?.login && data.account?.server ? {login:String(data.account.login),server:data.account.server} : null);
      },
      failure: () => { setEngine(null); setSavedError(true); },
      window, document,
    });
  }, [clientToken, restoreAttempt,activeTab]);

  useEffect(() => {
    setEnrollments([]);
    if (!clientToken || activeTab !== "metatrader") return;
    const c=new AbortController();
    void requestJson("/api/app/mt5-enrollment",{signal:c.signal}).then(data=>{if(!c.signal.aborted)setEnrollments(data.requests??[]);}).catch(()=>{});
    return ()=>c.abort();
  },[clientToken,activeTab,restoreAttempt]);
  const requestEnrollment = async () => {
    const message=validateMt5Preview(login,password,server);
    if(message||!selectedBroker||!clientToken){setError(message||"Select a broker and sign in.");return;}
    if(enrolling)return;
    const attempt=new AbortController();controller.current?.abort();controller.current=attempt;
    const secret=password;setPassword("");setShowPassword(false);setEnrolling(true);setError("");
    try{
      const data=await requestJson("/api/app/mt5-enrollment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login:String(Number(login.trim())),server:server.trim(),password:secret,broker:selectedBroker}),signal:attempt.signal},25000);
      if(!attempt.signal.aborted){setEnrollments(items=>[data.request,...items.filter(r=>r.id!==data.request.id)]);setRestoreAttempt(v=>v+1);}
    }catch{if(!attempt.signal.aborted)setError("Provisioning request was not confirmed. The account may already be reserved or require owner review.");}
    finally{setEnrolling(false);}
  };

  const closeConnection = () => {
    controller.current?.abort();
    setState("idle");
    setPassword("");
    setShowPassword(false);
    restoreFocus.current = true;
  };
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    // These tabs stay mounted. Cancel when leaving or losing the client session.
    if (activeTab !== "metatrader" || !clientToken) {
      controller.current?.abort();
      setState("idle");
      setPassword("");
      setShowPassword(false);
    }
  }, [activeTab, clientToken]);
  useEffect(() => {
    if (modalOpen) closeButton.current?.focus({ preventScroll: true });
    else if (restoreFocus.current) {
      if (activeTab === "metatrader") connectButton.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [modalOpen, activeTab, state]);

  const runAttempt = async () => {
    if (!clientToken || state === "connecting") return;
    controller.current?.abort();
    const attempt = new AbortController();
    controller.current = attempt;
    const secret=password;
    setPassword("");
    setShowPassword(false);
    setState("connecting");
    assistantEvent({type:"mt5-start",broker:broker?.name || "your broker",server:server.trim()});
    try {
      const data=await connectMt5Account({login:login.trim(),server:server.trim(),password:secret,broker:selectedBroker},clientToken,attempt.signal);
      if(!attempt.signal.aborted){setSaved({login:String(data.login),server:data.server});setState("verified");setRestoreAttempt(v=>v+1);}
    } catch (failure) {
      if (!attempt.signal.aborted) { setError(failure instanceof ApiRequestError?failure.message:"Account verification unavailable. Check the assigned demo worker.");setState("unverified"); assistantEvent({type:"mt5-unverified"}); }
    }
  };
  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    const message = validateMt5Preview(login, password, server);
    if (message || !clientToken) { setError(message || "Sign in to manage your MT5 connection."); return; }
    setError("");
    void runAttempt();
  };

  return (
    <>
      {backgroundHost && createPortal(
        <div className="mt5-screen mt5-background-layer" data-state={state}
          style={{ "--mt5-accent": accentColor } as CSSProperties}>
          {!backgroundFailed && <img className="mt5-mentor-background" src={backgroundImage} alt="" onError={() => setBackgroundFailed(true)} />}
          <div className="mt5-background-shade" />
        </div>, backgroundHost)}
    <section className="mt5-screen" aria-label="MT5 Connections" data-state={state}
      style={{ "--mt5-accent": accentColor } as CSSProperties}>
      <div className="mt5-content" inert={modalOpen}>
        <header className="mt5-topline"><span>EA CLOUD</span><p className="mt5-mentor-name">{eaName}</p></header>
        <div className="mt5-intro">
          <img className="mt5-platform-logo" src={mt5Logo} alt="MetaTrader 5" width="60" height="60" />
          <h2>Your Trading World</h2>
          <p>Your account. Your broker. One connection.</p>
        </div>

        <form className="mt5-form" onSubmit={connect}>
          <label className="mt5-broker-select-label">Broker
            <select aria-label="Broker" value={selectedBroker} onChange={e=>setSelectedBroker(e.target.value)} required className="mt5-broker-select">
              <option value="">Select broker</option>{[["justmarkets","JustMarkets"],["exness","Exness"],["deriv","Deriv"],["xm","XM Global"],["rcg","RCG Markets"]].map(([id,name])=><option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <FloatingField id="mt5-login" label="MT5 Account Number" icon={Fingerprint}>
            <input id="mt5-login" inputMode="numeric" type="text" autoComplete="off" maxLength={32}
              value={login} onChange={e => setLogin(e.target.value)} placeholder="Enter account number" required />
          </FloatingField>
          <FloatingField id="mt5-password" label="Password" icon={LockKeyhole}>
            <input id="mt5-password" type={showPassword ? "text" : "password"} autoComplete="off"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="MT5 account password" required />
            <button type="button" className="mt5-eye" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </FloatingField>
          <FloatingField id="mt5-server" label="Server" icon={Server}>
            <input id="mt5-server" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" maxLength={128}
              value={server} onChange={e => setServer(e.target.value)} placeholder="Exact server shown by your broker" required list="mt5-broker-hints" />
          </FloatingField>
          <datalist id="mt5-broker-hints">
            {["Exness-MT5Real1", "Deriv-Demo", "ICMarketsSC-MT5", "Pepperstone-MT5-Live01", "XMGlobal-MT5", "HFMarketsSV-Live", "FBS-Real", "Tickmill-Live", "ForexTimeFXTM-Live"].map(value => <option key={value} value={value} />)}
          </datalist>
          {error && <p className="mt5-form-error" role="alert">{error}</p>}
          <button ref={connectButton} type="submit" disabled={enrolling} className="mt5-connect-button"><span>Connect MT5</span><ArrowRight size={18} /></button>
        </form>
        <button type="button" className="mt5-connect-button" disabled={enrolling} onClick={()=>void requestEnrollment()}>{enrolling?"Saving request...":"Request demo provisioning"}</button>
        {enrollments.length>0&&<aside className="mt5-saved-account" aria-label="Account provisioning requests">{enrollments.map(r=><p key={r.id}>#{r.login} · {r.server} · {r.status==="verified"?"Account verified":"Awaiting operator provisioning; not connected"}</p>)}</aside>}
        <p className="mt5-availability-note">Only provisioned demo accounts can be verified.<br />Verification does not enable order execution.</p>
        {(saved || savedError) && <aside className={`mt5-saved-account ${engine?.connection?.verified?"mt5-status-connected":"mt5-status-disconnected"}`}>
          {saved ? <><span>{engine?.connection?.verified ? "Demo connection verified" : "Saved account · status unverified"}</span><p>#{saved.login} <ChevronRight size={12} /> {saved.server}</p><small>Copier: {engine?.copier?.state || "unverified"}. Checked: {engine?.observedAt?new Date(engine.observedAt).toLocaleTimeString():"unverified"}. {engine?.copier?.emergencyStopActive === true ? "Emergency stop active." : ""}</small><button type="button" onClick={()=>setRestoreAttempt(v=>v+1)}>Refresh status</button><button type="button" onClick={()=>{setLogin(saved.login);setServer(saved.server);setSelectedBroker(engine?.account?.broker||"");setState("idle");}}>Reconnect</button><button type="button" onClick={async()=>{try{await requestJson("/api/app/mt5-disconnect",{method:"POST",headers:{Authorization:`Bearer ${clientToken}`}});setSaved(null);setEngine(null);setRestoreAttempt(v=>v+1);}catch{setError("Disconnect could not be confirmed.");}}}>Disconnect</button></> : <><p>Saved account details are unavailable.</p><button type="button" onClick={() => setRestoreAttempt(v => v + 1)}>Retry loading details</button></>}
        </aside>}
        {saved && <aside className="mt5-saved-account" aria-label="Broker positions and history">
          {engine?.connection?.verified && <p>Positions: {engine.connection.positions??"unavailable"} · Pending orders: {engine.connection.pendingOrders??"unavailable"} · Balance: {engine.connection.balance??"unavailable"} · Equity: {engine.connection.equity??"unavailable"} {engine.connection.currency??""}</p>}
          <button type="button" disabled={historyLoading || !engine?.connection?.verified} onClick={()=>void refreshHistory()}>{historyLoading?"Reading broker history...":"Read broker positions and history"}</button>
          {historyError && <p role="alert">{historyError}</p>}
          {snapshot && <><p>Broker snapshot: {new Date(snapshot.observedAt).toLocaleString()}. History: last 24 hours; up to 200 rows per category.</p>
            {[["positions","Open positions"],["orders","Pending orders"],["deals","Deals"],["historyOrders","Order history"]].map(([key,label])=><section key={key}><h3>{label}{snapshot.truncated?.[key]?" (truncated)":""}</h3>
              {snapshot[key]?.length?<ul>{snapshot[key].map((row:any)=><li key={row.ticket}>#{row.ticket} · {row.symbol} · Volume {row.volume??row.volume_current} · {row.price??row.price_current??row.price_open}{row.profit!==undefined?` · P/L ${row.profit}`:""}</li>)}</ul>:<p>No records in this snapshot.</p>}</section>)}
          </>}
        </aside>}
      </div>

      {modalOpen && <div className="mt5-connection-screen" role="dialog" aria-modal="true" aria-labelledby="mt5-dialog-title"
        aria-describedby={state !== "connecting" ? "mt5-dialog-description" : undefined} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); closeConnection(); }
          if (event.key === "Tab") {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const first = buttons[0]; const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }}>
        <button ref={closeButton} className="mt5-modal-close" type="button" aria-label={state === "connecting" ? "Cancel connection" : "Close connection details"} onClick={closeConnection}><X size={20} /></button>
        <div className="mt5-connection-content">
          <div className="mt5-broker-stage">
            <div className="mt5-broker-float"><div className="mt5-broker-reveal"><BrokerLogo key={broker?.id ?? "unknown"} broker={broker} /></div></div>
          </div>
          {state === "connecting" && <div className="mt5-small-spinner" role="status" aria-label="Connecting" />}
          {state!=="connecting"&&<span className={`mt5-live-indicator ${state==="verified"?"is-connected":"is-disconnected"}`}>{state==="verified"?"Verified demo connection":"Connection not verified"}</span>}
          <div aria-live="polite" aria-atomic="true">
            <h3 id="mt5-dialog-title">{state === "connecting" ? "Connecting to MT5..." : state === "verified" ? "Connected Successfully" : "Account verification unavailable"}</h3>
            {state === "verified" && <p id="mt5-dialog-description">MT5 Account Connected. The bound demo terminal confirmed your identity. Copying permissions and emergency stops are unchanged.</p>}
            {state === "unverified" && <>
              <p id="mt5-dialog-description">{error || "Your account could not be verified. Confirm that this demo account has been provisioned for EA Cloud."} Order execution remains unchanged.</p>
              <div className="mt5-result-actions">
                <button type="button" onClick={closeConnection}><RotateCcw size={15} /> Re-enter credentials</button>
                <button type="button" onClick={closeConnection}>Back to login</button>
              </div>
            </>}
          </div>
        </div>
      </div>}
    </section>
    </>
  );
}
