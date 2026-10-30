import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { easTable } from "./eas";
export const robotBuildsTable = pgTable("robot_builds", {
  id: text("id").primaryKey(),
  mentorId: integer("mentor_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  eaId: integer("ea_id")
    .notNull()
    .references(() => easTable.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  managerName: text("manager_name").notNull(),
  mode: text("mode").notNull().default("capture"),
  sourceMagic: text("source_magic").notNull().default("12345"),
  copyEnabled: boolean("copy_enabled").notNull().default(false),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  startSequence: numeric("start_sequence", { precision: 20, scale: 0 }),
  lastSequence: numeric("last_sequence", { precision: 20, scale: 0 }),
  inventoryCount: integer("inventory_count"),
  queueDepth: integer("queue_depth"),
  historyHealthy: boolean("history_healthy").notNull().default(false),
  templateVersion: text("template_version").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  sourceAccount: text("source_account"),
  sourceServer: text("source_server"),
});
export const robotEventsTable = pgTable(
  "robot_events",
  {
    id: text("id").primaryKey(),
    robotId: text("robot_id")
      .notNull()
      .references(() => robotBuildsTable.id, { onDelete: "cascade" }),
    mentorId: integer("mentor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceAccount: text("source_account").notNull(),
    sourceServer: text("source_server").notNull(),
    eventId: text("event_id").notNull(),
    signalId: integer("signal_id"),
    copyState: text("copy_state").notNull().default("capture_only"),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("robot_event_source_unique").on(
      t.mentorId,
      t.sourceAccount,
      t.sourceServer,
      t.eventId,
    ),
  ],
);
