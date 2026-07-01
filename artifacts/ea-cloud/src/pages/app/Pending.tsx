import { useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useClientAuth, appFetch, type AppClient } from "@/contexts/ClientAuthContext";
import { Clock, CheckCircle2, XCircle, RefreshCw, LogOut, Mail } from "lucide-react";
import logo from "@assets/ea_cloud_1778700558655.jpg";

export default function AppPending() {
  const { client, updateClient, logout } = useClientAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!client) { setLocation("/app"); return; }
    if (client.status === "approved" && !client.licenseKey) setLocation("/app/activate");
    if (client.status === "approved" && client.licenseKey) setLocation("/app/dashboard");
    if (client.status === "rejected") setLocation("/app/rejected");
  }, [client]);

  const checkStatus = async () => {
    try {
      const updated = await appFetch("/app/me") as AppClient;
      updateClient(updated);
      if (updated.status === "approved" && !updated.licenseKey) setLocation("/app/activate");
      else if (updated.status === "approved") setLocation("/app/dashboard");
    } catch {}
  };

  if (!client) return null;

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(227,30,36,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(227,30,36,0.5) 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-sm text-center">
        <img src={logo} alt="EA Cloud" className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/50 mx-auto mb-6" />

        {/* Status card */}
        <div className="bg-white/4 backdrop-blur-xl border border-white/8 rounded-3xl p-8 shadow-2xl mb-5">
          {/* Pulsing indicator */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-yellow-500/30"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
              className="absolute inset-2 rounded-full bg-yellow-500/20"
            />
            <div className="absolute inset-4 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
          </div>

          <h2 className="text-xl font-black text-white mb-2">Awaiting Approval</h2>
          <p className="text-white/50 text-sm leading-relaxed mb-6">
            Your subscription is being reviewed by our team. You'll receive access once approved — usually within 24 hours.
          </p>

          {/* Steps */}
          <div className="space-y-3 text-left mb-6">
            {[
              { icon: CheckCircle2, label: "Registration complete", sub: `${client.firstName} ${client.lastName}`, done: true },
              { icon: Clock, label: "Admin review in progress", sub: "Typically within 24 hours", done: false, active: true },
              { icon: XCircle, label: "License key activation", sub: "Unlock after approval", done: false },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                item.done ? "border-green-500/20 bg-green-500/5" :
                item.active ? "border-yellow-500/20 bg-yellow-500/5" :
                "border-white/5 bg-white/2"
              }`}>
                <item.icon className={`w-5 h-5 flex-shrink-0 ${item.done ? "text-green-400" : item.active ? "text-yellow-400" : "text-white/20"}`} />
                <div>
                  <div className={`text-sm font-medium ${item.done ? "text-green-400" : item.active ? "text-yellow-300" : "text-white/30"}`}>{item.label}</div>
                  <div className="text-xs text-white/30">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Email info */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1a6bff]/10 border border-[#1a6bff]/20 text-left">
            <Mail className="w-4 h-4 text-[#4da8ff] flex-shrink-0" />
            <p className="text-xs text-white/50">Approval notification will be sent to <span className="text-[#4da8ff]">{client.email}</span></p>
          </div>
        </div>

        <div className="flex gap-3">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={checkStatus}
            className="flex-1 h-11 rounded-xl bg-white/6 border border-white/10 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
            <RefreshCw className="w-4 h-4" /> Check Status
          </motion.button>
          <button onClick={logout} className="h-11 px-4 rounded-xl border border-white/8 text-white/30 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
