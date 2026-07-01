import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brokerServersTable = pgTable("broker_servers", {
  id: serial("id").primaryKey(),
  brokerName: text("broker_name").notNull(),
  serverName: text("server_name").notNull().unique(),
  serverType: text("server_type").notNull().default("live"), // demo | live
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBrokerServerSchema = createInsertSchema(brokerServersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrokerServer = z.infer<typeof insertBrokerServerSchema>;
export type BrokerServer = typeof brokerServersTable.$inferSelect;
