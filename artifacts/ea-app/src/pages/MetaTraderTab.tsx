import {assistantEvent} from "@/lib/assistant-events";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronRight, Eye, EyeOff, Fingerprint, LockKeyhole, RotateCcw, Server, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { detectBroker, validateMt5Preview } from "@/lib/brokers";
import { previewMt5Connection } from "@/lib/mt5-preview";
import { requestJson } from "@/lib/request";
import BrokerLogo from "@/components/mt5/BrokerLogo";
import FloatingField from "@/components/mt5/FloatingField";
import "./MetaTraderTab.css";

const mt5Logo = new URL("../assets/platform/metatrader5.png", import.meta.url).href;
type ConnectionState = "idle" | "connecting" | "unverified";
interface SavedAccount { login: string; server: string }

export default function MetaTraderTab() {
  const { bgImageUrl, eaName, clientToken, activeTab, accentColor } = useApp();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedAccount | null>(null);
  const [savedError, setSavedError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const broker = detectBroker(server);
  const modalOpen = state !== "idle";

  useEffect(() => { setBackgroundFailed(false); }, [bgImageUrl]);
  // Read-only restoration: a saved account is never treated as verified live auth.
  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    setSavedError(false);
    if (clientToken) requestJson("/api/app/trading-controls", { headers: { Authorization: `Bearer ${clientToken}` } })
      .then(data => {
        if (!cancelled && data.mt5Login && data.mt5Server) setSaved({ login: String(data.mt5Login), server: data.mt5Server });
      })
      .catch(() => { if (!cancelled) setSavedError(true); });
    return () => { cancelled = true; };
  }, [clientToken, restoreAttempt]);

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
    setPassword("");
    setShowPassword(false);
    setState("connecting");
    assistantEvent({type:"mt5-start",broker:broker?.name || "your broker",server:server.trim()});
    try {
      // No live verification adapter is configured. This credential-free visual
      // demonstration returns unverified only; animation is never auth evidence.
      await previewMt5Connection({ login: login.trim(), server: server.trim() }, attempt.signal);
      if (!attempt.signal.aborted) { setState("unverified"); assistantEvent({type:"mt5-unverified"}); }
    } catch {
      if (!attempt.signal.aborted) { setState("unverified"); assistantEvent({type:"mt5-unverified"}); }
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
    <section className="mt5-screen" aria-label="MT5 Connections" data-state={state}
      style={{ "--mt5-accent": accentColor } as CSSProperties}>
      {bgImageUrl && !backgroundFailed && <img className="mt5-mentor-background" src={bgImageUrl} alt="" onError={() => setBackgroundFailed(true)} />}
      <div className="mt5-background-shade" />
      <div className="mt5-content" inert={modalOpen}>
        <header className="mt5-topline"><span>EA CLOUD</span><p className="mt5-mentor-name">{eaName}</p></header>
        <div className="mt5-intro">
          <img className="mt5-platform-logo" src={mt5Logo} alt="MetaTrader 5" width="60" height="60" />
          <h2>Your Trading World</h2>
          <p>Your account. Your broker. One connection.</p>
        </div>

        <form className="mt5-form" onSubmit={connect}>
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
              value={server} onChange={e => setServer(e.target.value)} placeholder="e.g. Exness-MT5Real1" required list="mt5-broker-hints" />
          </FloatingField>
          <datalist id="mt5-broker-hints">
            {["Exness-MT5Real1", "Deriv-Demo", "ICMarketsSC-MT5", "Pepperstone-MT5-Live01", "XMGlobal-MT5", "HFMarketsSV-Live", "FBS-Real", "Tickmill-Live", "ForexTimeFXTM-Live"].map(value => <option key={value} value={value} />)}
          </datalist>
          {error && <p className="mt5-form-error" role="alert">{error}</p>}
          <button ref={connectButton} type="submit" className="mt5-connect-button"><span>Connect MT5</span><ArrowRight size={18} /></button>
        </form>
        <p className="mt5-availability-note">Live authentication is not integrated yet.<br />Credentials are not sent or saved.</p>
        {(saved || savedError) && <aside className="mt5-saved-account">
          {saved ? <><span>Saved account · unverified</span><p>#{saved.login} <ChevronRight size={12} /> {saved.server}</p><small>Your saved connection is unchanged.</small></> : <><p>Saved account details are unavailable.</p><button type="button" onClick={() => setRestoreAttempt(v => v + 1)}>Retry loading details</button></>}
        </aside>}
      </div>

      {modalOpen && <div className="mt5-connection-screen" role="dialog" aria-modal="true" aria-labelledby="mt5-dialog-title"
        aria-describedby={state === "unverified" ? "mt5-dialog-description" : undefined} onKeyDown={event => {
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
          <div aria-live="polite" aria-atomic="true">
            <h3 id="mt5-dialog-title">{state === "connecting" ? `Connecting to ${broker?.name ?? "broker"}...` : "Backend not reachable right now."}</h3>
            {state === "unverified" && <>
              <p id="mt5-dialog-description">Your account remains unverified. Live MT5 authentication is not integrated yet; no broker login was performed.</p>
              <div className="mt5-result-actions">
                <button type="button" onClick={() => void runAttempt()}><RotateCcw size={15} /> Retry</button>
                <button type="button" onClick={closeConnection}>Back to login</button>
              </div>
            </>}
          </div>
        </div>
      </div>}
    </section>
  );
}
