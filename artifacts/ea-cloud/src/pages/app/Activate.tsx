import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useClientAuth, appFetch, type AppClient } from "@/contexts/ClientAuthContext";
import { KeyRound, ArrowRight, LogOut, HelpCircle, CheckCircle2 } from "lucide-react";
import { logo } from "@/lib/branding";

export default function AppActivate() {
  const { client, updateClient, logout } = useClientAuth();
  const [, setLocation] = useLocation();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!client) { setLocation("/app"); return null; }
  if (client.status !== "approved") { setLocation("/app/pending"); return null; }
  if (client.licenseKey) { setLocation("/app/dashboard"); return null; }

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { setError("Please enter your license key"); return; }
    setError("");
    setLoading(true);
    try {
      const updated = await appFetch("/app/activate", {
        method: "POST",
        body: JSON.stringify({ licenseKey: key.trim() }),
      }) as AppClient;
      updateClient(updated);
      setLocation("/app/dashboard");
    } catch (err: any) {
      setError(err?.data?.error ?? "Invalid license key. Please check with your mentor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.025]" style={{
        backgroundImage: "linear-gradient(rgba(26,107,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(26,107,255,0.5) 1px, transparent 1px)",
        backgroundSize: "50px 50px"
      }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#1a6bff]/8 rounded-full blur-[120px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-green-500/20 blur-xl" />
            <div className="relative w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
          </div>
          <img src={logo} alt="EA Cloud" className="w-10 h-10 rounded-full object-cover ring-1 ring-primary/40 mb-3" />
          <h1 className="text-xl font-black text-white">Account Approved!</h1>
          <p className="text-white/40 text-xs mt-1 text-center">Enter your license key to access trading</p>
        </div>

        <div className="bg-white/4 backdrop-blur-xl border border-white/8 rounded-3xl p-7 shadow-2xl mb-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/8 border border-green-500/15 mb-5">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-xs text-green-300/80">Welcome, <span className="font-semibold">{client.firstName}</span>! Your account has been approved.</p>
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider block mb-2">License Key</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  value={key}
                  onChange={e => setKey(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full h-13 pl-10 pr-4 py-3.5 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/60 text-sm font-mono tracking-wider transition-all"
                />
              </div>
              {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs mt-2">{error}</motion.p>}
            </div>

            {/* Help box */}
            <div className="flex gap-2 p-3 rounded-xl bg-[#1a6bff]/8 border border-[#1a6bff]/15">
              <HelpCircle className="w-4 h-4 text-[#4da8ff] flex-shrink-0 mt-0.5" />
              <div className="text-xs text-white/50 leading-relaxed">
                Your license key is provided by your trading mentor after they set up your account. Contact your mentor if you haven't received one.
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={loading || !key.trim()}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-[#ff4444] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(227,30,36,0.3)] hover:shadow-[0_0_40px_rgba(227,30,36,0.5)] transition-all disabled:opacity-50"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><KeyRound className="w-4 h-4" />ACTIVATE LICENSE<ArrowRight className="w-4 h-4" /></>}
            </motion.button>
          </form>
        </div>

        <button onClick={logout} className="w-full h-10 rounded-xl border border-white/6 text-white/25 hover:text-red-400 hover:border-red-500/15 text-sm flex items-center justify-center gap-2 transition-all">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </motion.div>
    </div>
  );
}
