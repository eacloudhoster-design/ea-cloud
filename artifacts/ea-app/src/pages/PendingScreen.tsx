import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CreditCard, Copy, Check, LogOut, AlertTriangle } from "lucide-react";

interface PendingScreenProps {
  status: "pending" | "rejected";
  token: string;
  onApproved: (licenseKey: string | null) => void;
  onLogout: () => void;
}

const BLUE = "#1a6bff";
const ACCOUNT_NO = "51114399259";
const BANK = "TymeBank";
const ACCOUNT_NAME = "EA Cloud";
const AMOUNT = "R600";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-2 flex-shrink-0 p-1 rounded transition-colors"
      style={{ color: copied ? "#22c55e" : BLUE }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <span className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <div className="flex items-center">
        <span className="text-sm font-semibold" style={{ color: copyable ? BLUE : "white" }}>{value}</span>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}

export default function PendingScreen({ status: initialStatus, token, onApproved, onLogout }: PendingScreenProps) {
  const [status, setStatus] = useState(initialStatus);
  const [checking, setChecking] = useState(false);
  const [paidPressed, setPaidPressed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Fetch user email on mount
  useEffect(() => {
    fetch("/api/app/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.email) setUserEmail(data.email); })
      .catch(() => {});
  }, [token]);

  // Poll every 15 seconds
  useEffect(() => {
    const timer = setInterval(checkStatus, 15000);
    return () => clearInterval(timer);
  }, [token]);

  const checkStatus = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/app/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const client = await res.json();
      setStatus(client.status);
      if (client.status === "approved") onApproved(null);
    } catch {}
    finally { setChecking(false); }
  };

  const handlePaid = async () => {
    setPaidPressed(true);
    await checkStatus();
  };

  const isRejected = status === "rejected";

  if (isRejected) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden px-6" style={{ background: "#060610" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.4)" }}>
          <span className="text-2xl text-red-400">✕</span>
        </div>
        <h2 className="text-white font-black text-2xl text-center mb-3">Access Denied</h2>
        <p className="text-white/40 text-sm text-center mb-8">Your access request has been denied. Please contact your mentor for assistance.</p>
        <button
          onClick={onLogout}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}
        >
          <LogOut size={15} /> Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-y-auto" style={{ background: "#060610" }}>
      {/* Blue top glow */}
      <div
        className="absolute top-0 inset-x-0 h-64 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% -10%, rgba(26,107,255,0.2) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex flex-col items-center px-4 pt-12 pb-10 w-full">

        {/* Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "rgba(26,107,255,0.12)", border: `2px solid rgba(26,107,255,0.4)`, boxShadow: "0 0 28px rgba(26,107,255,0.25)" }}
        >
          <CreditCard size={28} style={{ color: BLUE }} />
        </motion.div>

        <h1 className="font-black text-2xl text-center mb-2" style={{ color: BLUE }}>Payment Required</h1>
        <p className="text-sm text-center mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
          One-time payment to activate your EA Cloud access
        </p>

        {/* Warning banner */}
        <div
          className="w-full rounded-2xl p-4 mb-4 flex items-start gap-3"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}
        >
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
          <p className="text-sm leading-relaxed" style={{ color: "#f59e0b" }}>
            EA Cloud subscriptions are currently down.{" "}
            <span className="font-bold text-white">Subscription fee is {AMOUNT}.</span>
          </p>
        </div>

        {/* Payment details card */}
        <div
          className="w-full rounded-2xl px-4 mb-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p className="text-xs font-bold tracking-widest pt-4 pb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
            PAYMENT DETAILS
          </p>
          <DetailRow label="Bank" value={BANK} />
          <DetailRow label="Account Name" value={ACCOUNT_NAME} />
          <DetailRow label="Account No." value={ACCOUNT_NO} copyable />
          <DetailRow label="Amount" value={AMOUNT} />
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Reference</span>
            <div className="flex items-center">
              <span className="text-sm font-semibold" style={{ color: BLUE }}>
                {userEmail ?? "your email address"}
              </span>
              {userEmail && <CopyButton text={userEmail} />}
            </div>
          </div>
        </div>

        {/* How it works */}
        <div
          className="w-full rounded-2xl px-4 pb-4 mb-5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p className="text-xs font-bold tracking-widest pt-4 pb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            HOW IT WORKS
          </p>
          {[
            `Make an EFT of ${AMOUNT} to the ${BANK} account above`,
            "Use your email address as the payment reference",
            "Send proof of payment to your mentor",
            "Tap \"I've Paid\" below once you've sent proof",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 mb-2.5 last:mb-0">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5" style={{ background: "rgba(26,107,255,0.2)", color: BLUE }}>
                {i + 1}
              </span>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{step}</p>
            </div>
          ))}
        </div>

        {/* I've Paid button */}
        {paidPressed ? (
          <div
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 mb-3 text-sm font-semibold"
            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
          >
            <Check size={16} /> Thanks! Awaiting mentor verification{checking ? "…" : ""}
          </div>
        ) : (
          <button
            onClick={handlePaid}
            className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mb-3"
            style={{
              background: "linear-gradient(135deg, #1a6bff 0%, #0d4fd9 100%)",
              boxShadow: "0 4px 24px rgba(26,107,255,0.35)",
            }}
          >
            I've Paid
          </button>
        )}

        <button
          onClick={onLogout}
          className="w-full py-3 rounded-2xl text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-colors"
          style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)" }}
        >
          <LogOut size={15} /> Sign Out
        </button>

      </div>
    </div>
  );
}
