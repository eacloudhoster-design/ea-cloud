import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { easTable } from "./eas";

// Cosmetic artwork only. Never read by the trading engine.
export const eaModeImagesTable = pgTable("ea_mode_images", {
  eaId: integer("ea_id").primaryKey().references(() => easTable.id, { onDelete: "cascade" }),
  normal: text("normal"),
  beast: text("beast"),
  aggressive: text("aggressive"),
  ultimate: text("ultimate"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
