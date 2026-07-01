import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { appAccessTable } from "./app_access";

export const clientMt5ConnectionsTable = pgTable("client_mt5_connections", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => appAccessTable.id, { onDelete: "cascade" }),
  mt5Login: integer("mt5_login").notNull(),
  mt5Server: text("mt5_server").notNull(),
  balance: text("balance"),
  status: text("status").notNull().default("connected"), // "connected" | "failed"
  rawResponse: text("raw_response"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClientMt5Connection = typeof clientMt5ConnectionsTable.$inferSelect;
