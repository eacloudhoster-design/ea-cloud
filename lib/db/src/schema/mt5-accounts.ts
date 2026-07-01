import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── Verified MT5 accounts (upserted on successful challenge-response) ────────
export const mt5VerifiedAccountsTable = pgTable("mt5_verified_accounts", {
  id: serial("id").primaryKey(),
  mt5Login: text("mt5_login").notNull(),
  mt5Server: text("mt5_server").notNull(),
  accountType: text("account_type").notNull().default("unknown"), // "demo" | "live" | "unknown"
  mt5Name: text("mt5_name"),
  mt5Currency: text("mt5_currency"),
  mt5Balance: text("mt5_balance"),
  mt5Leverage: text("mt5_leverage"),
  mentorId: integer("mentor_id").references(() => usersTable.id, { onDelete: "cascade" }),
  isActive: text("is_active").notNull().default("true"), // "true" | "false"
  // Challenge-response validation fields
  verificationStatus: text("verification_status").notNull().default("pending"),
  // "pending" | "challenge_issued" | "verified" | "expired"
  challengeVerified: boolean("challenge_verified").notNull().default(false),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Mt5VerifiedAccount = typeof mt5VerifiedAccountsTable.$inferSelect;

// ─── One-time challenge nonces issued to EA agents ────────────────────────────
export const mt5ChallengesTable = pgTable("mt5_challenges", {
  id: serial("id").primaryKey(),
  mentorId: integer("mentor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  nonce: text("nonce").notNull().unique(),
  mt5Login: text("mt5_login").notNull(),
  mt5Server: text("mt5_server").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export type Mt5Challenge = typeof mt5ChallengesTable.$inferSelect;
