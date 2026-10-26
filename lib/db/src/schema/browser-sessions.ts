import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
/** Only SHA-256 digests are stored; bearer cookie values never enter the database. */
export const browserSessionsTable = pgTable(
  "browser_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    kind: text("kind").notNull(),
    accountId: integer("account_id").notNull(),
    credentialHash: text("credential_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      withTimezone: true,
    }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("browser_sessions_kind_check", sql`${t.kind} IN ('portal','client')`),
    index("browser_session_account_idx").on(t.kind, t.accountId),
    index("browser_session_expiry_idx").on(t.expiresAt),
  ],
);
