import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import logo from "@assets/ea_cloud_1778700558655.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldCheck } from "lucide-react";

export default function SuperAdminLogin() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const loginMutation = useLogin();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const result = await loginMutation.mutateAsync({ data: { ...form, role: "superadmin" } });
      if (result.user.role !== "superadmin") {
        setError("Access denied. Super admin credentials required.");
        return;
      }
      login(result.user, result.token);
      setLocation("/superadmin/dashboard");
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string } | null };
      setError(apiErr?.data?.error || "Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(ellipse at top, #0d0820 0%, #080810 50%, #000 100%)" }}>
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(100,50,255,0.15) 0%, transparent 60%)" }} />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-sm">
        <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-3xl scale-200" />
            <img src={logo} alt="EA Cloud" className="relative w-24 h-24 rounded-full object-cover ring-2 ring-purple-500/60 shadow-[0_0_50px_rgba(168,85,247,0.6)]" />
          </div>
        </motion.div>

        <div className="relative rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(168,85,247,0.3)", boxShadow: "0 0 50px rgba(168,85,247,0.1), 0 0 100px rgba(0,0,0,0.5)", background: "rgba(10,8,20,0.95)", backdropFilter: "blur(20px)" }}>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-medium mb-4">
                <ShieldCheck className="w-3.5 h-3.5" />
                RESTRICTED ACCESS
              </div>
              <h1 className="text-2xl font-bold text-white tracking-wide">Super Admin Portal</h1>
              <p className="text-white/40 text-xs mt-2">Master Control Interface</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-white/60 text-xs mb-2 block uppercase tracking-wider">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="superadmin@eacloud.com" required className="bg-purple-950/30 border-purple-500/20 text-white placeholder:text-white/20 focus:border-purple-400/60 h-11" />
              </div>
              <div>
                <Label className="text-white/60 text-xs mb-2 block uppercase tracking-wider">Password</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required className="bg-purple-950/30 border-purple-500/20 text-white placeholder:text-white/20 focus:border-purple-400/60 h-11" />
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <Button type="submit" disabled={loginMutation.isPending} className="w-full h-11 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 text-white font-bold tracking-wider shadow-[0_0_25px_rgba(168,85,247,0.35)] transition-all duration-300 mt-1">
                {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "ACCESS PORTAL"}
              </Button>
            </form>
          </div>
        </div>
        <p className="text-center text-white/15 text-xs mt-6 uppercase tracking-widest">EA Cloud — Owner Control Layer</p>
      </motion.div>
    </div>
  );
}
