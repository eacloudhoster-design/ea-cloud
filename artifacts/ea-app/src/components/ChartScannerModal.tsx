import { X, Camera, Upload, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { eaLogo } from "@/lib/branding";

interface ChartScannerModalProps {
  onClose: () => void;
}

export default function ChartScannerModal({ onClose }: ChartScannerModalProps) {
  const { accentColor } = useApp();
  const [trades, setTrades] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);

  // Rotate the outer dashed ring
  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(() => {
      setRotation(r => (r + 2) % 360);
    }, 16);
    return () => clearInterval(interval);
  }, [scanning]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    await new Promise(r => setTimeout(r, 3000));
    setScanning(false);
    setScanResult("XAUUSD • H1 • BUY Signal Detected");
  };

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#000", paddingBottom: 75 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="active:scale-90 transition-transform">
            <X size={22} style={{ color: accentColor }} />
          </button>
          <h2 className="text-white font-bold text-xl">
            <span style={{ color: accentColor }}>Chart</span> Scanner
          </h2>
        </div>
        <div
          className="px-3 py-1 rounded-full text-sm font-semibold"
          style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}88`, color: accentColor }}
        >
          13 / 13 scans
        </div>
      </div>

      {/* AI info box */}
      <div
        className="mx-4 rounded-xl p-3 flex items-start gap-2.5"
        style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}66` }}
      >
        <Sparkles size={18} style={{ color: accentColor }} className="flex-shrink-0 mt-0.5" />
        <p className="text-sm leading-snug">
          <span className="font-semibold" style={{ color: accentColor }}>AI auto-detects</span>
          <span className="text-white/80"> symbol &amp; timeframe directly from your chart image</span>
        </p>
      </div>

      {/* Trade / Lot size controls */}
      <div className="flex gap-3 px-4 mt-4">
        <div className="flex-1 rounded-2xl p-3" style={{ background: "rgba(18,18,18,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-2">Trades (Max 20)</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTrades(Math.max(1, trades - 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-lg active:scale-90 transition-transform"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >-</button>
            <span className="text-white font-bold text-xl flex-1 text-center">{trades}</span>
            <button
              onClick={() => setTrades(Math.min(20, trades + 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-lg active:scale-90 transition-transform"
              style={{ background: accentColor }}
            >+</button>
          </div>
        </div>
        <div className="flex-1 rounded-2xl p-3" style={{ background: "rgba(18,18,18,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-white/50 text-[10px] font-bold tracking-widest uppercase mb-2">Lot Size</p>
          <div className="flex items-center h-8">
            <span className="text-white font-bold text-2xl">0.01</span>
          </div>
        </div>
      </div>

      {/* Animated scan circle */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <button onClick={handleScan} className="relative flex items-center justify-center active:scale-95 transition-transform">
          {/* Rotating outer dashed ring */}
          <svg
            width="200" height="200"
            style={{ transform: `rotate(${rotation}deg)`, position: "absolute" }}
          >
            <circle
              cx="100" cy="100" r="90"
              fill="none"
              stroke={accentColor}
              strokeWidth="2"
              strokeDasharray="15 10"
              strokeOpacity="0.5"
            />
          </svg>
          {/* Static outer ring */}
          <div
            className="w-[200px] h-[200px] rounded-full absolute"
            style={{ border: `1px solid ${accentColor}22` }}
          />
          {/* Inner circle */}
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center z-10"
            style={{
              border: `2px solid ${accentColor}cc`,
              background: `${accentColor}18`,
              boxShadow: scanning ? `0 0 20px ${accentColor}88` : "none",
            }}
          >
            {scanning ? (
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${accentColor}`, borderTopColor: "transparent" }} />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.8">
                <path d="M3 7v3a1 1 0 001 1h1M3 7V5a1 1 0 011-1h2M21 7v3a1 1 0 01-1 1h-1M21 7V5a1 1 0 00-1-1h-2M3 17v2a1 1 0 001 1h2M21 17v2a1 1 0 01-1 1h-2" />
                <rect x="7" y="9" width="10" height="8" rx="1" />
              </svg>
            )}
          </div>
        </button>

        {/* Scan result */}
        {scanResult && (
          <div
            className="px-4 py-2 rounded-full"
            style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}88` }}
          >
            <p className="text-white font-semibold text-sm">{scanResult}</p>
          </div>
        )}
        {scanning && (
          <p className="text-white/50 text-sm">Analyzing chart...</p>
        )}
        {!scanning && !scanResult && (
          <p className="font-semibold text-base" style={{ color: accentColor }}>
            Tap circle to scan
          </p>
        )}
      </div>

      {/* Upload section */}
      <div className="px-4 pb-2">
        <p className="text-center font-semibold text-base mb-3" style={{ color: accentColor }}>
          Upload your MT5 chart
        </p>
        <div className="flex gap-3 mb-2">
          <button
            onClick={handleScan}
            className="flex-1 flex flex-col items-center justify-center py-5 rounded-2xl gap-2 active:scale-95 transition-transform"
            style={{ border: `2px dashed ${accentColor}99`, background: `${accentColor}11` }}
          >
            <Camera size={28} style={{ color: accentColor }} />
            <span className="text-white text-sm font-medium">Camera</span>
          </button>
          <button
            onClick={handleScan}
            className="flex-1 flex flex-col items-center justify-center py-5 rounded-2xl gap-2 active:scale-95 transition-transform"
            style={{ border: `2px dashed ${accentColor}99`, background: `${accentColor}11` }}
          >
            <Upload size={28} style={{ color: accentColor }} />
            <span className="text-white text-sm font-medium">Upload</span>
          </button>
        </div>
        <p className="text-center text-white/35 text-xs">Take a screenshot of your MT5 chart or upload</p>
      </div>

      {/* Bottom nav strip */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-end justify-around"
        style={{ height: 75, background: "linear-gradient(to top, #000 70%, transparent)", paddingBottom: 12, paddingLeft: 8, paddingRight: 8 }}
      >
        <div className="flex-1" />
        <div className="flex flex-col items-center" style={{ marginTop: -28 }}>
          <button
            onClick={onClose}
            className="w-[62px] h-[62px] rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform"
            style={{
              background: `radial-gradient(circle at center, ${accentColor}33 0%, ${accentColor}11 60%, #000 100%)`,
              boxShadow: `0 0 20px ${accentColor}bb, 0 0 40px ${accentColor}44`,
              border: `1.5px solid ${accentColor}cc`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: accentColor, marginTop: 2 }}>Home</span>
          </button>
        </div>
        <div className="flex-1" />
      </div>

      {/* Floating bot avatar */}
      <div className="absolute z-20" style={{ bottom: 88, right: 14 }}>
        <div className="relative">
          <div className="w-[46px] h-[46px] rounded-full overflow-hidden"
            style={{ border: `2px solid ${accentColor}cc`, boxShadow: `0 0 12px ${accentColor}66` }}>
            <img src={eaLogo} alt="Bot" className="w-full h-full object-cover" />
          </div>
          <div className="absolute top-0 right-0 w-3 h-3 rounded-full" style={{ background: accentColor, border: "1.5px solid #000" }} />
        </div>
      </div>
    </div>
  );
}
