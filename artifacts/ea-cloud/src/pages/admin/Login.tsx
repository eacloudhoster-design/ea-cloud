import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { logo } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Clock, CheckCircle2 } from "lucide-react";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const justApproved = new URLSearchParams(search).get("approved") === "1";
  const { login } = useAuth();
  const loginMutation = useLogin();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsPending(false);
    try {
      const result = await loginMutation.mutateAsync({ data: { ...form, role: "mentor" } });
      login(result.user, result.token);
      setLocation("/admin/dashboard");
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string } | null };
      const msg = apiErr?.data?.error || "Invalid credentials";
      if (msg === "pending_approval") {
        setIsPending(true);
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(ellipse at 30% 20%, rgba(227,30,36,0.12) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,100,255,0.08) 0%, transparent 50%)" }} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/40 blur-2xl scale-200" />
            <img src={logo} alt="EA Cloud" className="relative w-24 h-24 rounded-full object-cover ring-2 ring-primary/60 shadow-[0_0_50px_rgba(227,30,36,0.6)]" />
          </div>
        </motion.div>

        <div className="relative rounded-2xl overflow-hidden">
          {/* Glowing border */}
          <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(0,255,136,0.3), rgba(0,255,136,0.05), transparent 60%)", padding: "1px" }}>
            <div className="w-full h-full rounded-2xl bg-[#0e0e16]" />
          </div>
          <div className="relative z-10 p-8" style={{ background: "rgba(14,14,22,0.95)", borderRadius: "1rem", border: "1px solid rgba(0,255,136,0.2)", boxShadow: "0 0 40px rgba(0,255,136,0.08), 0 0 80px rgba(0,0,0,0.5)" }}>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white tracking-wide">EA Cloud Admin Portal</h1>
              <p className="text-white/40 text-xs mt-2 uppercase tracking-widest">Welcome — Login to access your dashboard</p>
            </div>
            {justApproved && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 flex gap-3 items-start mb-4">
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-green-300 text-sm font-semibold">Account Approved!</p>
                  <p className="text-green-300/60 text-xs mt-0.5">Your account has been approved. You can now log in below.</p>
                </div>
              </motion.div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-white/60 text-xs mb-2 block uppercase tracking-wider">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@eacloud.com" required className="bg-black/40 border-white/10 text-white placeholder:text-white/20 focus:border-[#00ff88]/50 h-11" />
              </div>
              <div>
                <Label className="text-white/60 text-xs mb-2 block uppercase tracking-wider">Password</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required className="bg-black/40 border-white/10 text-white placeholder:text-white/20 focus:border-[#00ff88]/50 h-11" />
              </div>
              {isPending && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3 items-start">
                  <Clock className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-amber-300 text-sm font-semibold">Pending Super Admin Approval</p>
                    <p className="text-amber-300/60 text-xs mt-0.5">Your account is under review. You'll be able to log in once a super admin approves it.</p>
                  </div>
                </motion.div>
              )}
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <Button type="submit" disabled={loginMutation.isPending} className="w-full h-11 bg-gradient-to-r from-[#1a6bff] to-[#e31e24] hover:opacity-90 text-white font-bold tracking-wider shadow-[0_0_20px_rgba(26,107,255,0.3)] transition-all duration-300 mt-1">
                {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "LOGIN"}
              </Button>
            </form>
            <p className="text-center text-white/30 text-xs mt-5">
              <Link href="/register" className="hover:text-white/60 transition-colors uppercase tracking-wider">Don't have an account?</Link>
            </p>
          </div>
        </div>
        <p className="text-center text-white/15 text-xs mt-6 uppercase tracking-widest">Black by Code. Red by Choice.</p>
      </motion.div>
    </div>
  );
}
