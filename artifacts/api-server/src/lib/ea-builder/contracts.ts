import { z } from "zod";
export const TEMPLATE_VERSION = "capture-toolkit-1";
export const STRATEGY_AVAILABLE = false;
const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (v) => !/[\x00-\x1f\x7f]/.test(v),
    "Control characters are not allowed.",
  );
export const buildInput = z
  .object({
    eaId: z.coerce.number().int().positive(),
    name,
    managerName: name,
    purpose: z.enum(["trading", "integration-toolkit"]),
  })
  .strict();
const id = z.string().regex(/^\d{1,20}$/);
export const robotEvent = z
  .object({
    eventId: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-zA-Z0-9:._-]+$/),
    sourceAccount: id,
    sourceServer: z.string().min(1).max(100),
    accountMode: z.enum(["NETTING", "HEDGING", "EXCHANGE"]),
    kind: z.enum(["DEAL", "POSITION"]),
    entry: z.enum(["IN", "OUT", "INOUT", "OUT_BY", "POSITION"]),
    dealId: id,
    orderId: id,
    positionId: id,
    symbol: z.string().min(1).max(64),
    side: z.enum(["BUY", "SELL"]),
    volume: z.number().finite().nonnegative().max(1e7),
    price: z.number().finite().nonnegative(),
    stopLoss: z.number().finite().nonnegative(),
    takeProfit: z.number().finite().nonnegative(),
    timestampMs: z.number().int().min(946684800000).max(4102444800000),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.kind === "DEAL" &&
      (v.dealId === "0" || v.entry === "POSITION" || v.volume <= 0)
    )
      c.addIssue({
        code: "custom",
        message: "A confirmed deal requires its identifier, entry and volume.",
      });
    if (v.kind === "POSITION" && v.entry !== "POSITION")
      c.addIssue({ code: "custom", message: "Invalid position change." });
  });
export function safeFilename(name: string) {
  let s =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "EA";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(s)) s = "EA_" + s;
  return s;
}
export function mqlString(s: string) {
  return (
    '"' +
    s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n") +
    '"'
  );
}
