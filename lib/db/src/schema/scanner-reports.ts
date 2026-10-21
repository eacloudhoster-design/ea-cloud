import { pgTable, uuid, integer, text, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appAccessTable } from "./app_access";

// Separate scanner records. Never enqueue these in the mentor copy-trade tables.
export const scannerReportsTable = pgTable("scanner_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: integer("client_id").notNull().references(() => appAccessTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  strategy: text("strategy"),
  report: jsonb("report").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("scanner_reports_client_created_idx").on(table.clientId, table.createdAt.desc()), check("scanner_reports_kind_check", sql`${table.kind} IN ('chart', 'fundamental')`)]);
