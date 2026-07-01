import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { useGetSuperAdminMentors } from "@workspace/api-client-react";
import { KeyRound, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SuperAdminLicenses() {
  usePortalRedirect();
  const { data: mentors, isLoading } = useGetSuperAdminMentors();

  const sorted = [...(mentors || [])].sort((a, b) => (b.totalLicenses ?? 0) - (a.totalLicenses ?? 0)).slice(0, 10);

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-purple-400 tracking-wide">License Control</h1>
        <p className="text-white/40 text-sm mt-1">Monitor license allocation across all mentors</p>
      </motion.div>

      {sorted.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/8 bg-white/3 p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-white">License Usage by Mentor</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sorted.map(m => ({ name: m.mentorName || m.email.split("@")[0], licenses: m.totalLicenses, limit: m.licenseLimit }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10 }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0e0e18", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Bar dataKey="licenses" fill="#a855f7" radius={[4, 4, 0, 0]} name="Used" />
              <Bar dataKey="limit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Limit" opacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white text-sm">Mentor License Allocation</h3>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-white/5 rounded animate-pulse" />)}</div>
        ) : (mentors || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-white/20">
            <KeyRound className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No mentors registered yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {(mentors || []).map((mentor, i) => {
              const pct = mentor.licenseLimit > 0 ? Math.round(((mentor.totalLicenses ?? 0) / mentor.licenseLimit) * 100) : 0;
              return (
                <motion.div key={mentor.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-white">{mentor.mentorName || mentor.email}</span>
                      <span className="ml-2 text-xs text-white/30">{mentor.email}</span>
                    </div>
                    <div className="text-xs text-white/50">
                      <span className="text-white font-medium">{mentor.totalLicenses}</span> / {mentor.licenseLimit}
                      <span className="ml-2 text-[10px] text-white/30">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1, delay: 0.3 + i * 0.05, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#a855f7" }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
