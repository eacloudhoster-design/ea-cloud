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
// New provider contract: direction is separate from execution eligibility.
export const directionalPredictionSchema = z.object({
  signal: z.enum(["BUY", "SELL"]),
  symbol: z.string().max(30).nullable(), timeframe: z.string().max(20).nullable(),
  entry: z.number().positive().finite().nullable(), stopLoss: z.number().positive().finite().nullable(), takeProfit: z.number().positive().finite().nullable(),
  reasoning: z.string().min(20).max(4000), limitations: z.string().min(1).max(1500),
  confidence: z.number().int().min(0).max(100).nullable(), confidenceReason: z.string().min(20).max(1000),
  chartClarity: z.enum(["clear", "limited"]),
  marketStatus: z.enum(["open", "closed", "unknown"]),
  analysis: z.object({ marketStructure: z.string().min(20).max(1500), trendDirection: z.string().min(20).max(1500), liquiditySweeps: z.string().min(20).max(1500), supportResistance: z.string().min(20).max(1500), entryReasoning: z.string().min(20).max(1500), risksInvalidation: z.string().min(20).max(1500) }).strict(),
  evidenceTags: z.array(z.enum(["Liquidity Sweep", "Order Block", "Bullish Structure", "Bearish Structure", "Volume Support", "Supply Zone", "Demand Zone", "Support Retest", "Resistance Rejection", "Trend Continuation"])).max(4).refine(tags => new Set(tags).size === tags.length).optional(),
}).strict().superRefine((r, ctx) => {
  const levels = [r.entry, r.stopLoss, r.takeProfit];
  if (levels.every(n => n === null)) return;
  if (r.chartClarity !== "clear" || !r.symbol || !r.timeframe || levels.some(n => n === null) ||
    (r.signal === "BUY" ? !(r.stopLoss! < r.entry! && r.entry! < r.takeProfit!) : !(r.takeProfit! < r.entry! && r.entry! < r.stopLoss!)))
    ctx.addIssue({ code: "custom", message: "Invalid or unsupported chart reference levels" });
});
export const directionalChartReportSchema = z.object({
  schemaVersion: z.literal(2), riskRewardRatio: z.number().positive().finite().nullable(),
  executionStatus: z.literal("NOT_EXECUTABLE"), nonExecutableReasons: z.array(z.string()).min(1),
}).passthrough().and(z.preprocess(raw => {
  if (!raw || typeof raw !== "object") return raw;
  const { schemaVersion, riskRewardRatio, executionStatus, nonExecutableReasons, ...prediction } = raw as Record<string, unknown>;
  return prediction;
}, directionalPredictionSchema));
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
