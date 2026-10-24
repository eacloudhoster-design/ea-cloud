import {assistantEvent} from "@/lib/assistant-events";
import { X, Camera, ImagePlus, Settings2, Globe2, History, ScanLine, ArrowUpRight, RotateCcw, ShieldCheck, LoaderCircle, Trash2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback, type CSSProperties, type ChangeEvent } from "react";
import { useApp, type Tab } from "@/context/AppContext";
import ScannerMentorMark from "./ScannerMentorMark";
import { confidenceLabel } from "@/lib/scanner-report-view";
import { formatScannerPrice } from "@/lib/scanner-format";
import BottomNav from "@/components/BottomNav";
import ScannerTradeSettings from "@/components/ScannerTradeSettings";
import ScannerChartReport from "@/components/ScannerChartReport";
import { formatLots, type ScannerTradeSettings as TradeSettings } from "@/lib/scanner-trade-settings";
import { prepareChart, ScannerRequestError, scannerErrorTitle, scannerRequest, strategies, type Strategy, type ScannerRecord, type ChartReport, type FundamentalReport, type FundamentalRequest } from "@/lib/scanner";
import { directionalLabel } from "@/lib/scanner-report-view";
import "./ChartScannerModal.css";

interface ChartScannerModalProps { onClose: () => void; onNavigate: (tab: Tab) => void }
type Phase = "idle" | "preparing" | "chart" | "fundamental";
const formatDate = (date: string) => new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function ScannerOrb() {
  return <div className="scanner-orb"><div className="scanner-orbit scanner-orbit-one" /><div className="scanner-orbit scanner-orbit-two" /><ScannerMentorMark className="scanner-orb-avatar" /></div>;
}

export default function ChartScannerModal({ onClose, onNavigate }: ChartScannerModalProps) {
  const { bgImageUrl, eaName, clientToken, accentColor, voice } = useApp();
  const [strategy, setStrategy] = useState<Strategy>("SMC");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [records, setRecords] = useState<ScannerRecord[]>([]);
  const [historyError, setHistoryError] = useState<Error | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [result, setResult] = useState<ScannerRecord | null>(null);
  const [context, setContext] = useState<FundamentalRequest>({ market: "XAUUSD", focus: "General market", outlook: "Next 1–3 days" });
  const [tradeSettings, setTradeSettings] = useState<TradeSettings>({ lotUnits: 1, positions: 1 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDivElement>(null), scanArea = useRef<HTMLElement>(null), chartArea = useRef<HTMLElement>(null), results = useRef<HTMLDivElement>(null);
  const attempt = useRef<AbortController | null>(null), historyAttempt = useRef<AbortController | null>(null);
  const selection = useRef(0), alive = useRef(true), pending = useRef(false);
  const lastKind = useRef<"chart" | "fundamental" | null>(null);
  const busy = phase !== "idle";
  const scanning = phase === "chart" || phase === "fundamental";

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { alive.current = false; selection.current++; attempt.current?.abort(); historyAttempt.current?.abort(); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const loadHistory = useCallback(async (page = 1) => {
    historyAttempt.current?.abort();
    const controller = new AbortController(); historyAttempt.current = controller;
    if (!clientToken) return;
    setHistoryLoading(true); setHistoryError(null);
    try {
      const data = await scannerRequest<{ records: ScannerRecord[]; hasMore: boolean }>(`history?page=${page}`, clientToken, controller.signal);
      if (!controller.signal.aborted) { setRecords(old => page === 1 ? data.records : [...old, ...data.records.filter(row => !old.some(item => item.id === row.id))]); setHasMore(data.hasMore); setHistoryPage(page); }
    } catch (e) { if (!controller.signal.aborted) setHistoryError(e as Error); }
    finally { if (!controller.signal.aborted) setHistoryLoading(false); }
  }, [clientToken]);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setRecords([]); setResult(null); setFile(null);
    setSettingsOpen(false); setSettingsSaved(false); setTradeSettings({ lotUnits: 1, positions: 1 });
    attempt.current?.abort(); selection.current++; setPhase("idle"); pending.current = false;
    if (clientToken) {
      void scannerRequest<{ configured: boolean }>("status", clientToken, controller.signal).then(data => { if (!controller.signal.aborted) void data; }).catch(e => { if (!controller.signal.aborted) setError(e as Error); });
      void loadHistory();
    }
    return () => controller.abort();
  }, [clientToken, loadHistory]);
  const cancel = () => { selection.current++; attempt.current?.abort(); pending.current = false; setPhase("idle"); };
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]; event.target.value = "";
    if (!chosen) return;
    cancel(); lastKind.current = null; const current = ++selection.current; setPhase("preparing"); setError(null); setResult(null); setFile(null);
    try { const prepared = await prepareChart(chosen); if (alive.current && current === selection.current) setFile(prepared); }
    catch (e) { if (alive.current && current === selection.current) setError(e as Error); }
    finally { if (alive.current && current === selection.current) setPhase("idle"); }
  };
  const analyse = async (kind: "chart" | "fundamental") => {
    if (!clientToken || busy || pending.current || (kind === "chart" && !file)) return;
    pending.current = true; lastKind.current = kind;
    attempt.current?.abort(); const controller = new AbortController(); attempt.current = controller;
    setPhase(kind); setError(null); setResult(null);
    assistantEvent({type:"scan-start",kind});
    requestAnimationFrame(() => (kind === "chart" ? chartArea.current : scanArea.current)?.scrollIntoView({ block: kind === "chart" ? "start" : "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
    try {
      let init: RequestInit;
      if (kind === "chart") { const body = new FormData(); body.append("image", file!); body.append("strategy", strategy); init = { method: "POST", body }; }
      else init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context) };
      const saved = await scannerRequest<ScannerRecord>(kind === "chart" ? "chart" : "fundamentals", clientToken, controller.signal, init);
      if (!controller.signal.aborted) { assistantEvent({type:"scan-complete",record:saved}); setResult(saved); setHistorical(false); void loadHistory(); requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
    } catch (e) { if (!controller.signal.aborted) { setError(e as Error); assistantEvent({type:"scan-failed"}); } }
    finally { if (!controller.signal.aborted) { pending.current = false; setPhase("idle"); } }
  };
  const navigate = (tab: Tab) => { cancel(); onNavigate(tab); };
  const chart = result?.kind === "chart" ? result.report as ChartReport : null;
  const fundamental = result?.kind === "fundamental" ? result.report as FundamentalReport : null;

  return <div ref={modal} className="scanner-screen" style={{ "--scanner-accent": accentColor } as CSSProperties} role="dialog" aria-modal="true" aria-labelledby="scanner-title" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); if (busy) cancel(); else onClose(); }
    if (event.key === "Tab") {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="file"]),select:not(:disabled),summary,a[href]')).filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="scanner-main" inert={settingsOpen}>
    {bgImageUrl && <img className="scanner-background" src={bgImageUrl} alt="" />}
    <div className="scanner-shade" />
    <header className="scanner-header">
      <button className="scanner-icon-button" type="button" aria-label="Close scanner" onClick={onClose}><X size={23} /></button>
      <ScannerMentorMark className="scanner-header-avatar" />
      <h2 id="scanner-title">{eaName?.trim() || "Your EA"} <span>Chart Scanner</span></h2>
      <button className="scanner-icon-button" type="button" aria-label="Scanner trade settings" disabled={busy} onClick={() => setSettingsOpen(true)}><Settings2 size={22} /></button>
    </header>
    <div className="scanner-scroll">
      <section ref={chartArea} className={`scanner-ready ${preview ? "scanner-ready--chart" : ""}`} aria-label="Chart upload" aria-busy={busy} hidden={phase === "fundamental"}>
        {preview ? <div className="scanner-chart-preview"><img src={preview} alt="Selected chart to analyse" />{!scanning && <button className="scanner-icon-button" type="button" aria-label="Remove chart" disabled={busy} onClick={() => { setFile(null); setResult(null); setError(null); }}><Trash2 size={18} /></button>}{phase === "chart" && <><div className="scanner-image-scan" aria-hidden="true"><div className="scanner-image-scan-beam" /><div className="scanner-image-scan-label"><ScanLine size={30} /><span>Analyzing...</span></div></div><button className="scanner-preview-cancel" type="button" aria-label="Cancel chart scan" onClick={cancel}>Cancel</button></>}</div> : <ScannerOrb />}
        <input ref={gallery} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" aria-label="Choose chart from gallery" onChange={choose} hidden />
        <input ref={camera} type="file" accept="image/*" capture="environment" aria-label="Take chart photo" onChange={choose} hidden />
        {!scanning && <div className="scanner-upload-copy"><p className="scanner-mentor">{eaName}</p><h3 aria-live="polite">{phase === "preparing" ? "Preparing your chart" : file ? "Your chart is ready" : "Ready to Scan"}</h3><p className="scanner-ready-description">{busy ? "Preparing a clear, optimised chart image." : file ? "Review your image, choose a strategy and analyse." : "Upload a chart screenshot or take a photo"}</p>
          <div className="scanner-upload-actions"><button type="button" className="scanner-primary" disabled={busy} onClick={() => gallery.current?.click()}><ImagePlus size={21} /> Gallery</button><button type="button" className="scanner-glass-button" disabled={busy} onClick={() => camera.current?.click()}><Camera size={21} /> Camera</button></div>
          {file && !busy && <button type="button" className="scanner-analyse" onClick={() => void analyse("chart")}><ScanLine size={18} /> Analyse chart <ArrowUpRight size={17} /></button>}
          {phase === "preparing" && <button type="button" className="scanner-cancel" onClick={cancel}><LoaderCircle size={17} className="scanner-loader" /> Cancel preparation</button>}
        </div>}
      </section>
      {scanning && <section ref={scanArea} className="scanner-pending-analysis is-scanning" aria-label="Analysis progress"><div role="status" aria-live="polite"><ScannerOrb /><p className="scanner-mentor">{eaName}</p><h3>{phase === "chart" ? "Analyzing chart..." : "Analyzing fundamentals..."}</h3><p className="scanner-ready-description">{phase === "chart" ? "AI is scanning patterns and levels" : "AI is researching economic releases and market context"}</p><div className="scanner-analysis-dots" aria-hidden="true">{[0,1,2,3,4].map(i => <span key={i} style={{ animationDelay: `${i * .16}s` }} />)}</div></div><button type="button" className="scanner-cancel" onClick={cancel}><LoaderCircle size={17} className="scanner-loader" /> Cancel analysis</button></section>}
      {error && <div className="scanner-error" role="alert"><strong>{scannerErrorTitle(error)}</strong><p>{error.message}</p>{(!(error instanceof ScannerRequestError) || error.retryable) && <button type="button" onClick={() => lastKind.current ? void analyse(lastKind.current) : gallery.current?.click()} disabled={busy}><RotateCcw size={14} /> Retry</button>}</div>}
      <section className="scanner-strategies" aria-labelledby="scanner-strategies-title"><h3 id="scanner-strategies-title">Analysis strategy</h3><div>{strategies.map(item => <button key={item} type="button" aria-pressed={strategy === item} disabled={busy} onClick={() => setStrategy(item)}>{item}</button>)}</div></section>
      <section className="scanner-fundamentals" aria-labelledby="scanner-fundamentals-title">
        <h3 id="scanner-fundamentals-title"><Globe2 size={22} /> Fundamental Analysis</h3>
        <div className="scanner-fundamental-fields">
          <label>Market<select aria-label="Market" value={context.market} disabled={busy} onChange={e => setContext({ ...context, market: e.target.value as FundamentalRequest["market"] })}>{[["XAUUSD","Gold · XAUUSD"],["EURUSD","Euro · EURUSD"],["GBPUSD","Pound · GBPUSD"],["USDJPY","Yen · USDJPY"],["US100","Nasdaq · US100"],["US30","Dow · US30"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Analysis focus<select aria-label="Analysis focus" value={context.focus} disabled={busy} onChange={e => setContext({ ...context, focus: e.target.value as FundamentalRequest["focus"] })}>{["General market","CPI","PPI","NFP","FOMC"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Outlook<select aria-label="Outlook" value={context.outlook} disabled={busy} onChange={e => setContext({ ...context, outlook: e.target.value as FundamentalRequest["outlook"] })}>{["Intraday","Next 1–3 days","This week"].map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <button type="button" className="scanner-fundamental-action" disabled={busy} onClick={() => void analyse("fundamental")}><Globe2 size={18} /> Fundamental Analysis</button>
        <p>Source-backed context for CPI, PPI, NFP and FOMC. Reports include retrieval time and source links.</p>
      </section>
      <div ref={results} className="scanner-results" aria-live="polite">
        {result && voice && <div className="ea-voice-actions"><button type="button" onClick={() => void voice.replayRecord(result.id)}>Replay analysis</button><button type="button" onClick={voice.stop}>Stop speaking</button></div>}
        {result && chart && <ScannerChartReport clientToken={clientToken} onSettingsSaved={setTradeSettings} record={result} historical={historical} settings={tradeSettings} onEditSettings={() => setSettingsOpen(true)} />}
        {result && fundamental && <article className="scanner-report"><div className="scanner-report-top"><span>{fundamental.context.market} · {fundamental.context.focus}</span><time dateTime={result.createdAt}>{formatDate(result.createdAt)}</time></div><h3>Market outlook</h3><p className="scanner-report-summary">{fundamental.summary}</p><p className="scanner-report-caution">Researched {formatDate(fundamental.asOf)}. This is not a live economic calendar.</p><h4>Sources</h4><ul>{fundamental.sources.map((source,i) => <li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={12} /></a></li>)}</ul><p className="scanner-record-note"><ShieldCheck size={14} /> Saved to your scan history</p></article>}
      </div>
      <section className="scanner-trade-settings" aria-label="Selected trade parameters" hidden={scanning}><div className="scanner-settings-launch"><div><h3>Trade settings</h3><p>{tradeSettings.positions} {tradeSettings.positions === 1 ? "position" : "positions"} · {formatLots(tradeSettings.lotUnits)} lots each</p></div><button type="button" aria-label="Edit trade settings" disabled={busy} onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button></div>{settingsSaved && <p className="scanner-settings-saved" role="status">Trade settings updated.</p>}</section>
      <section className="scanner-history" aria-labelledby="scanner-history-title"><h3 id="scanner-history-title"><History size={21} /> Scan History <button type="button" aria-label="Refresh scan history" disabled={historyLoading} onClick={() => void loadHistory()}><RotateCcw size={17} /></button></h3>
        {historyError ? <p className="scanner-history-error" role="alert">{historyError.message}{(!(historyError instanceof ScannerRequestError) || historyError.retryable) && <button type="button" onClick={() => void loadHistory()}>Retry history</button>}</p> : historyLoading && !records.length ? <p>Loading your saved reports…</p> : !records.length ? <div className="scanner-history-empty"><History size={25} /><p>Your next insight starts here.</p><span>Completed reports will appear in your private history.</span></div> : <div className="scanner-history-list">{records.map(record => <button key={record.id} type="button" onClick={() => { setResult(record); setHistorical(true); requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}><span className="scanner-history-icon">{record.kind === "chart" ? <ScanLine size={19} /> : <Globe2 size={19} />}</span><span><strong>{record.kind === "chart" ? `${(record.report as ChartReport).symbol || "Chart"} · ${directionalLabel(record.report as ChartReport)}` : `${(record.report as FundamentalReport).context.market} · Fundamentals`}</strong><small>{record.kind === "chart" && <>{(record.report as ChartReport).timeframe || "Timeframe unreadable"} · Entry {formatScannerPrice((record.report as ChartReport).entry)} · Confidence {confidenceLabel(record.report as ChartReport)}<br /></>}{formatDate(record.createdAt)}</small></span><ArrowUpRight size={16} /></button>)}</div>}
        {hasMore && <button className="scanner-history-more" type="button" disabled={historyLoading} onClick={() => void loadHistory(historyPage + 1)}>{historyLoading ? "Loading…" : "Load older scans"}</button>}
      </section>

    </div>
    </div>
    {/* Navigation must remain outside the content disabled by Trade Settings. */}
    <div className="scanner-navigation"><BottomNav activeTab="home" onTabChange={navigate} /></div>
    {settingsOpen && <ScannerTradeSettings initial={tradeSettings} onClose={() => setSettingsOpen(false)} onConfirm={value => { setTradeSettings(value); setSettingsSaved(true); setSettingsOpen(false); }} />}
  </div>;
}
