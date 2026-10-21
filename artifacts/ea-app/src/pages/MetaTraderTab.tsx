import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronRight, Eye, EyeOff, Fingerprint, Info, Layers3, LockKeyhole, Radio, RotateCcw, Server, Shield, ShieldAlert, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { detectBroker, validateMt5Preview } from "@/lib/brokers";
import { previewMt5Connection } from "@/lib/mt5-preview";
import { requestJson } from "@/lib/request";
import BrokerLogo from "@/components/mt5/BrokerLogo";
import "./MetaTraderTab.css";

type ConnectionState = "idle" | "connecting" | "unverified";
interface SavedAccount { login: string; server: string }

export default function MetaTraderTab() {
  const { bgImageUrl, eaName, clientToken, activeTab } = useApp();
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
  const brokerName = broker?.name ?? "your broker";
  const modalOpen = state !== "idle";

  useEffect(() => { setBackgroundFailed(false); }, [bgImageUrl]);

  // Read-only restoration. Historical saved flags are not proof of a live session.
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

  const closePreview = () => {
    controller.current?.abort();
    setState("idle");
    setPassword("");
    setShowPassword(false);
    restoreFocus.current = true;
  };

  useEffect(() => () => { controller.current?.abort(); }, []);
  // Tabs remain mounted in this app; leaving the screen must cancel its preview.
  useEffect(() => {
    if (activeTab !== "metatrader") {
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
  }, [modalOpen, activeTab]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (controller.current && !controller.current.signal.aborted && state === "connecting") return;
    const message = validateMt5Preview(login, password, server);
    if (message || !clientToken) {
      setError(message || "Sign in to manage your MT5 connection.");
      return;
    }
    setError("");
    setPassword("");
    setShowPassword(false);
    const attempt = new AbortController();
    controller.current = attempt;
    setState("connecting");
    try {
      // No credentials are submitted. This is the future verification boundary.
      await previewMt5Connection({ login: login.trim(), server: server.trim() }, attempt.signal);
      if (!attempt.signal.aborted) setState("unverified");
    } catch {
      if (!attempt.signal.aborted) setState("unverified");
    }
  };

  return (
    <section className="mt5-screen" aria-label="MT5 Connections">
      {bgImageUrl && !backgroundFailed && <img className="mt5-mentor-background" src={bgImageUrl} alt="" onError={() => setBackgroundFailed(true)} />}
      <div className="mt5-background-shade" />
      <div className="mt5-content" inert={modalOpen}>
        <header className="mt5-topline">
          <div><span className="mt5-eyebrow">EA CLOUD / TERMINAL</span><p className="mt5-mentor-name">{eaName}</p></div>
          <span className="mt5-terminal-icon"><Layers3 size={20} strokeWidth={1.3} /></span>
        </header>

        <div className="mt5-account-heading"><span className="mt5-heading-dot" />MT5 ACCOUNT<span className="mt5-version">05</span></div>
        <div className="mt5-status"><span /> NOT CONNECTED <span className="mt5-status-divider">/</span><span className="mt5-terminal-label">METATRADER 5</span></div>

        <div className="mt5-intro">
          <div className="mt5-platform-mark" aria-hidden="true"><Layers3 size={28} strokeWidth={1.4} /><span>5</span></div>
          <span className="mt5-eyebrow">YOUR NEXT CONNECTION</span>
          <h2>Your trading world.</h2>
          <p>One account. Every opportunity.</p>
        </div>

        <form className="mt5-form" onSubmit={connect}>
          <div className="mt5-form-heading"><span>MT5 LOGIN DETAILS</span><LockKeyhole size={13} /></div>
          <label htmlFor="mt5-login">LOGIN / ACCOUNT NUMBER</label>
          <div className="mt5-input-wrap"><Fingerprint size={19} /><input id="mt5-login" inputMode="numeric" type="text" autoComplete="off" maxLength={32}
            value={login} onChange={e => setLogin(e.target.value)} placeholder="Your MT5 account number" required /></div>

          <label htmlFor="mt5-password">PASSWORD</label>
          <div className="mt5-input-wrap"><LockKeyhole size={18} /><input id="mt5-password" type={showPassword ? "text" : "password"} autoComplete="off"
            value={password} onChange={e => setPassword(e.target.value)} placeholder="MT5 account password" required />
            <button type="button" className="mt5-eye" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          <label htmlFor="mt5-server">BROKER SERVER</label>
          <div className="mt5-input-wrap"><Server size={18} /><input id="mt5-server" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" maxLength={128}
            value={server} onChange={e => setServer(e.target.value)} placeholder="e.g. Exness-MT5Real1" required list="mt5-broker-hints" /></div>
          <datalist id="mt5-broker-hints">
            {["Exness-MT5Real1", "Deriv-Demo", "ICMarketsSC-MT5", "Pepperstone-MT5-Live01", "XMGlobal-MT5", "HFMarketsSV-Live", "FBS-Real", "Tickmill-Live", "ForexTimeFXTM-Live"].map(value => <option key={value} value={value} />)}
          </datalist>
          <div className="mt5-broker-hint"><Radio size={12} /><span>{broker ? `${broker.name} detected` : "Enter the server from your broker"}</span><span>MT5 SERVER</span></div>

          {error && <p className="mt5-form-error" role="alert"><ShieldAlert size={15} />{error}</p>}
          <button ref={connectButton} type="submit" className="mt5-connect-button"><Shield size={18} /><span>Connect MT5</span><ArrowRight size={18} /></button>
          <p className="mt5-availability-note"><Info size={13} /><span>Live verification is currently unavailable.<br />Your password is not sent or saved.</span></p>
        </form>

        {(saved || savedError) && <aside className="mt5-saved-account">
          {saved ? <><span className="mt5-eyebrow">EXISTING ACCOUNT · UNVERIFIED</span><p>#{saved.login} <ChevronRight size={13} /> {saved.server}</p><small>Your saved connection is unchanged.</small></> : <><p>Saved account details are unavailable.</p><button type="button" onClick={() => setRestoreAttempt(v => v + 1)}>Retry loading details</button></>}
        </aside>}
        <footer className="mt5-footer"><span className="mt5-footer-line" /><span>METATRADER 5</span><span className="mt5-footer-line" /></footer>
      </div>

      {modalOpen && <div className="mt5-modal-backdrop" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); closePreview(); }
        if (event.key === "Tab") {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const first = buttons[0]; const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
        <div className="mt5-connection-modal" data-state={state} role="dialog" aria-modal="true" aria-labelledby="mt5-dialog-title" aria-describedby="mt5-dialog-description">
          <button ref={closeButton} className="mt5-modal-close" type="button" aria-label={state === "connecting" ? "Cancel connection" : "Close connection details"} onClick={closePreview}><X size={20} /></button>
          <span className="mt5-modal-chip"><Layers3 size={13} /> METATRADER 5</span>
          <div className={`mt5-broker-stage ${state === "connecting" ? "is-connecting" : ""}`}>
            <div className="mt5-orbit mt5-orbit--outer" /><div className="mt5-orbit mt5-orbit--inner" />
            <div className="mt5-broker-reveal"><BrokerLogo key={broker?.id ?? "unknown"} broker={broker} /></div>
            <span className="mt5-stage-status" aria-hidden="true">{state === "connecting" ? <span className="mt5-small-spinner" /> : <ShieldAlert size={16} />}</span>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <h3 id="mt5-dialog-title">{state === "connecting" ? `Connecting to ${brokerName}...` : "Live verification unavailable"}</h3>
            <p className="mt5-dialog-server">{server.trim()}</p>
            <p id="mt5-dialog-description">{state === "connecting" ? "Your account has not been verified. Live verification is currently unavailable." : "Your account has not been connected. Live MT5 verification is not available yet. Your saved account and trading settings are unchanged."}</p>
          </div>
          {state === "connecting" ? <><div className="mt5-progress-track"><span /></div><span className="mt5-progress-caption">ACCOUNT NOT VERIFIED</span></> : <button className="mt5-modal-return" type="button" onClick={closePreview}><RotateCcw size={16} /> Back to account details</button>}
        </div>
      </div>}
    </section>
  );
}
