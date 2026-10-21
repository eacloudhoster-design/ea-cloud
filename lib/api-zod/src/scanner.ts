import { z } from "zod";

import { strategies } from "./scanner-options";
export { strategies } from "./scanner-options";
export const strategySchema = z.enum(strategies);
export const fundamentalRequestSchema = z.object({
  market: z.enum(["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "US100", "US30"]),
  focus: z.enum(["General market", "CPI", "PPI", "NFP", "FOMC"]),
  outlook: z.enum(["Intraday", "Next 1–3 days", "This week"]),
}).strict();
export const chartReportSchema = z.object({
  signal: z.enum(["BUY", "SELL", "NO TRADE"]),
  symbol: z.string().max(30).nullable(),
  timeframe: z.string().max(20).nullable(),
  entry: z.number().positive().finite().nullable(),
  stopLoss: z.number().positive().finite().nullable(),
  takeProfit: z.number().positive().finite().nullable(),
  reasoning: z.string().min(20).max(4000),
  limitations: z.string().min(1).max(1500),
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
