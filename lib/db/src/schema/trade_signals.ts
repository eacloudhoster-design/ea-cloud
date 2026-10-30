import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradeSignalsTable = pgTable("trade_signals", {
  id: serial("id").primaryKey(),
  mentorId: integer("mentor_id").notNull(),
  observerEventId: text("observer_event_id").unique(),
  eaId: integer("ea_id"),
  signal: text("signal").notNull(),          // OPEN | CLOSE | MODIFY
  symbol: text("symbol").notNull(),
  orderType: text("order_type").notNull(),    // BUY | SELL | BUY_LIMIT | SELL_LIMIT | BUY_STOP | SELL_STOP
  lots: numeric("lots", { precision: 10, scale: 2 }),
  openPrice: numeric("open_price", { precision: 18, scale: 5 }),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 5 }),
  takeProfit: numeric("take_profit", { precision: 18, scale: 5 }),
  ticket: text("ticket"),                    // MT5 trade ticket ID
  comment: text("comment"),
  rawPayload: text("raw_payload"),           // full JSON from EA
  // ── Durable execution queue ───────────────────────────────────────────────
  status: text("status").notNull().default("pending"), // pending | executing | success | failed
  attempts: integer("attempts").notNull().default(0),  // signal-level processing attempts
  lastError: text("last_error"),             // last processing error / retry reason
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }), // backoff gate for retries
  processedAt: timestamp("processed_at", { withTimezone: true }),      // terminal (success/failed) time
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTradeSignalSchema = createInsertSchema(tradeSignalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTradeSignal = z.infer<typeof insertTradeSignalSchema>;
export type TradeSignal = typeof tradeSignalsTable.$inferSelect;
