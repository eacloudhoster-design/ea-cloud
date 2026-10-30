import { z } from "zod";
export const TEMPLATE_VERSION = "account-observer-2";
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
    purpose: z.enum(["trading", "integration-toolkit", "existing-observer"]),
    sourceMagic: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (v) => BigInt(v) <= 9223372036854775807n,
        "Magic exceeds MQL long range",
      )
      .default("12345"),
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
    kind: z.enum(["DEAL", "POSITION", "SNAPSHOT"]),
    entry: z.enum(["IN", "OUT", "INOUT", "OUT_BY", "POSITION", "SNAPSHOT"]),
    sourceMagic: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (v) => BigInt(v) <= 9223372036854775807n,
        "Magic exceeds MQL long range",
      )
      .optional(),
    sequence: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    mixed: z.boolean().optional(),
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
      (v.dealId === "0" ||
        ["POSITION", "SNAPSHOT"].includes(v.entry) ||
        v.volume <= 0)
    )
      c.addIssue({
        code: "custom",
        message: "A confirmed deal requires its identifier, entry and volume.",
      });
    if (
      v.kind === "SNAPSHOT" &&
      (!v.sequence ||
        !v.sourceMagic ||
        v.entry !== "SNAPSHOT" ||
        v.positionId === "0")
    )
      c.addIssue({
        code: "custom",
        message:
          "A reconciled position requires its source magic, identifier and sequence.",
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

export const observerHeartbeat = z
  .object({
    sourceAccount: z.string().regex(/^\d{1,20}$/),
    sourceServer: z.string().min(1).max(100),
    sourceMagic: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (v) => BigInt(v) <= 9223372036854775807n,
        "Magic exceeds MQL long range",
      ),
    inventoryCount: z.number().int().min(0).max(10000),
    queueDepth: z.number().int().min(0).max(256),
    lastSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    historyHealthy: z.boolean(),
  })
  .strict();
