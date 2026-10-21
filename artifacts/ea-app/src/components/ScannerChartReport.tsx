import { ArrowDown, ArrowRight, ArrowUp, ChartNoAxesCombined, ClipboardList, Coins, Crosshair, Layers3, Minus, Settings2, Shield, Target, Waves } from "lucide-react";
import type { ChartReport, ScannerRecord } from "@/lib/scanner";
import { formatLots, type ScannerTradeSettings } from "@/lib/scanner-trade-settings";
import { formatScannerPrice } from "@/lib/scanner-format";
import { isDirectionalReport, directionalLabel, confidenceLabel, formatRiskReward } from "@/lib/scanner-report-view";
import ScannerTradeAction from "./ScannerTradeAction";
import "./ScannerChartReport.css";

interface Props { clientToken?: string | null; onSettingsSaved?: (settings: ScannerTradeSettings) => void; record: ScannerRecord; settings: ScannerTradeSettings; onEditSettings: () => void }
export default function ScannerChartReport({ record, settings, onEditSettings, clientToken, onSettingsSaved }: Props) {
  const report = record.report as ChartReport;
  const details = isDirectionalReport(report) ? report : null;
  const direction = report.signal === "BUY" ? "buy" : report.signal === "SELL" ? "sell" : "no-trade";
  const DirectionIcon = direction === "buy" ? ArrowUp : direction === "sell" ? ArrowDown : Minus;
  const isGold = report.symbol?.toUpperCase() === "XAUUSD";
  const metadata = [isGold ? "Gold" : null, report.timeframe, record.strategy].filter(Boolean).join(" · ");
  const date = new Date(record.createdAt);
  return <div className={`scanner-chart-result scanner-chart-result--${direction}`}>
    <article className="scanner-chart-card" aria-label="AI chart analysis report">
      <header className="scanner-result-header"><span className="scanner-asset-icon">{isGold ? <Coins size={23} /> : <ChartNoAxesCombined size={23} />}</span><div><h3>{report.symbol || "Unidentified chart"}</h3><p>{metadata || "Chart analysis"}</p></div><div className="scanner-result-status"><time dateTime={record.createdAt}>{date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time><span>Report saved</span></div></header>
      <div className="scanner-result-overview"><div className="scanner-result-signal"><span><DirectionIcon size={25} /></span><div><small>Directional bias</small><h3>{directionalLabel(report)}</h3></div></div><div className="scanner-confidence"><div><h4>Confidence</h4><p>{details?.confidence !== null && details ? "Uncalibrated AI estimate" : "Uncalibrated"}</p><small>Not a verified win probability</small></div><span className="scanner-confidence-ring" aria-label={`Directional confidence: ${confidenceLabel(report)}`}>{details?.confidence != null ? `${details.confidence}%` : "—"}</span></div></div>
      <div className="scanner-eligibility"><strong>NOT EXECUTABLE</strong><span>{details?.marketStatus === "closed" ? "Market reported closed" : "Live market unverified"}</span></div>
      {details && <p className="scanner-confidence-explanation">{details.confidenceReason || "Directional confidence is uncalibrated."}</p>}
      <p className="scanner-level-caption">Chart reference levels · not live quotes</p>
      {details?.levelAssessment && details.levelAssessment.code !== "CHART_LEVELS_RETAINED" && <p className="scanner-result-limitations">{details.levelsUnavailableReason || ({
        PROVIDER_LEVELS_MISSING: "The AI omitted trading levels; a complete chart setup was not returned.",
        PROVIDER_LEVELS_NULL: "The AI could not establish a complete setup from this chart.",
        PROVIDER_LEVELS_PARTIAL: "The AI returned an incomplete setup; all three supported levels are required.",
        PRICE_SCALE_MISSING: "Readable price-axis evidence was not returned. Include the price scale in your screenshot.",
        PRICE_SCALE_INVALID: "The returned chart price scale was inconsistent.",
        LEVEL_OUTSIDE_VISIBLE_SCALE: "Proposed levels fell outside the readable chart price scale.",
        UNSUPPORTED_PRICE_PRECISION: "Proposed prices used precision unsupported by the chart scale.",
      } as Record<string, string>)[details.levelAssessment.code]} <small>({details.levelAssessment.code})</small></p>}
      <div className="scanner-result-levels">{[{ label: "Entry", value: report.entry, Icon: Crosshair, tone: "entry" }, { label: "Take Profit", value: report.takeProfit, Icon: Target, tone: "profit" }, { label: "Stop Loss", value: report.stopLoss, Icon: Shield, tone: "loss" }].map(({ label, value, Icon, tone }) => <div className={`scanner-result-level scanner-result-level--${tone}`} key={label}><span><Icon size={14} />{label}</span><strong>{formatScannerPrice(value)}</strong></div>)}</div>
      {details?.riskRewardRatio != null && <p className="scanner-risk-reward">Reference risk / reward (target ≥ 1:2) <strong>1 : {formatRiskReward(details.riskRewardRatio)}</strong></p>}
      <section className="scanner-analysis-report" aria-labelledby="scanner-analysis-report-title"><header><h4 id="scanner-analysis-report-title"><ClipboardList size={14} /> AI Analysis Report</h4>{record.strategy && <span>{record.strategy} strategy</span>}</header><p>{report.reasoning}</p>{details && <dl className="scanner-analysis-details">{([
        ["Market structure", details.analysis.marketStructure], ["Trend direction", details.analysis.trendDirection],
        ["Liquidity sweeps", details.analysis.liquiditySweeps], ["Support & resistance", details.analysis.supportResistance],
        ["Entry reasoning", details.analysis.entryReasoning], ["Risks & invalidation", details.analysis.risksInvalidation], ["Supply & demand", details.analysis.supplyDemand ?? null],
      ]).map(([title, text]) => <div key={title}><dt>{title}</dt><dd>{text || "Not established from this chart."}</dd></div>)}</dl>}</section>
      {Boolean(report.evidenceTags?.length) && <ul className="scanner-evidence-tags" aria-label="AI observations">{report.evidenceTags!.map(tag => <li key={tag}><Waves size={11} />{tag}</li>)}</ul>}
      <p className="scanner-result-limitations">{report.limitations || "Live prices, market session and order execution have not been verified."}</p>
    </article>
    <ScannerTradeAction record={record} settings={settings} clientToken={clientToken} onSettingsSaved={onSettingsSaved} />
    <button type="button" className="scanner-result-parameters" onClick={onEditSettings}><Settings2 size={14} /><span>{settings.positions} {settings.positions === 1 ? "position" : "positions"} × {formatLots(settings.lotUnits)} lots</span><Layers3 size={14} /></button>
  </div>;
}
