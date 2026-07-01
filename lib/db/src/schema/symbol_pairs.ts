import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A mentor-defined trading pair and the broker-specific symbol name variations
// for it. `pairName` is the canonical name the mentor's signals use (e.g.
// "XAUUSD"); `variations` is a comma-separated list of broker spellings the
// clients can map to (e.g. "XAUUSDm,XAUUSD.m,XAUUSD").
export const symbolPairsTable = pgTable("symbol_pairs", {
  id: serial("id").primaryKey(),
  mentorId: integer("mentor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  pairName: text("pair_name").notNull(),
  variations: text("variations").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqMentorPair: unique().on(t.mentorId, t.pairName),
}));

export const insertSymbolPairSchema = createInsertSchema(symbolPairsTable).omit({ id: true, mentorId: true, createdAt: true, updatedAt: true });
export type InsertSymbolPair = z.infer<typeof insertSymbolPairSchema>;
export type SymbolPair = typeof symbolPairsTable.$inferSelect;
