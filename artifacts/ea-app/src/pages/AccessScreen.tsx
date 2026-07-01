import { useState } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import eaLogo from "@assets/ea_cloud_offical_logo_1778762761166.jpeg";

interface AccessScreenProps {
  onAuthenticated: (token: string, status: string, licenseKey: string | null) => void;
}

type Mode = "register" | "login";

const BLUE = "#1a6bff";
const BLUE_GLOW = "rgba(26,107,255,0.45)";

function Field({ label, type, value, onChange, placeholder, onEnter }: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  onEnter?: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold tracking-widest" style={{ color: "rgba(255,255,255,0.38)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => e.key === "Enter" && onEnter?.()}
        className="w-full px-4 py-4 rounded-2xl text-white text-sm placeholder:text-white/20 outline-none"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
      />
    </div>
  );
}

export default function AccessScreen({ onAuthenticated }: AccessScreenProps) {
  const [mode, setMode] = useState<Mode>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setError(""); setFirstName(""); setLastName(""); setEmail(""); };

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("All fields are required"); return;
    }
    setError(""); setLoading(true);
    const autoPassword = btoa(email.trim().toLowerCase() + "_eacloud_" + Date.now()).slice(0, 24);
    try {
      const res = await fetch("/api/app/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password: autoPassword,
          plan: "monthly",
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // Email already registered — fetch their token by email and route them
        const loginRes = await fetch("/api/app/login-by-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) { setError(loginData.error || "Account lookup failed"); return; }
        localStorage.setItem("appClientToken", loginData.token);
        onAuthenticated(loginData.token, loginData.client.status, null);
        return;
      }
      if (!res.ok) { setError(data.error || "Registration failed"); return; }
      localStorage.setItem("appClientToken", data.token);
      onAuthenticated(data.token, data.client.status, data.client.licenseKey);
    } catch {
      setError("Connection error. Please try again.");
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!email.trim()) { setError("Email is required"); return; }
    setError(""); setLoading(true);
    try {
      // Login via token lookup by email
      const res = await fetch("/api/app/login-by-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Account not found"); return; }
      localStorage.setItem("appClientToken", data.token);
      onAuthenticated(data.token, data.client.status, null);
    } catch {
      setError("Connection error. Please try again.");
    } finally { setLoading(false); }
  };

  const handle = mode === "register" ? handleRegister : handleLogin;

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-y-auto"
      style={{ background: "#060610" }}
    >
      {/* Red ambient at very top */}
      <div
        className="absolute top-0 inset-x-0 h-56 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(180,20,20,0.18) 0%, transparent 70%)" }}
      />

      {/* Logo + title section */}
      <div className="relative z-10 flex flex-col items-center pt-10 pb-8 px-6">
        {/* Logo */}
        <div
          className="w-28 h-28 rounded-3xl overflow-hidden mb-5"
          style={{
            border: "2px solid rgba(180,20,20,0.5)",
            boxShadow: "0 0 36px rgba(180,20,20,0.35), 0 0 80px rgba(180,20,20,0.12)",
          }}
        >
          <img src={eaLogo} alt="EA Cloud" className="w-full h-full object-cover" />
        </div>

        <h1 className="font-black text-3xl tracking-tight mb-1" style={{ color: BLUE }}>EA Cloud</h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          {mode === "register" ? "Create your account to get started" : "Sign in to your account"}
        </p>

        {/* Blue horizontal glow separator */}
        <div
          className="absolute bottom-0 inset-x-0 h-px"
          style={{ background: `linear-gradient(to right, transparent, ${BLUE_GLOW}, transparent)` }}
        />
        <div
          className="absolute bottom-0 inset-x-0 h-8 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(26,107,255,0.2) 0%, transparent 70%)" }}
        />
      </div>

      {/* Form card */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 mx-4 mt-4"
      >
        <div
          className="rounded-3xl p-5 space-y-4"
          style={{
            background: "rgba(20,22,38,0.9)",
            border: "1.5px solid rgba(26,107,255,0.35)",
            boxShadow: "0 0 40px rgba(26,107,255,0.15), inset 0 0 40px rgba(26,107,255,0.02)",
          }}
        >
          <Field label="EMAIL" type="email" value={email} onChange={setEmail} placeholder="you@email.com" />

          {mode === "register" && (
            <>
              <Field label="FIRST NAME" type="text" value={firstName} onChange={setFirstName} placeholder="First name" />
              <Field label="LAST NAME" type="text" value={lastName} onChange={setLastName} placeholder="Last name" onEnter={handle} />
            </>
          )}

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs text-center">
              {error}
            </motion.p>
          )}

          {/* CTA button */}
          <button
            onClick={handle}
            disabled={loading}
            className="w-full py-4 rounded-full font-bold text-white text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-2"
            style={{
              background: loading
                ? "rgba(26,107,255,0.45)"
                : "linear-gradient(135deg, #3a8bff 0%, #1a6bff 50%, #0d4fd9 100%)",
              boxShadow: "0 0 28px rgba(26,107,255,0.55), 0 4px 16px rgba(26,107,255,0.3)",
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Access EA Cloud"}
          </button>
        </div>
      </motion.div>

      <div className="pb-10" />
    </div>
  );
}
