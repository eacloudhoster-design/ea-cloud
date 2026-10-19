import { CheckCircle, Loader2, X, ShieldAlert, Eye, EyeOff, Wifi, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { eaLogo } from "@/lib/branding";

type ConnectState = "idle" | "connecting" | "connected" | "error";

interface ConnectResult {
  login: string;
  server: string;
  balance: string | null;
  connectedAt: string | null;
}

const BASE = "/api";

function formatBalance(bal: string | null): string {
  if (bal === null || bal === "") return "—";
  const n = Number(bal);
  if (isNaN(n)) return bal;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

export default function MetaTraderTab() {
  const { accentColor, mtConnected, setMtConnected, clientToken } = useApp();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connectState, setConnectState] = useState<ConnectState>(mtConnected ? "connected" : "idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<ConnectResult | null>(null);

  // Restore saved MT5 connection from the client's profile
  useEffect(() => {
    if (!clientToken || connectState === "connected") return;
    fetch(`${BASE}/app/trading-controls`, { headers: { Authorization: `Bearer ${clientToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.mt5Connected && data.mt5Login && data.mt5Server) {
          setLogin(data.mt5Login);
          setServer(data.mt5Server);
          setResult({
            login: data.mt5Login,
            server: data.mt5Server,
            balance: null,
            connectedAt: data.updatedAt ?? null,
          });
          setConnectState("connected");
          setMtConnected(true);
        }
      })
      .catch(() => {});
  }, [clientToken]);

  const handleDisconnect = async () => {
    if (clientToken) {
      await fetch(`${BASE}/app/mt5-disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${clientToken}` },
      }).catch(() => {});
    }
    setConnectState("idle");
    setMtConnected(false);
    setResult(null);
    setLogin("");
    setPassword("");
    setServer("");
    setErrorMsg("");
  };

  const handleConnect = async () => {
    setErrorMsg("");

    if (!login.trim() || !password.trim() || !server.trim()) {
      setConnectState("error");
      setErrorMsg("All fields are required.");
      return;
    }
    if (isNaN(Number(login)) || Number(login) <= 0) {
      setConnectState("error");
      setErrorMsg("Login must be a valid MT5 account number.");
      return;
    }
    if (!clientToken) {
      setConnectState("error");
      setErrorMsg("You must be signed in to connect an MT5 account.");
      return;
    }

    setConnectState("connecting");
    try {
      const res = await fetch(`${BASE}/app/mt5-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}` },
        body: JSON.stringify({ login: login.trim(), password, server: server.trim() }),
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (!res.ok) {
        setConnectState("error");
        setErrorMsg((data.error as string) || (data.message as string) || "Connection failed");
        return;
      }

      setResult({
        login: (data.login as string) ?? login.trim(),
        server: (data.server as string) ?? server.trim(),
        balance: data.balance != null ? String(data.balance) : null,
        connectedAt: (data.connectedAt as string) ?? new Date().toISOString(),
      });
      setPassword("");
      setConnectState("connected");
      setMtConnected(true);
    } catch {
      setConnectState("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  const isReady = login.trim() && password.trim() && server.trim();
  const connecting = connectState === "connecting";

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ paddingBottom: 75, background: "#060606" }}>
      {/* Red border glow frame */}
      <div className="absolute inset-2 rounded-3xl pointer-events-none" style={{ border: `1.5px solid ${accentColor}99`, boxShadow: `0 0 30px ${accentColor}55, inset 0 0 30px ${accentColor}11` }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 30% at 50% 0%, ${accentColor}44 0%, transparent 60%), radial-gradient(ellipse 80% 20% at 50% 100%, ${accentColor}22 0%, transparent 60%)` }} />

      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 relative z-10">
        <div className="w-8 h-1.5 rounded-full bg-white/20" />
      </div>

      {/* MT5 icon */}
      <div className="flex justify-center relative z-10 mt-2">
        <div className="w-14 h-14 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 56 56" width="56" height="56">
              <circle cx="18" cy="22" r="9" fill="#4ade80" />
              <circle cx="34" cy="22" r="9" fill="#3b82f6" />
              <circle cx="26" cy="35" r="9" fill="#facc15" />
              <text x="26" y="40" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">5</text>
            </svg>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="text-center relative z-10 mt-2 px-5">
        <h2 className="font-black text-xl tracking-widest" style={{ color: accentColor }}>MT5 CONNECTIONS</h2>
        <p className="text-white/40 text-xs mt-1">Connect your MetaTrader 5 account and view live balance</p>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-5 mt-4 space-y-4 pb-2">
        {/* Error banner */}
        {connectState === "error" && (
          <div className="p-4 rounded-2xl flex items-center gap-3" style={{ background: "rgba(60,10,10,0.7)", border: "1px solid rgba(239,68,68,0.4)" }}>
            <ShieldAlert size={22} className="text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-400 font-bold text-sm">Connection Failed</p>
              <p className="text-white/50 text-xs mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={() => setConnectState("idle")} className="text-white/40"><X size={16} /></button>
          </div>
        )}

        {connectState === "connected" && result ? (
          /* ── Connected detail card ──────────────────────────────────────── */
          <div className="rounded-2xl p-5" style={{ background: "rgba(20,60,20,0.4)", border: "1px solid rgba(34,197,94,0.4)" }}>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={20} className="text-green-400" />
              <span className="font-bold text-green-400 text-sm tracking-wide uppercase">Connected</span>
              <span className="ml-auto relative flex w-2.5 h-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-green-500" />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Account Number" value={`#${result.login}`} mono />
              <Stat label="Current Balance" value={formatBalance(result.balance)} mono accent="#4ade80" />
              <div className="col-span-2">
                <Stat label="Server" value={result.server} mono />
              </div>
              <Stat label="Status" value="Connected" accent="#4ade80" />
              <Stat label="Last Connected" value={formatTime(result.connectedAt)} icon={<Clock size={11} className="text-white/35" />} />
            </div>

            <button
              onClick={handleDisconnect}
              className="w-full mt-5 py-3 rounded-full font-bold text-white text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <X size={16} /> Disconnect
            </button>
          </div>
        ) : (
          /* ── Connect form ───────────────────────────────────────────────── */
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(18,18,24,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <Wifi size={15} style={{ color: accentColor }} />
              <span className="text-sm font-semibold text-white">Connect MT5 Account</span>
            </div>

            {/* Login */}
            <FormField label="Login (Account Number)">
              <input
                type="number"
                inputMode="numeric"
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ background: "rgba(18,18,24,0.9)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </FormField>

            {/* Password with show/hide */}
            <FormField label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="MT5 account password"
                  autoComplete="off"
                  className="w-full rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder:text-white/30"
                  style={{ background: "rgba(18,18,24,0.9)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 active:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </FormField>

            {/* Server */}
            <FormField label="Server">
              <input
                type="text"
                value={server}
                onChange={e => setServer(e.target.value)}
                placeholder="e.g. Exness-MT5Real"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 font-mono"
                style={{ background: "rgba(18,18,24,0.9)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </FormField>

            <button
              onClick={handleConnect}
              disabled={connecting || !isReady}
              className="w-full py-4 rounded-full font-bold text-white text-base tracking-wide mt-1 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}bb 100%)`,
                boxShadow: `0 4px 20px ${accentColor}66`,
              }}
            >
              {connecting ? <><Loader2 size={18} className="animate-spin" /> Connecting…</> : <><Wifi size={18} /> Connect MT5</>}
            </button>
          </div>
        )}
      </div>

      {/* Floating bot avatar */}
      <div className="absolute z-20" style={{ bottom: 88, right: 14 }}>
        <div className="relative">
          <div className="w-[42px] h-[42px] rounded-full overflow-hidden" style={{ border: `2px solid ${accentColor}cc`, boxShadow: `0 0 12px ${accentColor}66` }}>
            <img src={eaLogo} alt="Bot" className="w-full h-full object-cover" />
          </div>
          <div className="absolute top-0 right-0 w-3 h-3 rounded-full" style={{ background: connectState === "connected" ? "#4ade80" : accentColor, border: "1.5px solid #000" }} />
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-white/50 text-xs font-medium block uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, mono, accent, icon }: { label: string; value: string; mono?: boolean; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{label}</div>
      <div className={`flex items-center gap-1 font-bold text-sm ${mono ? "font-mono" : ""}`} style={{ color: accent ?? "#fff" }}>
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
