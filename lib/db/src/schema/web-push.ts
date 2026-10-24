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
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
    sourceKey: text("source_key"),
    payload: jsonb("payload"),
  },
  (t) => [
    index("push_event_pending_idx").on(t.claimedAt, t.createdAt),
    uniqueIndex("push_event_source_idx").on(t.clientId, t.sourceKey),
  ],
);
export const pushDeliveriesTable = pgTable(
  "push_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => pushEventsTable.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => pushSubscriptionsTable.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastStatus: integer("last_status"),
  },
  (t) => [
    uniqueIndex("push_delivery_event_device_idx").on(
      t.eventId,
      t.subscriptionId,
    ),
    index("push_delivery_due_idx").on(t.state, t.nextAttemptAt),
  ],
);
