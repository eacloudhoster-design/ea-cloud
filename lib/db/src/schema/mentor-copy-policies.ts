import {pgTable,integer,text,numeric,boolean,timestamp,serial} from 'drizzle-orm/pg-core';
/** Separate mentor limits; never replaces the client's own stricter settings. */
export const mentorCopyPoliciesTable=pgTable('mentor_copy_policies',{
 clientId:integer('client_id').primaryKey(),mentorId:integer('mentor_id').notNull(),
 enabled:boolean('enabled').notNull().default(false),lotMode:text('lot_mode').notNull(),
 fixedLotSize:numeric('fixed_lot_size',{precision:10,scale:4}).notNull(),
 allocationPercent:numeric('allocation_percent',{precision:7,scale:2}).notNull(),
 maxLotSize:numeric('max_lot_size',{precision:10,scale:4}).notNull(),
 maxExposureLots:numeric('max_exposure_lots',{precision:10,scale:4}).notNull(),
 maxOpenTrades:integer('max_open_trades').notNull(),maxDailyDrawdown:numeric('max_daily_drawdown',{precision:5,scale:2}).notNull(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow().$onUpdate(()=>new Date()),
});
export const mentorCopyPolicyAuditTable=pgTable('mentor_copy_policy_audit',{
 id:serial('id').primaryKey(),clientId:integer('client_id').notNull(),mentorId:integer('mentor_id').notNull(),
 action:text('action').notNull(),snapshot:text('snapshot').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
