import type { ChartReport, DirectionalChartReport } from "../../../../lib/api-zod/src/scanner";
export function isDirectionalReport(report: ChartReport): report is DirectionalChartReport {
  return "schemaVersion" in report && report.schemaVersion === 2;
}
export function directionalLabel(report: ChartReport): string {
  return report.signal === "NO TRADE" ? "Archived analysis" : report.signal;
}
export function confidenceLabel(report: ChartReport): string {
  return isDirectionalReport(report) && report.confidence !== null ? `${report.confidence}%` : "Uncalibrated";
}

export function formatRiskReward(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 }).format(value);
}
