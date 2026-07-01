import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const mt5ConnectionsTable = pgTable("mt5_connections", {
  id: serial("id").primaryKey(),
  mentorId: integer("mentor_id").references(() => usersTable.id, { onDelete: "cascade" }),
  mt5Login: integer("mt5_login").notNull(),
  mt5Server: text("mt5_server").notNull(),
  balance: text("balance"),
  status: text("status").notNull().default("connected"), // "connected" | "failed"
  rawResponse: text("raw_response"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Mt5Connection = typeof mt5ConnectionsTable.$inferSelect;
