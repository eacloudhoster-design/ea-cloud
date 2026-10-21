import { directionalPredictionSchema, type DirectionalChartReport } from "../../../../lib/api-zod/src/scanner";

export function buildDirectionalReport(raw: unknown): DirectionalChartReport {
  const prediction = directionalPredictionSchema.parse(raw);
  if (prediction.chartClarity === "limited") prediction.confidence = null;
  const reasons = ["MT5 execution is not integrated.", "Live quotes and market session have not been verified."];
  if (prediction.marketStatus === "closed") reasons.push("The chart indicates a closed market; reopening must be verified.");
  if (prediction.chartClarity === "limited") reasons.push("Chart clarity is insufficient for actionable levels.");
  if (prediction.confidence === null) reasons.push("Directional confidence is uncalibrated.");
  else if (prediction.confidence < 60) reasons.push("Estimated directional confidence is insufficient for this setup.");
  if (prediction.entry === null) reasons.push("Reliable trade levels could not be established.");
  const ratio = prediction.entry !== null && prediction.stopLoss !== null && prediction.takeProfit !== null
    ? Math.abs(prediction.takeProfit - prediction.entry) / Math.abs(prediction.entry - prediction.stopLoss) : null;
  if (ratio !== null && (!Number.isFinite(ratio) || ratio <= 0)) throw new Error("Invalid risk-to-reward ratio");
  return { ...prediction, schemaVersion: 2,
    // A screenshot cannot authenticate current market opening or price freshness.
    marketStatus: prediction.marketStatus === "closed" ? "closed" : "unknown",
    confidence: prediction.chartClarity === "limited" ? null : prediction.confidence,
    riskRewardRatio: ratio, executionStatus: "NOT_EXECUTABLE", nonExecutableReasons: reasons };
}
