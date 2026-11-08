import {assertAccountOwnership,markEnrollmentVerified} from "./account-ownership";
import {db,clientSettingsTable,observerAllocationsTable,appAccessTable,usersTable} from "@workspace/db";
import {and,eq,ne,sql} from "drizzle-orm";
/** All supported app connect routes share this transaction. Never silently reassign an allocation. */
export async function bindClientAccount(clientId:number,account:{login:string;server:string;broker:string},encrypted:string){
 return db.transaction(async tx=>{
  const [client]=await tx.select().from(appAccessTable).where(eq(appAccessTable.id,clientId)).limit(1).for("update");
  if(client?.status!=="approved"||!client.mentorId)throw Error("ACCOUNT_OWNER_UNAVAILABLE");
  const [mentor]=await tx.select().from(usersTable).where(eq(usersTable.id,client.mentorId)).limit(1);
  if(mentor?.status!=="approved"||!["mentor","superadmin"].includes(mentor.role))throw Error("ACCOUNT_OWNER_UNAVAILABLE");
  const owner={kind:"client" as const,id:clientId,mentorId:client.mentorId};
  await assertAccountOwnership(tx,owner,account.login,account.server,account.broker);
  // Serialize concurrent account changes for the same client as well.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ea-client:"+clientId}))`);
  const [other]=await tx.select({id:clientSettingsTable.id}).from(clientSettingsTable).where(and(eq(clientSettingsTable.mt5Login,account.login),eq(clientSettingsTable.mt5Server,account.server),ne(clientSettingsTable.clientId,clientId))).limit(1);
  if(other)throw Error("ACCOUNT_ALREADY_BOUND");
  const [old]=await tx.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId,clientId)).limit(1).for("update");
  if(old?.mt5Login && (old.mt5Login!==account.login || old.mt5Server!==account.server)){
   const [allocation]=await tx.select({id:observerAllocationsTable.id}).from(observerAllocationsTable).where(eq(observerAllocationsTable.clientId,clientId)).limit(1);
   if(allocation)throw Error("ACCOUNT_REBIND_REQUIRES_RECONCILIATION");
  }
  const fields={mt5Login:account.login,mt5Server:account.server,mt5Broker:account.broker,encryptedMt5Password:encrypted,mt5Connected:true,copyingEnabled:old?.mt5Login===account.login && old?.mt5Server===account.server && old.copyingEnabled===true};
  if(old)await tx.update(clientSettingsTable).set(fields).where(eq(clientSettingsTable.clientId,clientId));
  else await tx.insert(clientSettingsTable).values({clientId,...fields,copyingEnabled:false});
  await markEnrollmentVerified(tx,owner,account.login,account.server);
 });
}
