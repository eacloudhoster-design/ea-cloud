import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
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
  templateVersion: text("template_version").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
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
