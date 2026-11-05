import {db,clientSettingsTable,observerAllocationsTable} from "@workspace/db";
import {and,eq,ne,sql} from "drizzle-orm";
/** All supported app connect routes share this transaction. Never silently reassign an allocation. */
export async function bindClientAccount(clientId:number,account:{login:string;server:string;broker:string},encrypted:string){
 return db.transaction(async tx=>{
  // Serialize same-account claims across backend processes; collisions only serialize extra requests.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ea-account:"+account.server+":"+account.login}))`);
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
 });
}
