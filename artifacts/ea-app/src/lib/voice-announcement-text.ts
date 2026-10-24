import { cleanText, executionSpeech, speakSymbol } from "./assistant-text";
import type { Mt5ConnectionOutcome } from "./assistant-events";
const validPrice = (price: unknown): price is number => typeof price === "number" && Number.isFinite(price) && price > 0;
/** Preserve decimal prices (including small FX/crypto values) without exponential notation. */
export function spokenPrice(price: number) {
  return price.toLocaleString("en-US", { maximumSignificantDigits: 21, useGrouping: true });
}
export function scannerAnnouncement(record: any) {
  if (record?.kind === "fundamental") return "Fundamental analysis completed.";
  if (record?.kind !== "chart" || !record.report) return null;
  const report = record.report;
  const { signal, symbol, entry, stopLoss, takeProfit } = report;
  if (!["BUY", "SELL"].includes(signal)) return "Chart analysis completed. No trading opportunity detected.";
  // Current reports have a single TP. Accept explicit numeric/price targets if a
  // future saved report supplies them; never infer a second target or parse prose.
  const extra = Array.isArray(report.takeProfits)
    ? report.takeProfits.map((target: any) => typeof target === "number" ? target : target?.price).filter(validPrice)
    : [];
  const targets: number[] = [...new Set<number>([takeProfit, ...extra].filter(validPrice))];
  const directionValid = validPrice(entry) && validPrice(stopLoss) && targets.length > 0 &&
    (signal === "BUY" ? stopLoss < entry && targets.every(tp => tp > entry) : stopLoss > entry && targets.every(tp => tp < entry));
  const evidence = report.priceEvidence;
  const prices = [entry, stopLoss, ...targets];
  const scaleValid = evidence == null || (validPrice(evidence.visibleMin) && validPrice(evidence.visibleMax) &&
    evidence.visibleMin < evidence.visibleMax && prices.every(price => price >= evidence.visibleMin && price <= evidence.visibleMax));
  const assessmentValid = !report.levelAssessment || report.levelAssessment.code === "CHART_LEVELS_RETAINED";
  if (symbol && directionValid && scaleValid && assessmentValid) {
    const profitText = targets.length === 1 ? `Take profit at ${spokenPrice(targets[0])}.` :
      targets.map((price, index) => `Take profit ${index + 1} at ${spokenPrice(price)}.`).join(" ");
    return `Chart analysis completed. ${speakSymbol(symbol)} ${signal.toLowerCase()} setup detected. Entry at ${spokenPrice(entry)}. Stop loss at ${spokenPrice(stopLoss)}. ${profitText} Chart reference levels, not live verified. No trade has been executed.`;
  }
  // Retain the existing directional notification for incomplete/unusable levels.
  return `Chart analysis completed. ${speakSymbol(symbol)} ${signal.toLowerCase()} directional bias detected. Live execution requires verification.`;
}
/** Broker/server labels only: never include account numbers or credentials. */
export function mt5AttemptAnnouncement(broker: unknown, server: unknown) {
  const name = cleanText(broker, 60);
  const host = cleanText(server, 100);
  if (!host && (!name || name === "your broker")) return "Connecting to MT5 account.";
  const label = host && name && name !== "your broker" && !host.toLowerCase().includes(name.toLowerCase().replace(/\s/g, ""))
    ? `${name} ${host}` : host || name;
  return `Connecting to ${label.replace(/[-_]+/g, " ").replace(/MT5/gi, "MT5 ").replace(/Real(?=\d)/gi, "Real ").replace(/\s+/g, " ").trim()}.`;
}
export function mt5ResultAnnouncement(outcome: Mt5ConnectionOutcome) {
  if (outcome?.status === "backend-unreachable") return "Connection failed. Backend unreachable.";
  if (outcome?.status === "authentication-failed") return "Connection failed. Please check your account credentials.";
  if (outcome?.status === "connected" && outcome.verified === true) return "MT5 account connected successfully.";
  if (outcome?.status === "unverified") return "Live MT5 authentication is unavailable. Your account remains unverified.";
  return null;
}
export function tradeAnnouncement(row: any) {
  const confirmed = executionSpeech(row);
  if (confirmed) return confirmed;
  if (row?.status === "failed") return "Trade execution failed. Check the trading activity monitor.";
  return null;
}
