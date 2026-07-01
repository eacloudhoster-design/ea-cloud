import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const easTable = pgTable("eas", {
  id: serial("id").primaryKey(),
  mentorId: integer("mentor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  symbol: text("symbol").notNull().default("XAUUSD"),
  lotSize: text("lot_size").notNull().default("0.01"),
  riskLevel: text("risk_level").notNull().default("medium"), // low | medium | high
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEaSchema = createInsertSchema(easTable).omit({ id: true, mentorId: true, createdAt: true, updatedAt: true });
export type InsertEa = z.infer<typeof insertEaSchema>;
export type Ea = typeof easTable.$inferSelect;
