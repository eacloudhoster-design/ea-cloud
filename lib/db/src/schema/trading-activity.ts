import { pgTable, uuid, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { appAccessTable } from "./app_access";
export const tradingActivityTable = pgTable("trading_activity", {
 id: uuid("id").primaryKey().defaultRandom(),clientId:integer("client_id").notNull().references(()=>appAccessTable.id,{onDelete:"cascade"}),
 source:text("source").notNull(),level:text("level").notNull(),message:text("message").notNull(),details:jsonb("details").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("trading_activity_client_created_idx").on(t.clientId,t.createdAt.desc())]);
