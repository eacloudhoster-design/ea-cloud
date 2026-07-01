import { useState } from "react";
import { motion } from "framer-motion";
import { usePortalRedirect } from "@/contexts/AuthContext";
import { Download, CheckCircle2, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Mt5ConnectInput from "@/components/Mt5ConnectInput";

const steps = [
  { step: 1, title: "Download Auto Trade Copier", desc: "Click the button below to download your personalised EA Cloud MQ5 trade copier file. This file is pre-configured with your API key." },
  { step: 2, title: "Copy File to MT5 Experts Folder", desc: "Navigate to your MetaTrader 5 data folder (File → Open Data Folder) and paste the .mq5 file into the MQL5/Experts directory." },
  { step: 3, title: "Compile the EA in MetaEditor", desc: "In MT5, press F4 to open MetaEditor. Open the file from Navigator and press F5 (or click Compile) to build the EA." },
  { step: 4, title: "Allow WebRequest in MT5", desc: 'Go to Tools → Options → Expert Advisors. Check "Allow WebRequest for listed URL" and add your EA Cloud server URL to the list.' },
  { step: 5, title: "Attach EA to a Chart", desc: "In MT5, open any chart (any symbol is fine) and drag the EA Cloud Copier from the Navigator panel onto the chart." },
  { step: 6, title: "Enable Auto-Trading", desc: 'Click "Enable Auto-Trading" in the MT5 toolbar. The EA will auto-start, register your account with EA Cloud, and begin forwarding trades.' },
  { step: 7, title: "Verify Connection", desc: "Check the Experts tab in MT5 — you should see 'EA Cloud: Account verified and registered successfully.' Your clients are now live-connected." },
  { step: 8, title: "Trade as Normal", desc: "Place trades as you normally would. Every open, modify, and close is automatically broadcast to all subscribed clients in real time." },
];

export default function SetupMethod() {
  usePortalRedirect();
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/copier/download", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Download failed (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const contentDisp = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = contentDisp.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] ?? "EACloud_Copier.mq5";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 4000);
    } catch (err: unknown) {
      setDownloadError((err as Error).message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-primary tracking-wide">Setup Method</h1>
        <p className="text-white/40 text-sm mt-1">Install and configure your MT5 auto trade copier</p>
      </motion.div>

      <div className="max-w-2xl">
        {/* Terminal Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-[#00ff88]/20 bg-[#001a0d]/50 p-5 mb-8 font-mono text-xs"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#e31e24]/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88]/60" />
            <span className="text-white/20 ml-1 text-[10px]">MetaTrader 5 — Experts Log</span>
          </div>
          <div className="text-[#00ff88]">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <div className="text-[#00ff88]">EA Cloud Auto Trade Copier v2.00</div>
          <div className="text-white/50">Mentor  : Your Trading Handle</div>
          <div className="text-[#4da8ff]">Account : 12345678 @ Exness-MT5Real</div>
          <div className="text-[#00ff88]">EA Cloud: Account verified and registered.</div>
          <div className="text-white/50">Monitoring trades on XAUUSD...</div>
          <div className="text-[#00ff88]">EA Cloud Signal → HTTP 201 | OPEN BUY 0.10</div>
          <div className="text-white/30">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
        </motion.div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex gap-4 p-4 rounded-xl border border-white/6 bg-white/2 group hover:border-primary/20 hover:bg-primary/3 transition-all duration-200"
            >
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary mt-0.5">
                {s.step}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm mb-0.5">{s.title}</div>
                <div className="text-white/45 text-xs leading-relaxed">{s.desc}</div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-white/10 group-hover:text-primary/40 flex-shrink-0 ml-auto mt-0.5 transition-colors" />
            </motion.div>
          ))}
        </div>

        {/* Download Button */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Button
            size="lg"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full h-14 bg-gradient-to-r from-[#1a6bff] via-primary to-[#e31e24] hover:opacity-90 disabled:opacity-60 text-white font-bold text-base tracking-wider shadow-[0_0_30px_rgba(26,107,255,0.3)] transition-all duration-300 gap-3"
          >
            {downloading ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Generating File...</>
            ) : downloadDone ? (
              <><Check className="w-5 h-5" />Downloaded Successfully</>
            ) : (
              <><Download className="w-5 h-5" />Download Auto Trade Copier (MQ5)</>
            )}
          </Button>

          {downloadError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 mt-3 p-3 rounded-lg border border-red-500/20 bg-red-500/8"
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs">{downloadError}</p>
            </motion.div>
          )}

          <p className="text-center text-white/20 text-xs mt-3">
            Your file is pre-configured with your API key — keep it private
          </p>
        </motion.div>

        {/* MT5 connected accounts panel */}
        <Mt5ConnectInput />
      </div>
    </div>
  );
}
