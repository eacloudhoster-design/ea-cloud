import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  role: text("role").notNull().default("mentor"), // mentor | superadmin | client
  status: text("status").notNull().default("pending"), // pending | approved | rejected | suspended | disabled
  phone: text("phone"),
  mentorName: text("mentor_name"),
  robotName: text("robot_name"),
  robotTagline: text("robot_tagline"),
  backgroundImageUrl: text("background_image_url"),
  webhookUrl: text("webhook_url"),
  apiKey: text("api_key"),              // SHA-256 hash of the raw key (never stored in plaintext)
  apiKeyPrefix: text("api_key_prefix"), // First 8 chars of raw key for display (e.g. "eac_b721")
  apiKeyEncrypted: text("api_key_encrypted"), // AES-256-GCM encrypted raw key — used only to embed in MQ5 files
  licenseLimit: integer("license_limit").notNull().default(10),
  strikes: integer("strikes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
