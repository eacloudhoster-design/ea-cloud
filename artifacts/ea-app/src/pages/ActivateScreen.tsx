import { useState } from "react";
import { motion } from "framer-motion";
import { Key, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { eaLogo } from "@/lib/branding";
import { robotBg } from "@/lib/branding";

interface ActivateScreenProps {
  token: string;
  onActivated: () => void;
  onLogout: () => void;
}

export default function ActivateScreen({ token, onActivated, onLogout }: ActivateScreenProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleActivate = async () => {
    const trimmed = licenseKey.trim();
    if (!trimmed) { setError("Please enter your license key"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/app/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ licenseKey: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Activation failed");
        return;
      }
      setSuccess(true);
      setTimeout(onActivated, 1200);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden" style={{ background: "#060610" }}>
      {/* Background */}
      <img src={robotBg} alt="" className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none" style={{ opacity: 0.2 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(6,6,16,0.7) 0%, rgba(6,6,16,0.85) 50%, #060610 100%)" }} />

      <div className="relative z-10 flex flex-col items-center px-6 w-full">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl overflow-hidden mb-5" style={{ border: "2px solid rgba(227,30,36,0.5)", boxShadow: "0 0 24px rgba(227,30,36,0.3)" }}>
          <img src={eaLogo} alt="EA Cloud" className="w-full h-full object-cover" />
        </div>

        {/* Key icon */}
        <motion.div
          animate={success ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 0.4 }}
          className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
          style={{
            background: success ? "rgba(34,197,94,0.15)" : "rgba(26,107,255,0.1)",
            border: `2px solid ${success ? "rgba(34,197,94,0.5)" : "rgba(26,107,255,0.4)"}`,
            boxShadow: success ? "0 0 24px rgba(34,197,94,0.3)" : "0 0 20px rgba(26,107,255,0.2)",
          }}
        >
          {success ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
              <ShieldCheck size={34} className="text-green-400" />
            </motion.div>
          ) : (
            <Key size={32} className="text-[#1a6bff]" />
          )}
        </motion.div>

        <h2 className="text-white font-black text-2xl text-center mb-2">
          {success ? "Access Granted!" : "Activate Your Access"}
        </h2>
        <p className="text-white/40 text-sm text-center mb-8 leading-relaxed">
          {success
            ? "Loading your personalized trading dashboard..."
            : "Enter the license key provided by your mentor to unlock the EA Cloud trading platform"}
        </p>

        {/* Card */}
        {!success && (
          <div
            className="w-full rounded-2xl p-5 mb-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(16px)" }}
          >
            <label className="block text-white/50 text-xs uppercase tracking-widest mb-2">License Key</label>
            <input
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleActivate()}
              placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
              className="w-full px-4 py-3.5 rounded-xl text-white font-mono text-sm tracking-widest placeholder:text-white/15 outline-none focus:ring-1 focus:ring-blue-500/50 mb-4"
              style={{ background: "rgba(26,107,255,0.08)", border: "1px solid rgba(26,107,255,0.25)", letterSpacing: "0.12em" }}
              autoCapitalize="characters"
              autoCorrect="off"
            />

            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-red-400 text-xs mb-3 text-center">
                {error}
              </motion.p>
            )}

            <button
              onClick={handleActivate}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{
                background: loading ? "rgba(26,107,255,0.4)" : "linear-gradient(135deg, #1a6bff 0%, #0d4fd4 100%)",
                boxShadow: "0 4px 20px rgba(26,107,255,0.4)",
              }}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : <><ShieldCheck size={16} /> Verify License</>}
            </button>
          </div>
        )}

        {/* Help text */}
        {!success && (
          <p className="text-white/20 text-xs text-center mb-6">
            Contact your mentor if you don't have a license key
          </p>
        )}

        {!success && (
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-white/25 text-xs hover:text-white/40 transition-colors"
          >
            <LogOut size={13} /> Sign out
          </button>
        )}
      </div>

      <p className="absolute bottom-8 text-center text-white/15 text-xs">
        EA Cloud · Secure · Professional · Automated Trading
      </p>
    </div>
  );
}
