import { ArrowDownRight, ArrowUpRight, Crosshair, Shield, Target } from "lucide-react";
import type { ChartReport, ScannerRecord } from "@/lib/scanner";
import type { ScannerTradeSettings } from "@/lib/scanner-trade-settings";
import { formatScannerPrice } from "@/lib/scanner-format";
import ScannerTradeAction from "./ScannerTradeAction";
import "./ScannerChartReport.css";

interface Props { historical?: boolean; clientToken?: string | null; onSettingsSaved?: (settings: ScannerTradeSettings) => void; record: ScannerRecord; settings: ScannerTradeSettings; onEditSettings: () => void }
export default function ScannerChartReport({ record, settings, clientToken, onSettingsSaved }: Props) {
  const report = record.report as ChartReport;
  const buy = report.signal === "BUY", directional = buy || report.signal === "SELL";
  const asset = report.symbol?.toUpperCase() === "XAUUSD" ? "GOLD" : report.symbol?.toUpperCase() === "XAGUSD" ? "SILVER" : "";
  const confidence = "confidence" in report ? report.confidence : null;
  const Icon = buy ? ArrowUpRight : ArrowDownRight;
  // Display only a short excerpt; never mutate the original saved reasoning.
  const analysis = report.reasoning.trim().split(/\s+/).slice(0, 36).join(" ");
  return <article className={`scanner-chart-result scanner-terminal-signal ${buy ? "is-buy" : "is-sell"}`} aria-label="Trading signal">
    <header className="terminal-signal-header"><h3>{report.symbol || "—"}{asset && <span> — {asset}</span>}</h3><div><span>Timeframe: <b>{report.timeframe || "—"}</b></span><span>Strategy: <b>{record.strategy || "—"}</b></span></div></header>
    <section className="terminal-signal-direction"><span className="terminal-eyebrow">DIRECTIONAL BIAS</span><div><Icon size={36} aria-hidden="true" /><h4>{directional ? `${report.signal}${asset ? ` ${asset}` : ""}` : "Archived analysis"}</h4></div><p>Confidence: <strong>{confidence == null ? "—" : `${confidence}%`}</strong></p></section>
    <div className="terminal-price-grid">{[{label:"ENTRY",value:report.entry,Icon:Crosshair,tone:"entry"},{label:"STOP LOSS",value:report.stopLoss,Icon:Shield,tone:"stop"},{label:"TAKE PROFIT",value:report.takeProfit,Icon:Target,tone:"target"}].map(({label,value,Icon:PriceIcon,tone})=><section className={`terminal-price terminal-price--${tone}`} key={label}><span><PriceIcon size={14} aria-hidden="true" />{label}</span><strong>{formatScannerPrice(value)}</strong></section>)}</div>
    <section className="terminal-trade-analysis"><h4>TRADE ANALYSIS</h4><p>{analysis}{report.reasoning.trim().split(/\s+/).length > 36 ? "…" : ""}</p></section>
    <ScannerTradeAction record={record} settings={settings} clientToken={clientToken} onSettingsSaved={onSettingsSaved} />
  </article>;
}
