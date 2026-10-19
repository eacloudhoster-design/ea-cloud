import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useClientAuth, appFetch, type AppClient } from "@/contexts/ClientAuthContext";
import { Eye, EyeOff, Zap } from "lucide-react";
import { logo } from "@/lib/branding";
import { loginErrorMessage } from "@/lib/login-error";
import defaultRobot from "/default-robot.jpg";

export default function AppLogin() {
  const { login, client } = useClientAuth();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (client) {
    if (client.status === "pending") setLocation("/app/pending");
    else if (client.status === "approved" && !client.licenseKey) setLocation("/app/activate");
    else if (client.status === "approved" && client.licenseKey) setLocation("/app/dashboard");
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await appFetch("/app/login", { method: "POST", body: JSON.stringify(form) });
      const { client: c, token } = res as { client: AppClient; token: string };
      login(token, c);
      if (c.status === "pending") setLocation("/app/pending");
      else if (c.status === "approved" && !c.licenseKey) setLocation("/app/activate");
      else setLocation("/app/dashboard");
    } catch (err: any) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img src={defaultRobot} alt="" className="w-full h-full object-cover opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080810]/60 via-[#080810]/80 to-[#080810]" />
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl" />
            <img src={logo} alt="EA Cloud" className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/60 relative" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">EA CLOUD</h1>
          <p className="text-white/40 text-sm mt-1">AI-Powered Copy Trading</p>
        </div>

        <div className="bg-white/4 backdrop-blur-xl border border-white/8 rounded-3xl p-7 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
          <p className="text-white/40 text-sm mb-6">Sign in to your trading account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                className="w-full h-12 px-4 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-primary/60 focus:bg-white/8 transition-all text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full h-12 px-4 pr-12 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-primary/60 focus:bg-white/8 transition-all text-sm"
                  required
                />
                <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm">{error}</motion.p>}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-[#ff4444] text-white font-bold text-sm tracking-wide shadow-[0_0_30px_rgba(227,30,36,0.4)] hover:shadow-[0_0_40px_rgba(227,30,36,0.6)] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Zap className="w-4 h-4" />SIGN IN</>}
            </motion.button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/6 text-center">
            <p className="text-white/40 text-sm">
              Don't have an account?{" "}
              <Link href="/app/subscribe" className="text-primary hover:text-red-400 font-semibold transition-colors">
                Subscribe Now
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
