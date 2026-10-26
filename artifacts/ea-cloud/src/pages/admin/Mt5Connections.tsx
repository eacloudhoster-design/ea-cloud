import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import {
  Wifi, WifiOff, Loader2, CheckCircle2, XCircle,
  RefreshCw, Eye, EyeOff, PlugZap, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectResult {
  status: "connected" | "failed";
  mt5Login: number;
  server: string;
  balance?: string | number | null;
  connectedAt?: string;
  [key: string]: unknown;
}

interface SavedConnection {
  id: number;
  mt5Login: number;
  mt5Server: string;
  balance: string | null;
  status: string;
  connectedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBalance(bal: string | number | null | undefined): string {
  if (bal === null || bal === undefined || bal === "") return "—";
  const n = Number(bal);
  if (isNaN(n)) return String(bal);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Mt5Connections() {
  usePortalRedirect();

  // Form state
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Result state
  const [result, setResult] = useState<ConnectResult | null>(null);

  // History
  const [history, setHistory] = useState<SavedConnection[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const token = "cookie-portal";
      const res = await fetch("/api/admin/mt5/connections", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setHistory(await res.json());
    } catch {
      // non-fatal
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setResult(null);

    if (!login.trim() || !password.trim() || !server.trim()) {
      setFormError("All fields are required.");
      return;
    }
    if (isNaN(Number(login)) || Number(login) <= 0) {
      setFormError("Login must be a valid MT5 account number.");
      return;
    }

    setSubmitting(true);
    try {
      const token = "cookie-portal";
      const res = await fetch("/api/admin/mt5/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ login: Number(login), password, server: server.trim() }),
      });

      const data: ConnectResult = await res.json();
      setResult(data);

      if (data.status === "connected") {
        // Refresh history to show the new entry
        fetchHistory();
      }
    } catch (err: unknown) {
      setFormError((err as Error).message ?? "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">MT5 Connections</h1>
        <p className="text-white/40 text-sm mt-1">
          Connect your MetaTrader 5 account and view live balance
        </p>
      </motion.div>

      <div className="max-w-lg">
        {/* ── Connection Form ───────────────────────────────────────────────── */}
        <motion.form
          onSubmit={handleConnect}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <PlugZap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">Connect MT5 Account</span>
          </div>

          <div className="space-y-4">
            {/* Login */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Login (Account Number)
              </label>
              <input
                type="number"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/40 focus:bg-white/6 transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="MT5 account password"
                  autoComplete="off"
                  className="w-full bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/40 focus:bg-white/6 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Server */}
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Server
              </label>
              <input
                type="text"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="e.g. Exness-MT5Real"
                className="w-full bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/40 focus:bg-white/6 transition-all duration-200"
              />
            </div>
          </div>

          {/* Form error */}
          <AnimatePresence>
            {formError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-red-400 text-xs mt-3"
              >
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {formError}
              </motion.p>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full mt-5 h-11 bg-gradient-to-r from-[#1a6bff] to-primary hover:opacity-90 disabled:opacity-50 text-white font-bold text-sm tracking-wider shadow-[0_0_24px_rgba(227,30,36,0.25)] transition-all duration-300 gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Connecting…</>
            ) : (
              <><Wifi className="w-4 h-4" />Connect MT5</>
            )}
          </Button>
        </motion.form>

        {/* ── Live Result Card ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className={`rounded-2xl border p-5 mb-6 ${
                result.status === "connected"
                  ? "border-emerald-500/30 bg-emerald-500/8"
                  : "border-red-500/25 bg-red-500/8"
              }`}
            >
              {result.status === "connected" ? (
                <>
                  {/* Connected header */}
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="font-bold text-emerald-400 text-sm tracking-wide uppercase">
                      Connected
                    </span>
                    <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500">
                      <span className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-60" />
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/4 border border-white/6 p-3">
                      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Login</div>
                      <div className="font-mono font-bold text-white text-base">
                        #{result.mt5Login}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/4 border border-white/6 p-3">
                      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Balance</div>
                      <div className="font-mono font-bold text-emerald-400 text-base">
                        {formatBalance(result.balance)}
                      </div>
                    </div>
                    <div className="col-span-2 rounded-xl bg-white/4 border border-white/6 p-3">
                      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Server</div>
                      <div className="font-mono text-white/80 text-sm truncate">{result.server}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-400 text-sm mb-0.5">Connection Failed</p>
                    <p className="text-xs text-white/40">
                      {(result.error as string) ?? "The MT5 backend could not verify your credentials. Check your login, password, and server name."}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Connection History ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/70">Connection History</h2>
            <button
              onClick={fetchHistory}
              className="p-1.5 rounded-lg border border-white/8 text-white/30 hover:text-white hover:border-white/20 transition-all duration-200"
              title="Refresh history"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-white/8 bg-white/2 text-center">
              <WifiOff className="w-7 h-7 text-white/12 mb-2" />
              <p className="text-xs text-white/30">No connections yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((conn, i) => (
                <motion.div
                  key={conn.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/6 bg-white/2 hover:bg-white/4 transition-all duration-200"
                >
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    conn.status === "connected" ? "bg-emerald-500" : "bg-red-500/60"
                  }`} />

                  {/* Login + server */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-white font-semibold">#{conn.mt5Login}</span>
                      <span className={`text-[10px] px-1.5 py-px rounded border font-semibold ${
                        conn.status === "connected"
                          ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
                          : "text-red-400/70 border-red-500/20 bg-red-500/8"
                      }`}>
                        {conn.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/30 truncate mt-0.5">{conn.mt5Server}</p>
                  </div>

                  {/* Balance */}
                  {conn.balance && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-mono text-emerald-400/80">{formatBalance(conn.balance)}</div>
                    </div>
                  )}

                  {/* Time */}
                  <div className="flex items-center gap-1 text-[10px] text-white/25 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {timeAgo(conn.connectedAt)}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
