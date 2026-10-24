import {
  pgTable,
  uuid,
  integer,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appAccessTable } from "./app_access";
export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: integer("client_id")
      .notNull()
      .references(() => appAccessTable.id, { onDelete: "cascade" }),
    endpointHash: text("endpoint_hash").notNull(),
    subscription: jsonb("subscription").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("push_subscription_endpoint_idx").on(t.endpointHash),
    index("push_subscription_client_idx").on(t.clientId),
  ],
);
export const pushEventsTable = pgTable(
  "push_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: integer("client_id")
      .notNull()
      .references(() => appAccessTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [index("push_event_pending_idx").on(t.claimedAt, t.createdAt)],
);
