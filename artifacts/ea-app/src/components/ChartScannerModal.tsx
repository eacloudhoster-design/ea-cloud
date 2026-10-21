import { useRef, useState } from "react";
import { X, Camera, Upload, Sparkles, Settings, History, ChartNoAxesCombined, Globe, ChevronDown, Plus, Minus, ScanLine, LoaderCircle, ShieldAlert } from "lucide-react";
import { eaLogo } from "@/lib/branding";

interface ChartScannerModalProps { onClose: () => void }
type Signal = { symbol: string; timeframe: string; signal: "BUY" | "SELL" | "NO TRADE"; entry?: number; stopLoss?: number; takeProfit?: number; confidence?: number; reasoning: string; riskReward?: number };
const strategies = ["Auto", "SMC", "ICT", "Price Action", "Supply/Demand", "Indicators"];
const presets = [0.01, 0.05, 0.1, 0.5, 1];
const red = "#ff443f";
export default function ChartScannerModal({ onClose }: ChartScannerModalProps) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState("Auto");
  const [stage, setStage] = useState<"ready" | "scanning" | "result">("ready");
  const [signal, setSignal] = useState<Signal | null>(null);
  const [error, setError] = useState("");
  const [tradeSettings, setTradeSettings] = useState(false);
  const [lots, setLots] = useState(0.01);
  const [positions, setPositions] = useState(1);
  const [history, setHistory] = useState<Signal[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [fundamentalEvent, setFundamentalEvent] = useState("CPI");
  const [showFundamental, setShowFundamental] = useState(false);
  const selectFile = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 10 * 1024 * 1024) { setError("Choose an image smaller than 10 MB."); return; }
    if (image) URL.revokeObjectURL(image);
    setFile(f); setImage(URL.createObjectURL(f)); setSignal(null); setError(""); setStage("ready");
  };
  const analyze = async () => {
    if (!file) return;
    setStage("scanning"); setError("");
    try {
      const form = new FormData(); form.append("image", file); form.append("strategy", strategy);
      const response = await fetch("/api/chart-scanner/analyze", { method: "POST", body: form, credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404 ? "AI analysis is not configured yet. The secure Gemini backend must be connected." : "Chart analysis failed. Please try again.");
      const result = await response.json() as Signal;
      if (!result || !["BUY", "SELL", "NO TRADE"].includes(result.signal) || !result.reasoning || !result.symbol || !result.timeframe) throw new Error("AI returned an incomplete analysis.");
      setSignal(result); setHistory(h => [result, ...h]); setStage("result");
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); setStage("ready"); }
  };
  const pill = (active: boolean) => ({ border: "1px solid " + (active ? red : "#444"), background: active ? "#300e0e" : "#151515", color: active ? red : "#ccc" });
  return <div className="absolute inset-0 overflow-y-auto bg-black text-white" style={{ paddingBottom: 110 }}>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-red-950 bg-[#170909]/95 px-5 py-5 backdrop-blur">
      <div className="flex items-center gap-3"><button onClick={onClose} aria-label="Close scanner"><X color={red}/></button><img src={eaLogo} alt="EA Cloud" className="h-9 w-9 rounded-full border border-red-500 object-cover"/><strong className="text-xl">AI Scanner</strong></div>
      <span className="rounded-full border border-red-900 px-3 py-1 text-xs text-red-400">EA CLOUD</span>
    </header>
    <main className="mx-auto max-w-xl space-y-6 px-5 pt-6">
      <section className="relative overflow-hidden rounded-3xl border border-red-900/60 bg-gradient-to-b from-[#330b0b] via-[#150707] to-black p-6 text-center">
        <div className="relative mx-auto mb-5 flex h-44 w-44 items-center justify-center">
          <div className={`absolute inset-0 rounded-full border border-red-500/40 ${stage === "scanning" ? "animate-ping" : ""}`}/>
          <div className={`absolute inset-3 rounded-full border-2 border-dashed border-red-500/60 ${stage === "scanning" ? "animate-spin" : ""}`}/>
          <img src={eaLogo} alt="EA Cloud AI" className="h-28 w-28 rounded-full border-4 border-red-500 object-cover shadow-[0_0_30px_#ff443f66]"/>
        </div>
        <p className="mb-2 text-sm font-bold tracking-wide text-red-400">EA CLOUD AI</p>
        <h2 className="text-2xl font-bold">{stage === "scanning" ? "Analyzing chart..." : stage === "result" ? "Analysis complete" : "Ready to Scan"}</h2>
        <p className="mt-2 text-sm text-gray-400">{stage === "scanning" ? "AI is scanning patterns and price levels" : "Upload a trading chart screenshot or take a photo"}</p>
        {stage === "scanning" && <LoaderCircle className="mx-auto mt-5 animate-spin text-red-500"/>}
        {stage !== "scanning" && <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={() => picker.current?.click()} className="flex items-center justify-center gap-2 rounded-full bg-[#ff443f] px-4 py-3 font-semibold"><Upload size={19}/> Gallery</button>
          <button onClick={() => camera.current?.click()} className="flex items-center justify-center gap-2 rounded-full border border-gray-600 bg-[#242124] px-4 py-3 font-semibold"><Camera size={19}/> Camera</button>
        </div>}
        <input ref={picker} type="file" accept="image/*" className="hidden" onChange={e => selectFile(e.target.files?.[0])}/>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => selectFile(e.target.files?.[0])}/>
      </section>
      {image && <section className="relative overflow-hidden rounded-2xl border border-red-900 bg-[#101010]">
        <img src={image} alt="Uploaded trading chart" className="max-h-80 w-full object-contain"/>
        {stage === "scanning" && <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black/30"><div className="absolute left-0 right-0 top-0 h-1 animate-bounce bg-red-500 shadow-[0_0_24px_#ff443f]"/><div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-red-400"><ScanLine className="mr-2"/> Analyzing...</div></div>}
      </section>}
      <section><h3 className="mb-3 font-semibold">Analysis strategy</h3><div className="flex flex-wrap gap-2">{strategies.map(s => <button key={s} onClick={() => setStrategy(s)} style={pill(strategy === s)} className="rounded-full px-4 py-3 text-sm">{s}</button>)}</div></section>
      <section className="rounded-2xl border border-[#383838] bg-[#111] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><Globe color={red}/> Fundamental Analysis</h3>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-400">Market<select className="mt-2 w-full rounded-lg border border-gray-700 bg-black p-3 text-sm text-white"><option>XAUUSD · Gold</option><option>EURUSD</option><option>GBPUSD</option></select></label>
        <label className="text-xs text-gray-400">News event<select value={fundamentalEvent} onChange={e => setFundamentalEvent(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-black p-3 text-sm text-white">{["CPI","PPI","NFP","FOMC"].map(e => <option key={e}>{e}</option>)}</select></label></div>
        <button onClick={() => setShowFundamental(v => !v)} className="mt-5 w-full rounded-full border border-red-500 bg-red-950/30 py-3 font-semibold"><Globe className="mr-2 inline" size={19}/> Fundamental Analysis</button>
        {showFundamental && <p className="mt-3 rounded-lg bg-black p-3 text-sm text-gray-300">Analysis for {fundamentalEvent} is only available on its verified release date. Economic calendar and live news integration are not configured yet; no market direction can be responsibly provided.</p>}
      </section>
      {image && stage === "ready" && <button onClick={analyze} className="flex w-full items-center justify-center gap-3 rounded-full bg-[#ff443f] py-5 text-lg font-bold"><ScanLine/> Analyze Chart</button>}
      {error && <p role="alert" className="rounded-xl border border-red-700 bg-red-950/30 p-4 text-sm text-red-300"><ShieldAlert className="mr-2 inline" size={18}/>{error}</p>}
      {stage === "result" && signal && <section className="space-y-4 rounded-3xl border border-red-900 bg-gradient-to-b from-[#271010] to-[#101010] p-5">
        <div className="flex items-center justify-between"><div><p className="text-xs text-red-400">EA CLOUD AI SIGNAL</p><h3 className="text-2xl font-bold">{signal.symbol} · {signal.timeframe}</h3></div><span className="rounded-lg px-3 py-2 font-bold" style={{background:signal.signal === "BUY" ? "#065f46" : signal.signal === "SELL" ? "#7f1d1d" : "#333"}}>{signal.signal}</span></div>
        {signal.signal !== "NO TRADE" && <div className="grid grid-cols-3 gap-2">{[["ENTRY",signal.entry],["TAKE PROFIT",signal.takeProfit],["STOP LOSS",signal.stopLoss]].map(([label,value],i)=><div key={String(label)} className="rounded-xl border border-white/10 bg-black/50 p-3 text-center"><p className="text-[10px] text-gray-400">{label}</p><p className={`mt-2 text-sm font-bold ${i===1?"text-green-400":i===2?"text-red-400":"text-white"}`}>{typeof value === "number" ? value : "—"}</p></div>)}</div>}
        <div className="flex justify-between text-sm"><span>Confidence estimate: {signal.confidence ?? "—"}%</span><span>R:R {signal.riskReward ?? "—"}</span></div>
        <div className="rounded-xl bg-black/50 p-4"><h4 className="mb-2 font-bold">Why This Trade?</h4><p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{signal.reasoning}</p></div>
        {signal.signal !== "NO TRADE" && <button onClick={() => setTradeSettings(true)} className="w-full rounded-full bg-[#ff443f] py-4 text-lg font-bold">EXECUTE TRADE</button>}
      </section>}
      <section><button onClick={() => setShowHistory(v => !v)} className="flex w-full items-center justify-between border-b border-gray-800 py-4 font-semibold"><span className="flex items-center gap-2"><History color={red}/> Scan History ({history.length})</span><ChevronDown/></button>{showHistory && <div className="space-y-2 pt-3">{history.length ? history.map((h,i)=><button key={i} onClick={() => {setSignal(h);setStage("result")}} className="w-full rounded-xl bg-[#171717] p-3 text-left text-sm">{h.symbol} · {h.timeframe} — {h.signal}</button>) : <p className="text-sm text-gray-400">No scans this session. Persistent history requires backend integration.</p>}</div>}</section>
    </main>
    {tradeSettings && signal && <div className="fixed inset-0 z-50 flex items-end bg-black/80"><div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-red-900 bg-[#151517] p-6"><div className="mb-6 flex justify-between"><h3 className="text-2xl font-bold">Trade Settings</h3><button onClick={() => setTradeSettings(false)} aria-label="Close trade settings"><X/></button></div>
      <p className="mb-2 text-sm text-gray-400">LOT SIZE</p><div className="flex items-center justify-between rounded-xl bg-[#252527] p-3"><button onClick={() => setLots(v => Math.max(0.01,Math.round((v-0.01)*100)/100))}><Minus/></button><strong className="text-2xl">{lots.toFixed(2)}</strong><button onClick={() => setLots(v => Math.round((v+0.01)*100)/100)}><Plus/></button></div>
      <div className="my-3 flex gap-2">{presets.map(p=><button key={p} onClick={()=>setLots(p)} className="flex-1 rounded-lg p-2 text-xs" style={pill(lots===p)}>{p}</button>)}</div>
      <p className="mb-2 mt-6 text-sm text-gray-400">TRADES PER SIGNAL</p><div className="flex items-center justify-between rounded-xl bg-[#252527] p-3"><button onClick={()=>setPositions(v=>Math.max(1,v-1))}><Minus/></button><strong className="text-2xl">{positions}</strong><button onClick={()=>setPositions(v=>Math.min(20,v+1))}><Plus/></button></div>
      <div className="my-3 flex gap-2">{[1,2,3,5,10].map(p=><button key={p} onClick={()=>setPositions(p)} className="flex-1 rounded-lg p-2 text-sm" style={pill(positions===p)}>{p}</button>)}</div>
      <p className="mt-5 rounded-xl border border-red-950 bg-red-950/20 p-4 text-center text-sm">Each signal places <strong className="text-red-400">{positions} trades × {lots.toFixed(2)} lots</strong></p>
      <button disabled className="mt-5 w-full rounded-full bg-gray-700 py-4 font-bold text-gray-300">Connect MT5 to execute trades</button><p className="mt-2 text-center text-xs text-gray-400">Real order execution is unavailable until a secure MT5 connection and execution backend are verified.</p>
    </div></div>}
  </div>;
}
