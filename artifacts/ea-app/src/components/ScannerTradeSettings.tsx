import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, ChartNoAxesCombined, Coins, Crosshair, Info, Layers3, Minus, Plus, X } from "lucide-react";
import { adjustLotUnits, formatLots, parseLotUnits, parsePositions, type ScannerTradeSettings as TradeSettings } from "@/lib/scanner-trade-settings";
import { formatScannerPrice } from "@/lib/scanner-format";
import "./ScannerTradeSettings.css";

import type { ScannerPreflight } from "../../../../lib/api-zod/src/scanner-trading";
import type { ChartReport } from "@/lib/scanner";
interface Props { report?: ChartReport; historical?: boolean; mode?: "settings" | "confirmation"; preflight?: ScannerPreflight | null; checking?: boolean; onPreflight?: (settings: TradeSettings) => void; initial: TradeSettings; onConfirm: (settings: TradeSettings) => void; onClose: () => void }
export default function ScannerTradeSettings({ initial, onConfirm, onClose, mode = "settings", report, historical = false, preflight, checking, onPreflight }: Props) {
  const [lot, setLot] = useState(formatLots(initial.lotUnits));
  const [positions, setPositions] = useState(String(initial.positions));
  const dialog = useRef<HTMLDivElement>(null);
  const lotUnits = parseLotUnits(lot), count = parsePositions(positions);
  const valid = lotUnits !== null && count !== null;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  return <div className="scanner-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="scanner-trade-sheet" role="dialog" aria-modal="true" aria-labelledby="scanner-trade-title" aria-describedby="scanner-trade-disclosure"
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key === "Tab") {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input"));
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="scanner-sheet-handle" aria-hidden="true" />
      <header className="scanner-sheet-header"><span className="scanner-sheet-title-icon"><Crosshair size={26} /></span><div><h3 id="scanner-trade-title">{mode === "confirmation" ? "Trade Confirmation" : "Trade Settings"}</h3><p>Configure your trade parameters</p></div><button type="button" className="scanner-sheet-close" aria-label="Close trade settings" onClick={onClose}><X size={23} /></button></header>
      <div className="scanner-sheet-body">
        {mode === "confirmation" && report && <section className="scanner-confirmation-overview" aria-label="Order review">
          <h4>{report.symbol || "Unidentified instrument"} · {report.signal}</h4>
          <dl><div><dt>MT5 account</dt><dd>{preflight?.brokerChecked ? "Authenticated account passed broker check; submission unavailable" : "Connection not verified"}</dd></div>
          <div><dt>Order type</dt><dd>{preflight?.plan.type || "Awaiting live verification"}</dd></div>
          <div><dt>Entry / Stop / Target</dt><dd>{formatScannerPrice(preflight?.plan.entry ?? report.entry)} / {formatScannerPrice(preflight?.plan.stopLoss ?? report.stopLoss)} / {formatScannerPrice(preflight?.plan.takeProfit ?? report.takeProfit)}</dd></div>
          <div><dt>Reference R:R</dt><dd>{"riskRewardRatio" in report && report.riskRewardRatio != null ? `1:${report.riskRewardRatio.toFixed(2)}` : "Unavailable"}</dd></div>
          <div><dt>Estimated monetary risk</dt><dd>Unavailable — broker tick value and account currency required</dd></div></dl>
          <p>{historical ? "Historical reference prices." : "Chart references until live prices are verified."} No order has been submitted.</p>
        </section>}

        <section className="scanner-quantity-card" aria-labelledby="scanner-lot-title">
          <div className="scanner-quantity-heading"><Coins size={25} /><div><h4 id="scanner-lot-title">Lot size</h4><p>Select trade size per position</p></div><span className="scanner-limit"><Info size={15} /><span>Min: 0.01<br />Max: 50.00</span></span></div>
          <div className="scanner-quantity-stepper"><button type="button" aria-label="Decrease lot size" disabled={lotUnits === null || lotUnits === 1} onClick={() => setLot(formatLots(adjustLotUnits(lotUnits!, -1)))}><Minus size={25} /></button><input aria-label="Lot size" aria-invalid={lotUnits === null} aria-describedby={lotUnits === null ? "scanner-lot-error" : undefined} inputMode="decimal" type="text" maxLength={6} value={lot} onChange={event => setLot(event.target.value)} /><button type="button" aria-label="Increase lot size" disabled={lotUnits === null || lotUnits === 5000} onClick={() => setLot(formatLots(adjustLotUnits(lotUnits!, 1)))}><Plus size={25} /></button></div>
          {lotUnits === null && <p id="scanner-lot-error" className="scanner-setting-error">Enter 0.01–50.00 lots, with up to two decimal places.</p>}
          <div className="scanner-quantity-presets">{[1,5,10,50,100].map(units => <button type="button" key={units} aria-label={`Set lot size to ${formatLots(units)}`} aria-pressed={lotUnits === units} onClick={() => setLot(formatLots(units))}>{formatLots(units)}</button>)}</div>
        </section>
        <section className="scanner-quantity-card" aria-labelledby="scanner-positions-title">
          <div className="scanner-quantity-heading"><Layers3 size={25} /><div><h4 id="scanner-positions-title">Trades per signal</h4><p>Number of positions to open</p></div><span className="scanner-limit"><Info size={15} /><span>Min: 1<br />Max: 20</span></span></div>
          <div className="scanner-quantity-stepper"><button type="button" aria-label="Decrease positions" disabled={count === null || count === 1} onClick={() => setPositions(String(count! - 1))}><Minus size={25} /></button><input aria-label="Positions" aria-invalid={count === null} aria-describedby={count === null ? "scanner-positions-error" : undefined} type="text" inputMode="numeric" maxLength={2} value={positions} onChange={event => setPositions(event.target.value)} /><button type="button" aria-label="Increase positions" disabled={count === null || count === 20} onClick={() => setPositions(String(count! + 1))}><Plus size={25} /></button></div>
          {count === null && <p id="scanner-positions-error" className="scanner-setting-error">Enter a whole number from 1 to 20.</p>}
          <div className="scanner-quantity-presets">{[1,2,3,5,10].map(value => <button key={value} type="button" aria-label={`Set positions to ${value}`} aria-pressed={count === value} onClick={() => setPositions(String(value))}>{value}</button>)}</div>
        </section>
        <div className="scanner-settings-summary" aria-live="polite"><ChartNoAxesCombined size={25} /><div><span>Selected parameters</span><strong>{valid ? `${count} ${count === 1 ? "trade" : "trades"} × ${formatLots(lotUnits)} lots` : "Check your trade parameters"}</strong></div></div>
        <button type="button" className="scanner-confirm-settings" disabled={!valid || checking} onClick={() => { if (valid) { const value = { lotUnits, positions: count }; if (mode === "confirmation") onPreflight?.(value); else onConfirm(value); } }}><Activity size={22} /><span>{mode === "confirmation" ? checking ? "Checking broker…" : "Check broker & refresh quote" : "Confirm settings"}</span><ArrowRight size={24} /></button>
        {mode === "confirmation" && <><p className="scanner-settings-disclosure">{preflight?.plan.type ?? "Signal type awaits verified quotes"} · Minimum target R:R 1:2. A quote/check is read-only, not an order.</p>{preflight && <p className="scanner-settings-disclosure">Entry {formatScannerPrice(preflight.plan.entry)} · Stop {formatScannerPrice(preflight.plan.stopLoss)} · Target {formatScannerPrice(preflight.plan.takeProfit)} · Execution R:R {preflight.plan.riskRewardRatio == null ? "Unavailable" : `1:${preflight.plan.riskRewardRatio.toPrecision(3)}`}. Refresh after editing quantities.</p>}<button type="button" className="scanner-confirm-settings" disabled>Confirm order — MT5 submission unavailable</button></>}
        <p id="scanner-trade-disclosure" className="scanner-settings-disclosure">Settings only. MT5 scanner execution is unavailable; no order will be submitted. Broker limits must be verified before live trading.</p>
      </div>
    </div>
  </div>;
}
