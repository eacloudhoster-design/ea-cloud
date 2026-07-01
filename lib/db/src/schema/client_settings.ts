import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientSettingsTable = pgTable("client_settings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().unique(),  // references app_access.id
  // MT5 connection — login/server in plain text; password AES-256-GCM encrypted
  mt5Login: text("mt5_login"),
  mt5Server: text("mt5_server"),
  mt5Broker: text("mt5_broker"),
  // Encrypted MT5 password (never stored plain) — used for copy-trade execution
  encryptedMt5Password: text("encrypted_mt5_password"),
  mt5Connected: boolean("mt5_connected").notNull().default(false),
  // Lot sizing mode
  lotMode: text("lot_mode").notNull().default("fixed"), // fixed | risk_percent | multiplier
  fixedLotSize: numeric("fixed_lot_size", { precision: 10, scale: 2 }).default("0.01"),
  riskPercent: numeric("risk_percent", { precision: 5, scale: 2 }).default("1.00"),
  lotMultiplier: numeric("lot_multiplier", { precision: 5, scale: 2 }).default("1.00"),
  // Risk controls
  maxDailyDrawdown: numeric("max_daily_drawdown", { precision: 5, scale: 2 }).default("5.00"),
  maxOpenTrades: integer("max_open_trades").default(10),
  maxLotSize: numeric("max_lot_size", { precision: 10, scale: 2 }).default("1.00"),
  // Symbol filters (comma-separated)
  symbolFilters: text("symbol_filters").default(""),
  // Copy control
  copyingEnabled: boolean("copying_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSettingsSchema = createInsertSchema(clientSettingsTable).omit({ id: true, updatedAt: true });
export type InsertClientSettings = z.infer<typeof insertClientSettingsSchema>;
export type ClientSettings = typeof clientSettingsTable.$inferSelect;
