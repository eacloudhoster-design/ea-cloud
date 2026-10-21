import { z } from "zod";

import { strategies } from "./scanner-options";
export { strategies } from "./scanner-options";
export const strategySchema = z.enum(strategies);
export const fundamentalRequestSchema = z.object({
  market: z.enum(["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "US100", "US30"]),
  focus: z.enum(["General market", "CPI", "PPI", "NFP", "FOMC"]),
  outlook: z.enum(["Intraday", "Next 1–3 days", "This week"]),
}).strict();
export const legacyChartReportSchema = z.object({
  signal: z.enum(["BUY", "SELL", "NO TRADE"]),
  symbol: z.string().max(30).nullable(),
  timeframe: z.string().max(20).nullable(),
  entry: z.number().positive().finite().nullable(),
  stopLoss: z.number().positive().finite().nullable(),
  takeProfit: z.number().positive().finite().nullable(),
  reasoning: z.string().min(20).max(4000),
  limitations: z.string().min(1).max(1500),
  evidenceTags: z.array(z.enum(["Liquidity Sweep", "Order Block", "Bullish Structure", "Bearish Structure", "Volume Support", "Supply Zone", "Demand Zone", "Support Retest", "Resistance Rejection", "Trend Continuation"])).max(4).refine(tags => new Set(tags).size === tags.length, "Duplicate evidence tags").optional(),
}).strict().superRefine((report, ctx) => {
  if (report.signal === "NO TRADE") {
    if (report.entry !== null || report.stopLoss !== null || report.takeProfit !== null)
      ctx.addIssue({ code: "custom", message: "NO TRADE must not contain order levels" });
    return;
  }
  const { entry, stopLoss, takeProfit } = report;
  if (!report.symbol || !report.timeframe || entry == null || stopLoss == null || takeProfit == null ||
    (report.signal === "BUY" ? !(stopLoss < entry && entry < takeProfit) : !(takeProfit < entry && entry < stopLoss)))
    ctx.addIssue({ code: "custom", message: "Invalid or incomplete trade levels" });
});
// Provider input and normalized history output deliberately have different optionality.
export const scannerAnalysisKeys = ["marketStructure", "trendDirection", "liquiditySweeps", "supportResistance", "entryReasoning", "risksInvalidation", "supplyDemand"] as const;
export const scannerEvidenceTags = ["Liquidity Sweep", "Order Block", "Bullish Structure", "Bearish Structure", "Volume Support", "Supply Zone", "Demand Zone", "Support Retest", "Resistance Rejection", "Trend Continuation"] as const;
const analysisSchema = z.object({ marketStructure: z.string().max(1500).nullable(), trendDirection: z.string().max(1500).nullable(), liquiditySweeps: z.string().max(1500).nullable(), supportResistance: z.string().max(1500).nullable(), entryReasoning: z.string().max(1500).nullable(), risksInvalidation: z.string().max(1500).nullable(), supplyDemand: z.string().max(1500).nullable().optional() }).strict();
export const chartPriceEvidenceSchema = z.object({
  visibleMin: z.number().positive().finite(), visibleMax: z.number().positive().finite(),
  decimalPlaces: z.number().int().min(0).max(10),
  basis: z.string().trim().min(20).max(1500),
}).strict();
export const levelAssessmentSchema = z.object({
  code: z.enum(["CHART_LEVELS_RETAINED", "PROVIDER_LEVELS_MISSING", "PROVIDER_LEVELS_NULL", "PROVIDER_LEVELS_PARTIAL", "PRICE_SCALE_MISSING", "PRICE_SCALE_INVALID", "LEVEL_OUTSIDE_VISIBLE_SCALE", "UNSUPPORTED_PRICE_PRECISION"]),
  providerFields: z.object({ entry: z.enum(["missing", "null", "number"]), stopLoss: z.enum(["missing", "null", "number"]), takeProfit: z.enum(["missing", "null", "number"]) }).strict(),
}).strict();
const normalizedPredictionObject = z.object({
  signal: z.enum(["BUY", "SELL"]),
  priceEvidence: chartPriceEvidenceSchema.nullable().optional(), levelsUnavailableReason: z.string().trim().min(1).max(1500).nullable().optional(),
  symbol: z.string().max(30).nullable(), timeframe: z.string().max(20).nullable(),
  entry: z.number().positive().finite().nullable(), stopLoss: z.number().positive().finite().nullable(), takeProfit: z.number().positive().finite().nullable(),
  reasoning: z.string().trim().min(20).max(4000), limitations: z.string().max(1500).nullable(),
  limitOrderAppropriate: z.boolean().nullable().optional(), limitOrderReason: z.string().max(1000).nullable().optional(),
  confidence: z.number().finite().min(0).max(100).nullable(), confidenceReason: z.string().max(1000).nullable(),
  chartClarity: z.enum(["clear", "limited"]), marketStatus: z.enum(["open", "closed", "unknown"]), analysis: analysisSchema,
  evidenceTags: z.array(z.enum(scannerEvidenceTags)).max(4).refine(tags => new Set(tags).size === tags.length).optional(),
}).strict();
const optionalPredictionFields = { priceEvidence: true, levelsUnavailableReason: true, symbol: true, timeframe: true, entry: true, stopLoss: true, takeProfit: true, limitations: true, confidence: true, confidenceReason: true, chartClarity: true, marketStatus: true, analysis: true, evidenceTags: true, limitOrderAppropriate: true, limitOrderReason: true } as const;
export const directionalPredictionSchema = normalizedPredictionObject.partial(optionalPredictionFields).extend({
  analysis: analysisSchema.partial().nullable().optional(),
  chartClarity: z.enum(["clear", "limited"]).nullable().optional(), marketStatus: z.enum(["open", "closed", "unknown"]).nullable().optional(),
  evidenceTags: normalizedPredictionObject.shape.evidenceTags.nullable(),
}).strict().superRefine((r, ctx) => {
  // Missing optional prices are non-actionable, not invalid analysis. Wrong types,
  // negative numbers and complete but inverted risk levels remain errors.
  if (r.entry != null && r.stopLoss != null && r.takeProfit != null &&
    (r.signal === "BUY" ? !(r.stopLoss < r.entry && r.entry < r.takeProfit) : !(r.takeProfit < r.entry && r.entry < r.stopLoss)))
    ctx.addIssue({ code: "custom", path: ["entry"], message: "Invalid chart reference price ordering" });
});
export const directionalChartReportSchema = normalizedPredictionObject.extend({
  levelAssessment: levelAssessmentSchema.optional(),
  schemaVersion: z.literal(2), riskRewardRatio: z.number().positive().finite().nullable(),
  executionStatus: z.literal("NOT_EXECUTABLE"), nonExecutableReasons: z.array(z.string()).min(1),
}).strict();
// Existing JSONB history is read as-is; it is never rewritten into a made-up direction.
export const chartReportSchema = z.union([directionalChartReportSchema, legacyChartReportSchema]);
export type DirectionalPrediction = z.infer<typeof directionalPredictionSchema>;
export type DirectionalChartReport = z.infer<typeof directionalChartReportSchema>;
export type ChartReport = z.infer<typeof chartReportSchema>;
export type FundamentalRequest = z.infer<typeof fundamentalRequestSchema>;
export type Strategy = typeof strategies[number];
export interface FundamentalReport {
  summary: string;
  sources: { title: string; url: string }[];
  asOf: string;
  context: FundamentalRequest;
}
export interface ScannerRecord {
  id: string;
  kind: "chart" | "fundamental";
  strategy: string | null;
  report: ChartReport | FundamentalReport;
  createdAt: string;
}
