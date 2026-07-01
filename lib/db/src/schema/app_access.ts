import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appAccessTable = pgTable("app_access", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull().default(""),
  plan: text("plan").notNull().default("monthly"), // monthly | yearly | lifetime
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  licenseKey: text("license_key"),
  mentorId: integer("mentor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAppAccessSchema = createInsertSchema(appAccessTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppAccess = z.infer<typeof insertAppAccessSchema>;
export type AppAccess = typeof appAccessTable.$inferSelect;
