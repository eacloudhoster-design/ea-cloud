import {
  pgTable,
  text,
  integer,
  timestamp,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { robotBuildsTable } from "./robot-builds";
export const observerPositionsTable = pgTable("observer_positions", {
  key: text("key").primaryKey(),
  robotId: text("robot_id")
    .notNull()
    .references(() => robotBuildsTable.id, { onDelete: "cascade" }),
  mentorId: integer("mentor_id").notNull(),
  positionId: text("position_id").notNull(),
  sequence: numeric("sequence", { precision: 20, scale: 0 }).notNull(),
  volume: text("volume").notNull(),
  side: text("side").notNull(),
  symbol: text("symbol").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const observerAllocationsTable = pgTable(
  "observer_allocations",
  {
    id: text("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    sourceKey: text("source_key").notNull(),
    mentorId: integer("mentor_id").notNull(),
    symbol: text("symbol").notNull(),
    scale: text("scale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("observer_allocation_unique").on(t.clientId, t.sourceKey),
  ],
);
