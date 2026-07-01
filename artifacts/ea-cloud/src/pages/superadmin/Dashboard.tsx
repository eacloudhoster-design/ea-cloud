import { motion } from "framer-motion";
import { useGetSuperAdminDashboard } from "@workspace/api-client-react";
import { Users, Clock, CheckCircle, XCircle, UserCheck, KeyRound, Smartphone, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { usePortalRedirect } from "@/contexts/AuthContext";

const mockBarData = [
  { name: "Jan", mentors: 2, clients: 8 },
  { name: "Feb", mentors: 3, clients: 12 },
  { name: "Mar", mentors: 5, clients: 20 },
  { name: "Apr", mentors: 4, clients: 18 },
  { name: "May", mentors: 7, clients: 30 },
  { name: "Jun", mentors: 9, clients: 42 },
];

export default function SuperAdminDashboard() {
  usePortalRedirect();
  const { data: stats, isLoading } = useGetSuperAdminDashboard();

  const statCards = [
    { label: "Total Mentors", value: stats?.totalMentors ?? 0, icon: Users, color: "blue", glow: "rgba(59,130,246,0.3)" },
    { label: "Pending Mentors", value: stats?.pendingMentors ?? 0, icon: Clock, color: "amber", glow: "rgba(245,158,11,0.3)" },
    { label: "Approved Mentors", value: stats?.approvedMentors ?? 0, icon: CheckCircle, color: "green", glow: "rgba(34,197,94,0.3)" },
    { label: "Rejected Mentors", value: stats?.rejectedMentors ?? 0, icon: XCircle, color: "red", glow: "rgba(239,68,68,0.3)" },
    { label: "Total Clients", value: stats?.totalClients ?? 0, icon: UserCheck, color: "purple", glow: "rgba(168,85,247,0.3)" },
    { label: "Total Licenses", value: stats?.totalLicenses ?? 0, icon: KeyRound, color: "blue", glow: "rgba(59,130,246,0.3)" },
    { label: "Active Licenses", value: stats?.activeLicenses ?? 0, icon: TrendingUp, color: "green", glow: "rgba(34,197,94,0.3)" },
    { label: "App Users", value: stats?.appUsers ?? 0, icon: Smartphone, color: "purple", glow: "rgba(168,85,247,0.3)" },
  ];

  const pieData = [
    { name: "Approved", value: stats?.approvedMentors ?? 0, color: "#22c55e" },
    { name: "Pending", value: stats?.pendingMentors ?? 0, color: "#f59e0b" },
    { name: "Rejected", value: stats?.rejectedMentors ?? 0, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const colorMap: Record<string, string> = {
    blue: "text-blue-400", amber: "text-amber-400", green: "text-green-400",
    red: "text-red-400", purple: "text-purple-400",
  };

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-purple-400 tracking-wide">Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">EA Cloud Platform Overview</p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            whileHover={{ y: -3, scale: 1.02 }}
            className="relative rounded-xl border border-white/6 bg-white/3 p-4 overflow-hidden cursor-default group"
            onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 20px ${card.glow}`)}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
          >
            <card.icon className={`w-5 h-5 mb-3 ${colorMap[card.color]}`} />
            <div className="text-2xl font-black text-white mb-0.5">
              {isLoading ? <div className="w-10 h-7 bg-white/10 rounded animate-pulse" /> : card.value.toLocaleString()}
            </div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium leading-tight">{card.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 rounded-xl border border-white/8 bg-white/3 p-6">
          <h3 className="font-semibold text-white mb-5">Platform Growth</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mockBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0e0e18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Bar dataKey="mentors" fill="#a855f7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="clients" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
          <h3 className="font-semibold text-white mb-5">Mentor Status</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0e0e18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-white/20 text-sm">No mentor data yet</div>
          )}
        </motion.div>
      </div>

      {stats?.pendingAppUsers && stats.pendingAppUsers > 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mt-6 p-4 rounded-xl border border-amber-500/25 bg-amber-500/8 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-300"><strong>{stats.pendingAppUsers}</strong> pending app access request{stats.pendingAppUsers > 1 ? "s" : ""} awaiting approval</span>
        </motion.div>
      ) : null}
    </div>
  );
}
