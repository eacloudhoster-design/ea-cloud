import { ArrowDown, ArrowRight, ArrowUp, ChartNoAxesCombined, ClipboardList, Coins, Crosshair, Layers3, Minus, Settings2, Shield, Target, Waves } from "lucide-react";
import type { ChartReport, ScannerRecord } from "@/lib/scanner";
import { formatLots, type ScannerTradeSettings } from "@/lib/scanner-trade-settings";
import { formatScannerPrice } from "@/lib/scanner-format";
import "./ScannerChartReport.css";

interface Props { record: ScannerRecord; settings: ScannerTradeSettings; onEditSettings: () => void }
export default function ScannerChartReport({ record, settings, onEditSettings }: Props) {
  const report = record.report as ChartReport;
  const direction = report.signal === "BUY" ? "buy" : report.signal === "SELL" ? "sell" : "no-trade";
  const DirectionIcon = direction === "buy" ? ArrowUp : direction === "sell" ? ArrowDown : Minus;
  const isGold = report.symbol?.toUpperCase() === "XAUUSD";
  const metadata = [isGold ? "Gold" : null, report.timeframe, record.strategy].filter(Boolean).join(" · ");
  const date = new Date(record.createdAt);
  return <div className={`scanner-chart-result scanner-chart-result--${direction}`}>
    <article className="scanner-chart-card" aria-label="AI chart analysis report">
      <header className="scanner-result-header"><span className="scanner-asset-icon">{isGold ? <Coins size={23} /> : <ChartNoAxesCombined size={23} />}</span><div><h3>{report.symbol || "Unidentified chart"}</h3><p>{metadata || "Chart analysis"}</p></div><div className="scanner-result-status"><time dateTime={record.createdAt}>{date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time><span>Report saved</span></div></header>
      <div className="scanner-result-overview"><div className="scanner-result-signal"><span><DirectionIcon size={25} /></span><div><small>AI suggestion</small><h3>{report.signal}</h3></div></div><div className="scanner-confidence"><div><h4>Confidence</h4><p>Not calibrated</p><small>No win-rate estimate</small></div><span className="scanner-confidence-ring" aria-label="Confidence has not been calibrated">—</span></div></div>
      <div className="scanner-result-levels">{[{ label: "Entry", value: report.entry, Icon: Crosshair, tone: "entry" }, { label: "Take Profit", value: report.takeProfit, Icon: Target, tone: "profit" }, { label: "Stop Loss", value: report.stopLoss, Icon: Shield, tone: "loss" }].map(({ label, value, Icon, tone }) => <div className={`scanner-result-level scanner-result-level--${tone}`} key={label}><span><Icon size={14} />{label}</span><strong>{formatScannerPrice(value)}</strong></div>)}</div>
      <section className="scanner-analysis-report" aria-labelledby="scanner-analysis-report-title"><header><h4 id="scanner-analysis-report-title"><ClipboardList size={14} /> AI Analysis Report</h4>{record.strategy && <span>{record.strategy} strategy</span>}</header><p>{report.reasoning}</p></section>
      {Boolean(report.evidenceTags?.length) && <ul className="scanner-evidence-tags" aria-label="AI observations">{report.evidenceTags!.map(tag => <li key={tag}><Waves size={11} />{tag}</li>)}</ul>}
      <p className="scanner-result-limitations">{report.limitations}</p>
    </article>
    <button className="scanner-result-execute" type="button" disabled aria-describedby="scanner-result-execution-note"><ChartNoAxesCombined size={20} /> Execute Trade <ArrowRight size={20} /></button>
    <p id="scanner-result-execution-note" className="scanner-result-execution-note">{report.signal === "NO TRADE" ? "No actionable trade. " : ""}MT5 scanner execution is unavailable. No order was submitted.</p>
    <button type="button" className="scanner-result-parameters" onClick={onEditSettings}><Settings2 size={14} /><span>{settings.positions} {settings.positions === 1 ? "position" : "positions"} × {formatLots(settings.lotUnits)} lots</span><Layers3 size={14} /></button>
  </div>;
}
