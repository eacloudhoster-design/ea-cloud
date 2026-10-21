import { directionalPredictionSchema, directionalChartReportSchema, type DirectionalChartReport } from "../../../../lib/api-zod/src/scanner";

const textOrNull = (value: string | null | undefined) => value?.trim() || null;
export function buildDirectionalReport(raw: unknown): DirectionalChartReport {
  const p = directionalPredictionSchema.parse(raw);
  const symbol = textOrNull(p.symbol), timeframe = textOrNull(p.timeframe);
  const chartClarity = p.chartClarity ?? "limited";
  const completeLevels = p.entry != null && p.stopLoss != null && p.takeProfit != null;
  const reliableLevels = completeLevels && chartClarity === "clear" && symbol !== null && timeframe !== null;
  const entry = reliableLevels ? p.entry! : null, stopLoss = reliableLevels ? p.stopLoss! : null, takeProfit = reliableLevels ? p.takeProfit! : null;
  const confidenceReason = textOrNull(p.confidenceReason);
  const confidence = chartClarity === "clear" && confidenceReason && confidenceReason.length >= 20 ? p.confidence ?? null : null;
  const reasons = ["MT5 execution is not integrated.", "Live quotes and market session have not been verified."];
  if (p.marketStatus === "closed") reasons.push("The chart indicates a closed market; reopening must be verified.");
  if (chartClarity === "limited") reasons.push("Chart clarity is insufficient for actionable levels.");
  if (confidence === null) reasons.push("Directional confidence is uncalibrated.");
  else if (confidence < 60) reasons.push("Estimated directional confidence is insufficient for this setup.");
  if (entry === null) reasons.push("Reliable trade levels could not be established.");
  const ratio = entry !== null && stopLoss !== null && takeProfit !== null ? Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss) : null;
  return directionalChartReportSchema.parse({ signal: p.signal, reasoning: p.reasoning, symbol, timeframe, entry, stopLoss, takeProfit,
    limitations: textOrNull(p.limitations), confidence, confidenceReason, chartClarity,
    analysis: { marketStructure: textOrNull(p.analysis?.marketStructure), trendDirection: textOrNull(p.analysis?.trendDirection), liquiditySweeps: textOrNull(p.analysis?.liquiditySweeps), supportResistance: textOrNull(p.analysis?.supportResistance), entryReasoning: textOrNull(p.analysis?.entryReasoning), risksInvalidation: textOrNull(p.analysis?.risksInvalidation) },
    evidenceTags: p.evidenceTags ?? [], schemaVersion: 2,
    marketStatus: p.marketStatus === "closed" ? "closed" : "unknown",
    riskRewardRatio: ratio, executionStatus: "NOT_EXECUTABLE", nonExecutableReasons: reasons });
}
