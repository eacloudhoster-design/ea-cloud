import { motion } from "framer-motion";
import { useGetDashboard, useGetDashboardActivity } from "@workspace/api-client-react";
import { Users, KeyRound, Wifi, Activity, TrendingUp, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

function AnimatedCounter({ value }: { value: number }) {
  return <span>{value.toLocaleString()}</span>;
}

const mockChartData = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i],
  trades: Math.floor(Math.random() * 40) + 5,
  clients: Math.floor(Math.random() * 15) + 1,
}));

export default function AdminDashboard() {
  usePortalRedirect();
  const { user } = useAuth();
  const { data: stats, isLoading } = useGetDashboard();
  const { data: activity } = useGetDashboardActivity();

  const statCards = [
    { label: "Max Licenses", value: stats?.maxLicenses ?? 0, sub: `${stats?.totalLicenses ?? 0}/${stats?.maxLicenses ?? 0} used`, icon: KeyRound, color: "blue", glow: "rgba(59,130,246,0.3)" },
    { label: "Total Licenses", value: stats?.totalLicenses ?? 0, sub: `${stats?.activeLicenses ?? 0} active`, icon: KeyRound, color: "primary", glow: "rgba(227,30,36,0.3)" },
    { label: "Connected Accounts", value: stats?.connectedAccounts ?? 0, sub: `${stats?.licenseUsagePercent ?? 0}%`, icon: Wifi, color: "green", glow: "rgba(34,197,94,0.3)" },
    { label: "Recent Activity", value: stats?.recentActivityCount ?? 0, sub: "Just now", icon: Activity, color: "amber", glow: "rgba(245,158,11,0.3)" },
  ];

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">Welcome back, {user?.firstName} {user?.lastName}</p>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -3, scale: 1.01 }}
            className="relative rounded-xl border border-white/8 bg-white/3 p-5 overflow-hidden group cursor-default"
            style={{ boxShadow: `0 0 0 0 ${card.glow}`, transition: "box-shadow 0.3s" }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 25px ${card.glow}`)}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl font-black text-white mb-1">
                  {isLoading ? <div className="w-16 h-8 bg-white/10 rounded animate-pulse" /> : <AnimatedCounter value={card.value} />}
                </div>
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium">{card.label}</div>
              </div>
              <div>
                <div className={`text-xs font-medium ${card.color === "blue" ? "text-blue-400" : card.color === "primary" ? "text-primary" : card.color === "green" ? "text-green-400" : "text-amber-400"} bg-current/10 px-2 py-0.5 rounded-full`}
                  style={{ background: `${card.glow}` }}>
                  {card.sub}
                </div>
              </div>
            </div>
            <card.icon className={`absolute bottom-4 right-4 w-12 h-12 opacity-5 ${card.color === "blue" ? "text-blue-400" : card.color === "primary" ? "text-primary" : card.color === "green" ? "text-green-400" : "text-amber-400"}`} />
          </motion.div>
        ))}
      </div>

      {/* Activity Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-xl border border-white/8 bg-white/3 p-6 mb-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-white">Trading Activity</h3>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={mockChartData}>
            <defs>
              <linearGradient id="tradeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e31e24" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#e31e24" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="clientGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
            <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0e0e18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
            <Area type="monotone" dataKey="trades" stroke="#e31e24" fill="url(#tradeGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="clients" stroke="#3b82f6" fill="url(#clientGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Recent Activity Feed */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-xl border border-white/8 bg-white/3 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-white">Recent Activity</h3>
        </div>
        {(!activity || activity.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-10 text-white/20">
            <Activity className="w-8 h-8 mb-3" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activity.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/2 border border-white/5">
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <span className="text-sm text-white/70 flex-1">{item.description}</span>
                <span className="text-xs text-white/30 flex-shrink-0">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
