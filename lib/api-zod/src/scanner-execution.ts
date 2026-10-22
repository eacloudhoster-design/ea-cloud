import { z } from "zod";
// Future authenticated sender contract. The current API never returns a receipt
// because it has no operational scanner order sender or durable order ledger.
export const scannerExecutionReceiptSchema = z.object({
  scanId: z.string().uuid(), requestId: z.string().uuid(), brokerConfirmed: z.literal(true),
  requestedPositions: z.number().int().min(1).max(20),
  outcomes: z.array(z.discriminatedUnion("status", [
    z.object({ position: z.number().int().min(1).max(20), status: z.literal("accepted"), ticket: z.string().regex(/^[1-9][0-9]*$/).max(30) }).strict(),
    z.object({ position: z.number().int().min(1).max(20), status: z.literal("rejected") }).strict(),
  ])).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  if (value.outcomes.length !== value.requestedPositions || new Set(value.outcomes.map(o => o.position)).size !== value.requestedPositions || value.outcomes.some(o => o.position > value.requestedPositions))
    ctx.addIssue({ code: "custom", path: ["outcomes"], message: "Every explicitly confirmed position needs exactly one outcome." });
});
