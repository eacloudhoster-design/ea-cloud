import { z } from "zod";

export const timeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"] as const;
export const liveShotSelection = z
  .object({ symbol: z.string().min(1).max(40), timeframe: z.enum(timeframes) })
  .strict();
const price = z.number().finite().positive();
export const candleSchema = z
  .object({
    time: z.number().int().positive(),
    open: price,
    high: price,
    low: price,
    close: price,
  })
  .refine(
    (c) =>
      c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close),
  );
export const marketSchema = liveShotSelection.extend({
  candles: z
    .array(candleSchema)
    .min(30)
    .max(600)
    .refine((cs) => cs.every((c, i) => i === 0 || c.time > cs[i - 1].time)),
  lastPrice: price,
  tickTime: z.number().int().positive(),
  observedAt: z.number().int().positive(),
  connected: z.boolean(),
  marketStatus: z.enum(["open", "closed", "unknown"]),
  digits: z.number().int().min(0).max(10),
});
export const analysisSchema = z
  .object({
    bias: z.enum(["Bullish", "Bearish", "Neutral"]),
    setup: z.enum(["BUY", "SELL", "NO CLEAR SETUP"]),
    structure: z.string().min(10).max(2000),
    analysis: z.string().min(20).max(5000),
    levels: z
      .array(
        z.object({
          kind: z.enum(["SUPPORT", "RESISTANCE", "LIQUIDITY"]),
          price,
          reason: z.string().min(1).max(500),
        }),
      )
      .max(12),
    entry: price.nullable(),
    stopLoss: price.nullable(),
    takeProfit: price.nullable(),
    confidence: z.number().finite().min(0).max(100).nullable(),
    confidenceReason: z.string().max(1000).nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.setup === "NO CLEAR SETUP") {
      if ([r.entry, r.stopLoss, r.takeProfit].some((p) => p !== null))
        ctx.addIssue({
          code: "custom",
          message: "No setup must not carry trade levels",
        });
    } else if (!validPosition(r.setup, r.entry, r.stopLoss, r.takeProfit))
      ctx.addIssue({ code: "custom", message: "Invalid setup price ordering" });
    if (r.confidence !== null && !r.confidenceReason?.trim())
      ctx.addIssue({
        code: "custom",
        message: "Confidence needs an evidence basis",
      });
  });
export function validPosition(
  direction: string,
  entry: number | null,
  stop: number | null,
  target: number | null,
) {
  if (
    entry === null ||
    stop === null ||
    target === null ||
    ![entry, stop, target].every((v) => Number.isFinite(v) && v > 0)
  )
    return false;
  return direction === "BUY"
    ? stop < entry && entry < target
    : direction === "SELL" && target < entry && entry < stop;
}
export function rewardRisk(entry: number, stop: number, target: number) {
  const risk = Math.abs(entry - stop);
  return risk > 0 ? Math.abs(target - entry) / risk : null;
}
export type LiveMarket = z.infer<typeof marketSchema>;
export type LiveAnalysis = z.infer<typeof analysisSchema>;

// Gemini JSON Schema subset; Zod enforces domain ordering after generation.
const nullablePrice = { type: ["number", "null"], minimum: 0 };
export const liveAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    bias: { type: "string", enum: ["Bullish", "Bearish", "Neutral"] },
    setup: { type: "string", enum: ["BUY", "SELL", "NO CLEAR SETUP"] },
    structure: { type: "string", minLength: 10, maxLength: 2000 },
    analysis: { type: "string", minLength: 20, maxLength: 5000 },
    levels: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: ["SUPPORT", "RESISTANCE", "LIQUIDITY"],
          },
          price: { type: "number", minimum: 0 },
          reason: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["kind", "price", "reason"],
      },
    },
    entry: nullablePrice,
    stopLoss: nullablePrice,
    takeProfit: nullablePrice,
    confidence: { type: ["number", "null"], minimum: 0, maximum: 100 },
    confidenceReason: { type: ["string", "null"], maxLength: 1000 },
  },
  required: [
    "bias",
    "setup",
    "structure",
    "analysis",
    "levels",
    "entry",
    "stopLoss",
    "takeProfit",
    "confidence",
    "confidenceReason",
  ],
};

export const timeframeSeconds = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
} as const;
export function marketIsCurrent(market: LiveMarket, now = Date.now()) {
  const last = market.candles.at(-1)?.time;
  return (
    !!last &&
    market.connected &&
    market.marketStatus !== "closed" &&
    market.tickTime <= now + 30000 &&
    now - market.tickTime <= 120000 &&
    now - market.observedAt <= 120000 &&
    last * 1000 <= now + 60000 &&
    now - last * 1000 <= timeframeSeconds[market.timeframe] * 1000 + 120000
  );
}
