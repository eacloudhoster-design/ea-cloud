import {clientSettingsTable,mt5ConnectionsTable,mt5EnrollmentTable} from '@workspace/db';
import {and,eq,sql} from 'drizzle-orm';
export type AccountOwner={kind:'client'|'mentor';id:number;mentorId:number};
/** The same account lock and reservations apply to BOTH roles, including disconnected identities. */
export async function assertAccountOwnership(tx:any,owner:AccountOwner,login:string,server:string,broker:string){
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ea-account:"+server+":"+login}))`);
 const clients=await tx.select({id:clientSettingsTable.clientId}).from(clientSettingsTable).where(and(eq(clientSettingsTable.mt5Login,login),eq(clientSettingsTable.mt5Server,server)));
 const mentors=await tx.select({id:mt5ConnectionsTable.mentorId}).from(mt5ConnectionsTable).where(and(eq(sql`${mt5ConnectionsTable.mt5Login}::text`,login),eq(mt5ConnectionsTable.mt5Server,server)));
 const requests=await tx.select().from(mt5EnrollmentTable).where(and(eq(mt5EnrollmentTable.login,login),eq(mt5EnrollmentTable.server,server)));
 if(clients.some((r:any)=>owner.kind!=='client'||r.id!==owner.id)||mentors.some((r:any)=>owner.kind!=='mentor'||r.id!==owner.id)||requests.some((r:any)=>r.ownerKind!==owner.kind||r.ownerId!==owner.id||r.mentorId!==owner.mentorId||r.broker!==broker))throw Error('ACCOUNT_ALREADY_BOUND');
}
export async function markEnrollmentVerified(tx:any,owner:AccountOwner,login:string,server:string){
 await tx.update(mt5EnrollmentTable).set({status:'verified',updatedAt:new Date()}).where(and(eq(mt5EnrollmentTable.ownerKind,owner.kind),eq(mt5EnrollmentTable.ownerId,owner.id),eq(mt5EnrollmentTable.mentorId,owner.mentorId),eq(mt5EnrollmentTable.login,login),eq(mt5EnrollmentTable.server,server)));
}
