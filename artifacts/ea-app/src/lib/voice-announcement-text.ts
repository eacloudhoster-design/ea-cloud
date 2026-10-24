import { executionSpeech, speakSymbol } from "./assistant-text";
export function scannerAnnouncement(record: any) {
  if (record?.kind === "fundamental") return "Fundamental analysis completed.";
  if (record?.kind !== "chart" || !record.report) return null;
  const { signal, symbol, executable } = record.report;
  if (!["BUY", "SELL"].includes(signal)) return "Chart analysis completed. No trading opportunity detected.";
  // Directional analysis does not establish execution eligibility.
  return `Chart analysis completed. ${speakSymbol(symbol)} ${signal.toLowerCase()} ${executable === true ? "opportunity detected" : "directional bias detected. Live execution requires verification"}.`;
}
export function tradeAnnouncement(row: any) {
  const confirmed = executionSpeech(row);
  if (confirmed) return confirmed;
  if (row?.status === "failed") return "Trade execution failed. Check the trading activity monitor.";
  // Pending is an internal signal queue, not proof of an order being submitted.
  return null;
}
