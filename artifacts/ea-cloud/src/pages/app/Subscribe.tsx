import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useClientAuth, appFetch, type AppClient } from "@/contexts/ClientAuthContext";
import { Check, ChevronRight, CreditCard, Lock, Zap, Star, Crown, Eye, EyeOff, ArrowLeft } from "lucide-react";
import logo from "@assets/ea_cloud_1778700558655.jpg";
import defaultRobot from "/default-robot.jpg";

const PLANS = [
  {
    id: "monthly",
    label: "Monthly",
    price: "$29",
    period: "/month",
    desc: "Perfect to get started",
    icon: Zap,
    color: "border-primary/40 bg-primary/5",
    glow: "shadow-[0_0_30px_rgba(227,30,36,0.15)]",
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "$249",
    period: "/year",
    desc: "Save 28% — Most Popular",
    icon: Star,
    badge: "POPULAR",
    color: "border-[#1a6bff]/50 bg-[#1a6bff]/5",
    glow: "shadow-[0_0_30px_rgba(26,107,255,0.2)]",
  },
  {
    id: "lifetime",
    label: "Lifetime",
    price: "$599",
    period: " once",
    desc: "Best value — Pay once",
    icon: Crown,
    color: "border-yellow-500/40 bg-yellow-500/5",
    glow: "shadow-[0_0_30px_rgba(234,179,8,0.1)]",
  },
];

export default function Subscribe() {
  const { login } = useClientAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [personal, setPersonal] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [plan, setPlan] = useState("yearly");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });

  const formatCard = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await appFetch("/app/register", {
        method: "POST",
        body: JSON.stringify({ ...personal, plan }),
      });
      const { client: c, token } = res as { client: AppClient; token: string };
      login(token, c);
      setLocation("/app/pending");
    } catch (err: any) {
      setError(err?.data?.error ?? "Registration failed. Please try again.");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Account", "Plan", "Payment"];

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={defaultRobot} alt="" className="w-full h-full object-cover opacity-8" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080810]/80 via-[#080810]/85 to-[#080810]" />
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <img src={logo} alt="EA Cloud" className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/50 mb-3" />
          <h1 className="text-xl font-black text-white">Join EA CLOUD</h1>
          <p className="text-white/40 text-xs mt-1">Start your copy trading journey</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                step > i + 1 ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : step === i + 1 ? "bg-primary/20 text-primary border border-primary/40"
                : "bg-white/4 text-white/25 border border-white/8"
              }`}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                {s}
              </div>
              {i < steps.length - 1 && <div className={`w-6 h-px ${step > i + 1 ? "bg-green-500/40" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white/4 backdrop-blur-xl border border-white/8 rounded-3xl p-6 shadow-2xl">
          <AnimatePresence mode="wait">
            {/* Step 1 - Personal Info */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-lg font-bold text-white mb-4">Personal Details</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">First Name</label>
                      <input value={personal.firstName} onChange={e => setPersonal(p => ({ ...p, firstName: e.target.value }))}
                        placeholder="John" className="w-full h-11 px-3 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm transition-all" />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Surname</label>
                      <input value={personal.lastName} onChange={e => setPersonal(p => ({ ...p, lastName: e.target.value }))}
                        placeholder="Doe" className="w-full h-11 px-3 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Email Address</label>
                    <input type="email" value={personal.email} onChange={e => setPersonal(p => ({ ...p, email: e.target.value }))}
                      placeholder="you@example.com" className="w-full h-11 px-3 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm transition-all" />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Password</label>
                    <div className="relative">
                      <input type={showPw ? "text" : "password"} value={personal.password} onChange={e => setPersonal(p => ({ ...p, password: e.target.value }))}
                        placeholder="••••••••" className="w-full h-11 px-3 pr-11 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm transition-all" />
                      <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
                <button
                  onClick={() => {
                    if (!personal.firstName || !personal.lastName || !personal.email || !personal.password) { setError("All fields are required"); return; }
                    setError(""); setStep(2);
                  }}
                  className="mt-5 w-full h-12 rounded-xl bg-gradient-to-r from-primary to-[#ff4444] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(227,30,36,0.3)] hover:shadow-[0_0_35px_rgba(227,30,36,0.5)] transition-all"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* Step 2 - Plan */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-lg font-bold text-white mb-4">Choose Your Plan</h2>
                <div className="space-y-3 mb-5">
                  {PLANS.map(p => {
                    const Icon = p.icon;
                    const active = plan === p.id;
                    return (
                      <motion.button key={p.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                        onClick={() => setPlan(p.id)}
                        className={`w-full p-4 rounded-2xl border transition-all text-left relative ${active ? p.color + " " + p.glow : "border-white/8 bg-white/2 hover:border-white/15"}`}>
                        {p.badge && <span className="absolute top-3 right-3 text-[10px] font-bold text-[#1a6bff] bg-[#1a6bff]/15 border border-[#1a6bff]/30 px-2 py-0.5 rounded-full">{p.badge}</span>}
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? "bg-white/15" : "bg-white/5"}`}>
                            <Icon className={`w-4 h-4 ${active ? "text-white" : "text-white/40"}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-black text-white">{p.price}</span>
                              <span className="text-white/40 text-xs">{p.period}</span>
                            </div>
                            <div className="text-xs text-white/50 mt-0.5">{p.desc}</div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${active ? "border-primary bg-primary" : "border-white/20"}`}>
                            {active && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="h-12 px-4 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-all">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStep(3)} className="flex-1 h-12 rounded-xl bg-gradient-to-r from-primary to-[#ff4444] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(227,30,36,0.3)] transition-all">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3 - Payment */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-4 h-4 text-green-400" />
                  <h2 className="text-lg font-bold text-white">Secure Payment</h2>
                </div>

                {/* Card preview */}
                <div className="relative h-36 rounded-2xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] border border-white/10 mb-4 p-5 overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-2xl" />
                  <div className="text-white/30 text-xs font-mono mb-3">PAYMENT DETAILS</div>
                  <div className="font-mono text-white text-lg tracking-[4px]">
                    {card.number || "•••• •••• •••• ••••"}
                  </div>
                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <div className="text-white/30 text-[10px]">CARDHOLDER</div>
                      <div className="text-white text-xs font-medium uppercase">{card.name || `${personal.firstName} ${personal.lastName}`}</div>
                    </div>
                    <div>
                      <div className="text-white/30 text-[10px]">EXPIRES</div>
                      <div className="text-white text-xs font-mono">{card.expiry || "MM/YY"}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Card Number</label>
                    <div className="relative">
                      <input value={card.number} onChange={e => setCard(c => ({ ...c, number: formatCard(e.target.value) }))}
                        placeholder="1234 5678 9012 3456" maxLength={19}
                        className="w-full h-11 px-3 pr-10 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm font-mono transition-all" />
                      <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Cardholder Name</label>
                    <input value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))}
                      placeholder={`${personal.firstName} ${personal.lastName}`}
                      className="w-full h-11 px-3 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">Expiry</label>
                      <input value={card.expiry} onChange={e => setCard(c => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                        placeholder="MM/YY" maxLength={5}
                        className="w-full h-11 px-3 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm font-mono transition-all" />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 uppercase tracking-wider block mb-1.5">CVV</label>
                      <input value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                        placeholder="•••" type="password" maxLength={4}
                        className="w-full h-11 px-3 rounded-xl bg-white/6 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-sm transition-all" />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-white/3 border border-white/6 rounded-xl p-3 mb-4 text-sm">
                  <div className="flex justify-between text-white/50 mb-1">
                    <span>Plan</span><span className="text-white capitalize">{plan}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white border-t border-white/6 pt-2 mt-1">
                    <span>Total</span>
                    <span className="text-primary">{PLANS.find(p => p.id === plan)?.price}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="h-12 px-4 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-all">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleSubmit} disabled={loading}
                    className="flex-1 h-12 rounded-xl bg-gradient-to-r from-primary to-[#ff4444] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(227,30,36,0.4)] transition-all disabled:opacity-60">
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Lock className="w-4 h-4" />PAY & SUBSCRIBE</>}
                  </motion.button>
                </div>
                <p className="text-center text-white/20 text-xs mt-3 flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> 256-bit SSL encrypted · Powered by EA Cloud
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-white/30 text-sm mt-4">
          Already have an account?{" "}
          <Link href="/app" className="text-primary hover:text-red-400 font-semibold transition-colors">Sign In</Link>
        </p>
      </motion.div>
    </div>
  );
}
