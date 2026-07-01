import { pgTable, text, serial, timestamp, integer, numeric, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A client's broker-specific selection for one of their mentor's trading pairs.
// `pairName` matches symbol_pairs.pairName; `selectedSymbol` is the broker
// spelling the client picked (one of that pair's variations); `customLotSize`
// is an optional per-pair fixed lot override applied by the copy engine.
export const clientSymbolConfigsTable = pgTable("client_symbol_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(), // references app_access.id
  pairName: text("pair_name").notNull(),
  selectedSymbol: text("selected_symbol"),
  customLotSize: numeric("custom_lot_size", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqClientPair: unique().on(t.clientId, t.pairName),
}));

export const insertClientSymbolConfigSchema = createInsertSchema(clientSymbolConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClientSymbolConfig = z.infer<typeof insertClientSymbolConfigSchema>;
export type ClientSymbolConfig = typeof clientSymbolConfigsTable.$inferSelect;
