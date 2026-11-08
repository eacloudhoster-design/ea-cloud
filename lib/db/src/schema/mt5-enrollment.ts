import {pgTable,text,integer,timestamp,uniqueIndex} from 'drizzle-orm/pg-core';
export const mt5EnrollmentTable=pgTable('mt5_enrollment_requests',{
 id:text('id').primaryKey(),ownerKind:text('owner_kind').notNull(),ownerId:integer('owner_id').notNull(),mentorId:integer('mentor_id').notNull(),
 login:text('login').notNull(),server:text('server').notNull(),broker:text('broker').notNull(),encryptedPassword:text('encrypted_password').notNull(),
 status:text('status').notNull().default('pending'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('mt5_enrollment_account_unique').on(t.login,t.server)]);
