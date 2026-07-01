import { motion } from "framer-motion";
import { useGetSignalQueue, getGetSignalQueueQueryKey } from "@workspace/api-client-react";
import type { SignalQueueItem } from "@workspace/api-client-react";
import { Clock, Loader2, CheckCircle, XCircle, ListChecks } from "lucide-react";
import { usePortalRedirect } from "@/contexts/AuthContext";

const statusStyles: Record<string, { dot: string; text: string; bg: string }> = {
  pending: { dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/25" },
  executing: { dot: "bg-blue-400", text: "text-blue-300", bg: "bg-blue-500/10 border-blue-500/25" },
  success: { dot: "bg-green-400", text: "text-green-300", bg: "bg-green-500/10 border-green-500/25" },
  failed: { dot: "bg-red-400", text: "text-red-300", bg: "bg-red-500/10 border-red-500/25" },
};

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SuperAdminSignalQueue() {
  usePortalRedirect();
  // Poll so the queue view stays live as the worker processes signals.
  const { data, isLoading } = useGetSignalQueue({ query: { queryKey: getGetSignalQueueQueryKey(), refetchInterval: 4000 } });

  const counts = data?.counts ?? { pending: 0, executing: 0, success: 0, failed: 0 };
  const recent: SignalQueueItem[] = data?.recent ?? [];

  const cards = [
    { label: "Pending", value: counts.pending, icon: Clock, color: "text-amber-400", glow: "rgba(245,158,11,0.3)" },
    { label: "Executing", value: counts.executing, icon: Loader2, color: "text-blue-400", glow: "rgba(59,130,246,0.3)", spin: true },
    { label: "Success", value: counts.success, icon: CheckCircle, color: "text-green-400", glow: "rgba(34,197,94,0.3)" },
    { label: "Failed", value: counts.failed, icon: XCircle, color: "text-red-400", glow: "rgba(239,68,68,0.3)" },
  ];

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-3">
        <ListChecks className="w-6 h-6 text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-purple-400 tracking-wide">Signal Queue</h1>
          <p className="text-white/40 text-sm mt-1">Durable copy-trade execution queue · live</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="relative rounded-xl border border-white/6 bg-white/3 p-4 overflow-hidden"
          >
            <card.icon className={`w-5 h-5 mb-3 ${card.color} ${card.spin && card.value > 0 ? "animate-spin" : ""}`} />
            <div className="text-2xl font-black text-white mb-0.5">
              {isLoading ? <div className="w-10 h-7 bg-white/10 rounded animate-pulse" /> : card.value.toLocaleString()}
            </div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{card.label}</div>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <h3 className="font-semibold text-white">Recent Signals</h3>
          <span className="text-[11px] text-white/30">last {recent.length}</span>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-white/30 text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading queue…
          </div>
        ) : recent.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">No signals yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-white/30 border-b border-white/6">
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-5 py-3 font-medium">Mentor</th>
                  <th className="px-5 py-3 font-medium">Signal</th>
                  <th className="px-5 py-3 font-medium">Symbol</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Attempts</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => {
                  const st = statusStyles[s.status] ?? statusStyles.pending;
                  return (
                    <tr key={s.id} className="border-b border-white/4 hover:bg-white/2">
                      <td className="px-5 py-3 text-white/50 font-mono text-xs">#{s.id}</td>
                      <td className="px-5 py-3 text-white/60">{s.mentorId}</td>
                      <td className="px-5 py-3">
                        <span className="text-white/80">{s.signal}</span>
                        <span className="text-white/30 ml-1.5 text-xs">{s.orderType}</span>
                      </td>
                      <td className="px-5 py-3 text-white/70 font-medium">{s.symbol}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-white/50">{s.attempts}</td>
                      <td className="px-5 py-3 text-white/40 text-xs whitespace-nowrap">{fmt(s.createdAt)}</td>
                      <td className="px-5 py-3 text-white/40 text-xs max-w-[220px] truncate" title={s.lastError ?? undefined}>
                        {s.status === "failed" || s.status === "pending"
                          ? (s.lastError ?? "—")
                          : s.processedAt ? `done ${fmt(s.processedAt)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
