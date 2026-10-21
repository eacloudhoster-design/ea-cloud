import { pgTable, integer, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appAccessTable } from "./app_access";

// Written by trusted billing/admin operations only, never registration or the scanner client.
export const scannerEntitlementsTable = pgTable("scanner_entitlements", {
  clientId: integer("client_id").primaryKey().references(() => appAccessTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reference: text("reference").notNull(), // audited payment/subscription/support reference, never returned to clients
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [check("scanner_entitlements_status_check", sql`${table.status} IN ('active', 'expired', 'revoked')`), check("scanner_entitlements_reference_check", sql`length(btrim(${table.reference})) > 0`)]);
