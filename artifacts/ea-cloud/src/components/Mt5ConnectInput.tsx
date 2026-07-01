import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, Clock, Wifi, WifiOff,
  RefreshCw, ServerCrash, ShieldCheck, Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountStatus = "pending" | "challenge_issued" | "verified" | "expired";

interface Mt5Account {
  id: number;
  mt5Login: string;
  mt5Server: string;
  accountType: string;
  mt5Name: string | null;
  mt5Currency: string | null;
  mt5Balance: string | null;
  mt5Leverage: string | null;
  verificationStatus: AccountStatus;
  challengeVerified: boolean;
  isActive: string;
  lastHeartbeatAt: string | null;
  expiresAt: string | null;
  minutesSinceHeartbeat: number | null;
  isLive: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<AccountStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  verified:         { label: "Verified",         color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: ShieldCheck },
  challenge_issued: { label: "Challenge Issued",  color: "text-blue-400 border-blue-500/30 bg-blue-500/10",       icon: Clock },
  expired:          { label: "Expired",           color: "text-amber-400 border-amber-500/30 bg-amber-500/10",    icon: XCircle },
  pending:          { label: "Pending",           color: "text-white/40 border-white/10 bg-white/5",              icon: Clock },
};

function heartbeatLabel(mins: number | null): string {
  if (mins === null) return "No heartbeat";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatBalance(balance: string | null, currency: string | null) {
  if (!balance) return null;
  const n = parseFloat(balance);
  if (isNaN(n)) return null;
  return `${currency ?? "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Mt5ConnectInput() {
  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccounts = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/mt5/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Mt5Account[] = await res.json();
      setAccounts(data);
      setError("");
    } catch (err: unknown) {
      setError((err as Error).message ?? "Failed to load accounts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + 30-second poll
  useEffect(() => {
    fetchAccounts();
    const id = setInterval(() => fetchAccounts(), 30_000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  return (
    <div className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">MT5 Connected Accounts</h2>
          <p className="text-xs text-white/30 mt-0.5">
            Accounts verified via the EA challenge-response handshake
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => fetchAccounts(true)}
          disabled={refreshing}
          className="p-2 rounded-lg border border-white/8 bg-white/3 text-white/40 hover:text-white hover:border-white/20 transition-all duration-200 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </motion.button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-white/20 animate-spin" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-red-500/20 bg-red-500/8 text-red-400 text-sm">
          <ServerCrash className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && accounts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-white/10 bg-white/2 text-center"
        >
          <WifiOff className="w-8 h-8 text-white/15 mb-3" />
          <p className="text-sm text-white/40 font-medium">No accounts connected yet</p>
          <p className="text-xs text-white/20 mt-1 max-w-xs">
            Download and run the EA on your MT5 terminal — it will connect automatically on startup.
          </p>
        </motion.div>
      )}

      {/* Account cards */}
      <AnimatePresence>
        {!loading && accounts.length > 0 && (
          <div className="space-y-3">
            {accounts.map((acc, i) => {
              const status = STATUS_META[acc.verificationStatus] ?? STATUS_META.pending;
              const StatusIcon = status.icon;
              const bal = formatBalance(acc.mt5Balance, acc.mt5Currency);

              return (
                <motion.div
                  key={acc.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative p-4 rounded-xl border border-white/6 bg-white/2 hover:border-white/12 hover:bg-white/4 transition-all duration-200 overflow-hidden"
                >
                  {/* Live pulse bar along the top edge */}
                  {acc.isLive && (
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
                  )}

                  <div className="flex items-start gap-3">
                    {/* Connection indicator */}
                    <div className="relative flex-shrink-0 mt-0.5">
                      {acc.isLive ? (
                        <>
                          <Wifi className="w-4 h-4 text-emerald-400" />
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500">
                            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                          </span>
                        </>
                      ) : (
                        <WifiOff className="w-4 h-4 text-white/20" />
                      )}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {/* Account login */}
                        <span className="font-mono text-sm font-bold text-white">
                          #{acc.mt5Login}
                        </span>

                        {/* Account type badge */}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                          acc.accountType === "live"
                            ? "text-[#e31e24] border-[#e31e24]/30 bg-[#e31e24]/10"
                            : acc.accountType === "demo"
                            ? "text-[#1a6bff] border-[#1a6bff]/30 bg-[#1a6bff]/10"
                            : "text-white/30 border-white/10 bg-white/5"
                        }`}>
                          {acc.accountType}
                        </span>

                        {/* Verification status badge */}
                        <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${status.color}`}>
                          <StatusIcon className="w-2.5 h-2.5" />
                          {status.label}
                        </span>
                      </div>

                      {/* Server */}
                      <p className="text-xs text-white/40 truncate">{acc.mt5Server}</p>

                      {/* Name + balance row */}
                      {(acc.mt5Name || bal) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                          {acc.mt5Name && (
                            <span className="text-xs text-white/30">{acc.mt5Name}</span>
                          )}
                          {bal && (
                            <span className="text-xs text-emerald-400/80 font-mono">{bal}</span>
                          )}
                          {acc.mt5Leverage && (
                            <span className="text-xs text-white/25">1:{acc.mt5Leverage}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Heartbeat info */}
                    <div className="flex-shrink-0 text-right">
                      <div className={`flex items-center gap-1 justify-end text-[10px] ${
                        acc.isLive ? "text-emerald-400" : "text-white/25"
                      }`}>
                        <Activity className="w-3 h-3" />
                        {heartbeatLabel(acc.minutesSinceHeartbeat)}
                      </div>
                      {acc.expiresAt && acc.verificationStatus === "verified" && (
                        <div className="text-[10px] text-white/20 mt-0.5">
                          exp {new Date(acc.expiresAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Challenge-issued hint */}
                  {acc.verificationStatus === "challenge_issued" && (
                    <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-blue-400/70 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      Challenge issued — waiting for EA to complete registration…
                    </div>
                  )}

                  {/* Expired hint */}
                  {acc.verificationStatus === "expired" && (
                    <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-amber-400/70 flex items-center gap-1.5">
                      <XCircle className="w-3 h-3 flex-shrink-0" />
                      No heartbeat for 7+ days. Restart the EA on your MT5 terminal to re-verify.
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Live legend */}
      {!loading && accounts.length > 0 && (
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-[10px] text-white/25">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Live — heartbeat ≤ 5 min
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/25">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400/50" />
            Challenge-verified
          </div>
          <div className="text-[10px] text-white/15 ml-auto">
            Refreshes every 30 s
          </div>
        </div>
      )}
    </div>
  );
}
