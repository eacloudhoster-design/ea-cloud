import { directionalPredictionSchema, directionalChartReportSchema, type DirectionalChartReport } from "../../../../lib/api-zod/src/scanner";

const textOrNull = (value: string | null | undefined) => value?.trim() || null;
export function buildDirectionalReport(raw: unknown): DirectionalChartReport {
  const p = directionalPredictionSchema.parse(raw);
  const symbol = textOrNull(p.symbol), timeframe = textOrNull(p.timeframe);
  const chartClarity = p.chartClarity ?? "limited";
  const completeLevels = p.entry != null && p.stopLoss != null && p.takeProfit != null;
  // Price legibility is independent of symbol/timeframe, directional confidence,
  // market hours and live connectivity. Never discard valid references for those.
  const providerFields = Object.fromEntries((["entry", "stopLoss", "takeProfit"] as const).map(key => [key, p[key] === undefined ? "missing" : p[key] === null ? "null" : "number"])) as Record<"entry" | "stopLoss" | "takeProfit", "missing" | "null" | "number">;
  const evidence = p.priceEvidence;
  let code: NonNullable<DirectionalChartReport["levelAssessment"]>["code"] = "CHART_LEVELS_RETAINED";
  if (!completeLevels) code = Object.values(providerFields).every(v => v === "missing") ? "PROVIDER_LEVELS_MISSING" : Object.values(providerFields).every(v => v === "null") ? "PROVIDER_LEVELS_NULL" : "PROVIDER_LEVELS_PARTIAL";
  else if (!evidence) code = "PRICE_SCALE_MISSING";
  else if (evidence.visibleMin >= evidence.visibleMax) code = "PRICE_SCALE_INVALID";
  else if ([p.entry!, p.stopLoss!, p.takeProfit!].some(v => v < evidence.visibleMin || v > evidence.visibleMax)) code = "LEVEL_OUTSIDE_VISIBLE_SCALE";
  else if ([p.entry!, p.stopLoss!, p.takeProfit!, evidence.visibleMin, evidence.visibleMax].some(v => Math.abs(v - Number(v.toFixed(evidence.decimalPlaces))) > Math.max(1, Math.abs(v)) * Number.EPSILON * 8)) code = "UNSUPPORTED_PRICE_PRECISION";
  const reliableLevels = code === "CHART_LEVELS_RETAINED";
  const entry = reliableLevels ? p.entry! : null, stopLoss = reliableLevels ? p.stopLoss! : null, takeProfit = reliableLevels ? p.takeProfit! : null;
  const confidenceReason = textOrNull(p.confidenceReason);
  const confidence = chartClarity === "clear" && confidenceReason && confidenceReason.length >= 20 ? p.confidence ?? null : null;
  const reasons = ["MT5 execution is not integrated.", "Live quotes and market session have not been verified."];
  if (p.marketStatus === "closed") reasons.push("The chart indicates a closed market; reopening must be verified.");
  if (chartClarity === "limited") reasons.push("Overall chart clarity limits execution assessment; separately readable price levels remain chart references.");
  if (confidence === null) reasons.push("Directional confidence is uncalibrated.");
  else if (confidence < 60) reasons.push("Estimated directional confidence is insufficient for this setup.");
  if (entry === null) reasons.push(`Chart levels unavailable: ${code}. ${textOrNull(p.levelsUnavailableReason) ?? "Readable price-scale evidence and a complete supported setup are required."}`);
  const ratio = entry !== null && stopLoss !== null && takeProfit !== null ? Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss) : null;
  if (ratio !== null && ratio < 2) reasons.push("Chart reference levels do not meet the minimum 1:2 target risk-to-reward.");
  return directionalChartReportSchema.parse({ priceEvidence: evidence ?? null, levelsUnavailableReason: reliableLevels ? null : textOrNull(p.levelsUnavailableReason), levelAssessment: { code, providerFields }, signal: p.signal, reasoning: p.reasoning, symbol, timeframe, entry, stopLoss, takeProfit,
    limitOrderAppropriate: p.limitOrderAppropriate ?? false, limitOrderReason: textOrNull(p.limitOrderReason),
    limitations: textOrNull(p.limitations), confidence, confidenceReason, chartClarity,
    analysis: { marketStructure: textOrNull(p.analysis?.marketStructure), trendDirection: textOrNull(p.analysis?.trendDirection), liquiditySweeps: textOrNull(p.analysis?.liquiditySweeps), supportResistance: textOrNull(p.analysis?.supportResistance), entryReasoning: textOrNull(p.analysis?.entryReasoning), risksInvalidation: textOrNull(p.analysis?.risksInvalidation), supplyDemand: textOrNull(p.analysis?.supplyDemand) },
    evidenceTags: p.evidenceTags ?? [], schemaVersion: 2,
    marketStatus: p.marketStatus === "closed" ? "closed" : "unknown",
    riskRewardRatio: ratio, executionStatus: "NOT_EXECUTABLE", nonExecutableReasons: reasons });
}
