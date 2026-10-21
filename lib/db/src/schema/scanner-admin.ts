import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { appAccessTable } from "./app_access";

export const scannerAdminSessionsTable = pgTable("scanner_admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const scannerAccessAuditTable = pgTable("scanner_access_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: integer("actor_id").notNull().references(() => usersTable.id),
  clientId: integer("client_id").notNull().references(() => appAccessTable.id),
  changes: text("changes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
