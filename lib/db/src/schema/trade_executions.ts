import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per (signal × client) copy attempt — the execution history.
export const tradeExecutionsTable = pgTable("trade_executions", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id").notNull(),       // trade_signals.id
  mentorId: integer("mentor_id").notNull(),
  clientId: integer("client_id").notNull(),       // app_access.id
  signalKind: text("signal_kind").notNull(),      // OPEN | CLOSE | MODIFY
  symbol: text("symbol").notNull(),
  action: text("action"),                         // BUY | SELL | CLOSE | MODIFY
  volume: numeric("volume", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("pending"), // pending | success | failed | skipped
  ticket: text("ticket"),                         // client's MT5 ticket returned by the VPS
  mentorTicket: text("mentor_ticket"),            // mentor's ticket — maps OPEN→CLOSE/MODIFY
  retcode: integer("retcode"),                    // MT5 order_send retcode
  attempts: integer("attempts").notNull().default(0),
  retryable: integer("retryable").notNull().default(0), // 1 = failure was transient (worth re-attempting)
  vpsResponse: text("vps_response"),              // raw JSON returned by the VPS
  errorMessage: text("error_message"),            // failure / skip reason
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTradeExecutionSchema = createInsertSchema(tradeExecutionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTradeExecution = z.infer<typeof insertTradeExecutionSchema>;
export type TradeExecution = typeof tradeExecutionsTable.$inferSelect;
