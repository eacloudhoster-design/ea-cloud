import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useClientAuth, appFetch } from "@/contexts/ClientAuthContext";
import {
  TrendingUp, Play, Info, Bot, ChevronRight, LogOut, Plus, RefreshCw,
  Wifi, WifiOff, BarChart2, Shield, Clock, Cable, Eye, EyeOff,
  CheckCircle2, XCircle, Loader2, Server, Hash,
} from "lucide-react";
import { logo } from "@/lib/branding";

interface Ea {
  id: number;
  name: string;
  description: string | null;
  symbol: string;
  lotSize: string;
  riskLevel: string;
  isActive: boolean;
}

interface Mentor {
  id: number;
  mentorName: string | null;
  robotName: string | null;
  robotTagline: string | null;
  backgroundImageUrl: string | null;
}

interface DashboardData {
  client: ReturnType<typeof useClientAuth>["client"];
  mentor: Mentor | null;
  eas: Ea[];
}

interface Mt5Connection {
  id: number;
  mt5Login: number;
  mt5Server: string;
  balance: string | null;
  status: string;
  connectedAt: string;
}

const RISK_COLORS = { low: "#22c55e", medium: "#eab308", high: "#ef4444" };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── MT5 Tab ─────────────────────────────────────────────────────────────────
function Mt5Tab() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    balance?: string | null;
    mt5Login?: number;
    server?: string;
  } | null>(null);
  const [connections, setConnections] = useState<Mt5Connection[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchConnections = async () => {
    try {
      const data = await appFetch("/client/mt5/connections") as Mt5Connection[];
      setConnections(data);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { fetchConnections(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const loginNum = Number(login);
    try {
      // appFetch throws on non-2xx, so any non-connected response lands in catch
      const data = await appFetch("/client/mt5/connect", {
        method: "POST",
        body: JSON.stringify({ login: loginNum, password, server }),
      }) as { status: string; mt5Login: number; server: string; balance?: string | null };

      setResult({
        ok: true,
        message: "MT5 account connected successfully.",
        balance: data.balance,
        mt5Login: data.mt5Login ?? loginNum,
        server: data.server ?? server,
      });
      setLogin(""); setPassword(""); setServer("");
      fetchConnections();
    } catch (err: any) {
      // appFetch throws { status, data } — extract the real MT5 error message
      const d = err?.data ?? {};
      const reason: string =
        d.error ?? d.message ?? d.detail ?? d.msg ??
        err?.message ??
        "Connection failed. Check your credentials and try again.";
      setResult({ ok: false, message: reason, mt5Login: loginNum, server });
      fetchConnections(); // still refresh history — backend saves failed attempts too
    } finally {
      setSubmitting(false);
    }
  };

  const connected = connections.filter(c => c.status === "connected");

  return (
    <div className="space-y-5">

      {/* ── Active accounts ── */}
      {connected.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-2">Active Accounts</h3>
          <div className="space-y-2">
            {connected.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-green-500/20 bg-green-500/5"
              >
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-green-500/15 border border-green-500/25 flex-shrink-0">
                  <Cable className="w-4.5 h-4.5 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"
                    />
                    <span className="text-white font-bold text-sm">{c.mt5Login}</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/35 text-[10px]">
                    <Server className="w-3 h-3" />
                    <span className="truncate">{c.mt5Server}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {c.balance && (
                    <div className="text-green-400 font-bold text-sm">{c.balance}</div>
                  )}
                  <div className="text-white/25 text-[10px] mt-0.5">{timeAgo(c.connectedAt)}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Connect form ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-white/8 bg-white/3 p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-[#1a6bff]/15 border border-[#1a6bff]/25 flex items-center justify-center">
            <Cable className="w-4 h-4 text-[#1a6bff]" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Connect MT5 Account</p>
            <p className="text-white/35 text-[10px]">Link your MetaTrader 5 account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Login */}
          <div>
            <label className="text-white/40 text-[10px] font-semibold tracking-wider uppercase mb-1.5 block">
              MT5 Login (Account Number)
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="number"
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="12345678"
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#1a6bff]/50 focus:bg-white/7 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-white/40 text-[10px] font-semibold tracking-wider uppercase mb-1.5 block">
              MT5 Password
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#1a6bff]/50 focus:bg-white/7 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Server */}
          <div>
            <label className="text-white/40 text-[10px] font-semibold tracking-wider uppercase mb-1.5 block">
              Broker Server
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                value={server}
                onChange={e => setServer(e.target.value)}
                placeholder="Broker-Live, ICMarkets-Live01…"
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#1a6bff]/50 focus:bg-white/7 transition-all"
              />
            </div>
          </div>

          {/* Result banner */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-3.5 rounded-xl border ${
                  result.ok
                    ? "bg-green-500/8 border-green-500/20"
                    : "bg-red-500/8 border-red-500/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {result.ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  <span className={`text-xs font-bold ${result.ok ? "text-green-400" : "text-red-400"}`}>
                    {result.ok ? "Connected" : "Connection Failed"}
                  </span>
                </div>
                <div className="space-y-1 text-[11px]">
                  {result.mt5Login && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Login</span>
                      <span className="text-white/80 font-mono font-semibold">{result.mt5Login}</span>
                    </div>
                  )}
                  {result.server && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Server</span>
                      <span className="text-white/80 font-semibold truncate ml-2 text-right">{result.server}</span>
                    </div>
                  )}
                  {result.ok && result.balance && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Balance</span>
                      <span className="text-green-400 font-bold">{result.balance}</span>
                    </div>
                  )}
                  {!result.ok && (
                    <p className="text-red-400/80 mt-1 leading-snug">{result.message}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.98 }}
            className="w-full h-11 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-60 bg-[#1a6bff] text-white shadow-[0_0_20px_rgba(26,107,255,0.3)] hover:shadow-[0_0_30px_rgba(26,107,255,0.45)]"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>
              : <><Cable className="w-4 h-4" /> Connect Account</>}
          </motion.button>
        </form>
      </motion.div>

      {/* ── History ── */}
      {!loadingHistory && connections.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white/50 text-[10px] font-bold tracking-widest uppercase">All Attempts</h3>
            <button onClick={fetchConnections} className="text-white/25 hover:text-white/50 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1.5">
            {connections.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border ${
                  c.status === "connected"
                    ? "border-green-500/15 bg-green-500/4"
                    : "border-red-500/15 bg-red-500/4"
                }`}
              >
                {c.status === "connected"
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-white/80 text-xs font-semibold">{c.mt5Login}</span>
                  <span className="text-white/25 text-[10px] ml-1.5">· {c.mt5Server}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  {c.balance && <span className="text-white/50 text-[10px]">{c.balance}</span>}
                  <span className="text-white/20 text-[10px] ml-1.5">{timeAgo(c.connectedAt)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {!loadingHistory && connections.length === 0 && (
        <div className="p-6 rounded-2xl border border-dashed border-white/8 text-center">
          <Cable className="w-7 h-7 text-white/15 mx-auto mb-2" />
          <p className="text-white/25 text-xs">No MT5 accounts connected yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
type Tab = "bots" | "mt5";

export default function AppDashboard() {
  const { client, logout } = useClientAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEa, setActiveEa] = useState<Ea | null>(null);
  const [trading, setTrading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tab, setTab] = useState<Tab>("bots");

  useEffect(() => {
    if (!client) { setLocation("/app"); return; }
    if (client.status === "pending") { setLocation("/app/pending"); return; }
    if (!client.licenseKey) { setLocation("/app/activate"); return; }
    fetchDashboard();
  }, [client]);

  const fetchDashboard = async () => {
    try {
      const d = await appFetch("/app/dashboard") as DashboardData;
      setData(d);
      if (d.eas.length > 0) setActiveEa(d.eas[0]);
      // Load persisted copy-trading state so START/STOP + badge reflect the DB.
      try {
        const tc = await appFetch("/app/trading-controls");
        if (tc && typeof tc.copyingEnabled === "boolean") setTrading(tc.copyingEnabled);
      } catch {}
    } catch {} finally { setLoading(false); }
  };

  // START/STOP — persist immediately; revert the UI on failure.
  const toggleTrading = async () => {
    const next = !trading;
    setTrading(next);
    try {
      await appFetch("/app/trading-controls", { method: "PATCH", body: JSON.stringify({ copyingEnabled: next }) });
    } catch { setTrading(!next); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading your dashboard…</p>
      </div>
    </div>
  );

  const mentor = data?.mentor;
  const eas = data?.eas ?? [];
  const heroImage = mentor?.backgroundImageUrl || "/default-robot.jpg";
  const robotName = mentor?.robotName || activeEa?.name || "EA CLOUD BOT";
  const mentorName = mentor?.mentorName || "EA Cloud";
  const tagline = mentor?.robotTagline || "AI Trading Engine · Online";

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col max-w-md mx-auto relative">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-primary/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-[#1a6bff]/6 rounded-full blur-[80px]" />
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 relative z-10">
        <div className="flex items-center gap-2">
          <img src={logo} alt="EA Cloud" className="w-8 h-8 rounded-full object-cover ring-1 ring-primary/40" />
          <span className="text-white/60 text-xs font-medium">EA CLOUD</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
            <Wifi className="w-3 h-3 text-green-400" />
            <span className="text-green-400 text-[10px] font-medium">LIVE</span>
          </div>
          <button onClick={logout} className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="px-4 pb-3 relative z-10">
        <div className="flex p-1 rounded-2xl bg-white/4 border border-white/8">
          {([
            { key: "bots", label: "Robots", icon: Bot },
            { key: "mt5",  label: "MT5 Connect", icon: Cable },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold tracking-wide transition-all ${
                tab === key
                  ? key === "mt5"
                    ? "bg-[#1a6bff]/20 text-[#1a6bff] border border-[#1a6bff]/30 shadow-[0_0_15px_rgba(26,107,255,0.2)]"
                    : "bg-primary/15 text-primary border border-primary/25 shadow-[0_0_15px_rgba(227,30,36,0.15)]"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 relative z-10">

        <AnimatePresence mode="wait">
          {tab === "bots" ? (
            <motion.div
              key="bots"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* ─── HERO CARD ─── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-3xl overflow-hidden border border-primary/25 shadow-[0_0_40px_rgba(227,30,36,0.2),inset_0_0_40px_rgba(227,30,36,0.03)]"
                style={{ aspectRatio: "4/3" }}
              >
                <img src={heroImage} alt={robotName} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-transparent h-1/3" />
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                <div className="absolute top-0 left-0 h-full w-0.5 bg-gradient-to-b from-primary/60 via-primary/20 to-transparent" />
                <div className="absolute top-0 right-0 h-full w-0.5 bg-gradient-to-b from-primary/60 via-primary/20 to-transparent" />
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
                  <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full" style={{ background: trading ? "#22c55e" : "#f59e0b" }} />
                  <span className="text-[10px] font-bold tracking-wider" style={{ color: trading ? "#22c55e" : "#f59e0b" }}>{trading ? "ACTIVE" : "PAUSED"}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-3xl font-black text-white leading-tight tracking-tight drop-shadow-lg mb-1"
                    style={{ textShadow: "0 0 30px rgba(227,30,36,0.5), 0 2px 10px rgba(0,0,0,0.8)" }}
                  >
                    {robotName}
                  </motion.h1>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="text-white/60 text-sm">{mentorName}</motion.p>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                    className="text-white/35 text-xs mt-0.5">{tagline}</motion.p>
                </div>
              </motion.div>

              {/* ─── ACTION PILL ─── */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex items-center justify-around p-1.5 rounded-2xl bg-white/4 border border-white/8 backdrop-blur-sm"
              >
                {[
                  { icon: BarChart2, label: "PAIRS", action: () => setShowInfo(false) },
                  { icon: trading ? WifiOff : Play, label: trading ? "STOP" : "START", primary: true, action: toggleTrading },
                  { icon: Info, label: "INFO", action: () => setShowInfo(s => !s) },
                ].map(({ icon: Icon, label, primary, action }) => (
                  <motion.button
                    key={label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={action}
                    className={`flex flex-col items-center gap-1.5 px-6 py-3 rounded-xl transition-all ${
                      primary
                        ? trading
                          ? "bg-red-500/20 border border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                          : "bg-primary/20 border border-primary/40 shadow-[0_0_20px_rgba(227,30,36,0.25)]"
                        : "hover:bg-white/6"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                      primary
                        ? trading ? "border-red-500/60 bg-red-500/20" : "border-primary/60 bg-primary/20"
                        : "border-white/15 bg-white/5"
                    }`}>
                      <Icon className={`w-4 h-4 ${primary ? trading ? "text-red-400" : "text-primary" : "text-white/50"}`} />
                    </div>
                    <span className={`text-[10px] font-bold tracking-widest ${primary ? trading ? "text-red-400" : "text-primary" : "text-white/40"}`}>{label}</span>
                  </motion.button>
                ))}
              </motion.div>

              {/* Info panel */}
              <AnimatePresence>
                {showInfo && activeEa && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden"
                  >
                    <div className="p-4 space-y-2 text-sm">
                      {[
                        { label: "Symbol", value: activeEa.symbol, icon: TrendingUp },
                        { label: "Lot Size", value: activeEa.lotSize, icon: BarChart2 },
                        { label: "Risk Level", value: activeEa.riskLevel.toUpperCase(), icon: Shield, color: RISK_COLORS[activeEa.riskLevel as keyof typeof RISK_COLORS] },
                        { label: "Status", value: activeEa.isActive ? "Active" : "Inactive", icon: Clock, color: activeEa.isActive ? "#22c55e" : "#6b7280" },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-white/4 last:border-0">
                          <div className="flex items-center gap-2 text-white/40">
                            <item.icon className="w-3.5 h-3.5" />
                            {item.label}
                          </div>
                          <span className="font-semibold" style={{ color: item.color || "white" }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Powered by */}
              <div className="text-center">
                <span className="text-white/20 text-xs">Powered by <span className="text-primary/60 font-semibold">EA Cloud</span></span>
              </div>

              {/* ─── ROBOT LIST ─── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold text-sm tracking-wide">Robot List</h3>
                  <button onClick={fetchDashboard} className="text-white/30 hover:text-white/60 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {eas.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-white/6 bg-white/2 text-center">
                    <Bot className="w-8 h-8 text-white/15 mx-auto mb-2" />
                    <p className="text-white/30 text-xs">No robots connected yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {eas.map((ea, i) => {
                      const isActive = activeEa?.id === ea.id;
                      return (
                        <motion.button
                          key={ea.id}
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07 }}
                          onClick={() => { setActiveEa(ea); setShowInfo(false); }}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left ${
                            isActive
                              ? "border-primary/40 bg-primary/8 shadow-[0_0_20px_rgba(227,30,36,0.12)]"
                              : "border-white/6 bg-white/2 hover:border-white/12 hover:bg-white/4"
                          }`}
                        >
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                            isActive ? "bg-primary/20 border-primary/40" : "bg-white/5 border-white/8"
                          }`}>
                            <Bot className={`w-5 h-5 ${isActive ? "text-primary" : "text-white/30"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-bold text-sm ${isActive ? "text-white" : "text-white/70"}`}>{ea.name}</div>
                            <div className="text-xs text-white/30 mt-0.5">{ea.symbol} · Lot {ea.lotSize}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <ChevronRight className={`w-4 h-4 ${isActive ? "text-primary" : "text-white/20"}`} />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Connect new robot CTA */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setTab("mt5")}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-white/10 text-white/30 hover:border-[#1a6bff]/30 hover:text-[#1a6bff]/60 hover:bg-[#1a6bff]/5 transition-all text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                CONNECT MT5 ACCOUNT
              </motion.button>

              {/* Footer */}
              <div className="pt-2 pb-4 text-center space-y-1">
                <p className="text-white/15 text-xs">{client?.firstName} {client?.lastName} · {client?.plan} plan</p>
                <p className="text-white/10 text-[10px] font-mono">{client?.licenseKey}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="mt5"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.18 }}
            >
              <Mt5Tab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
