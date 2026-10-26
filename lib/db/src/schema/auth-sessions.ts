import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
export const authSessionsTable = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: integer("account_id").notNull(),
    kind: text("kind").notNull(),
    role: text("role").notNull(),
    credentialHash: text("credential_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "auth_sessions_kind_check",
      sql`${table.kind} IN ('client', 'portal')`,
    ),
    index("auth_sessions_account_idx").on(table.kind, table.accountId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);
