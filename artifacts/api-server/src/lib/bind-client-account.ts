import {db,clientSettingsTable,observerAllocationsTable,mt5ConnectionsTable,tradeExecutionsTable} from "@workspace/db";
import {and,eq,ne,sql} from "drizzle-orm";
/** All supported app connect routes share this transaction. Never silently reassign an allocation. */
export async function bindClientAccount(clientId:number,account:{login:string;server:string;broker:string},encrypted:string){
 return db.transaction(async tx=>{
  // Serialize same-account claims across backend processes; collisions only serialize extra requests.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ea-account:"+account.server+":"+account.login}))`);
  if(process.env.MT5_ACCOUNT_INVENTORY==="1"){
   const claims=await tx.execute(sql`SELECT owner_kind,owner_id FROM mt5_account_inventory WHERE login=${account.login} AND server=${account.server}`);
   if(claims.rows.some((r:any)=>r.owner_kind!=="client"||r.owner_id!==clientId))throw Error("ACCOUNT_ALREADY_BOUND");
  }
  const numericLogin=Number(account.login);
  if(Number.isSafeInteger(numericLogin) && numericLogin<=2147483647){
   const [source]=await tx.select({id:mt5ConnectionsTable.id}).from(mt5ConnectionsTable).where(and(eq(mt5ConnectionsTable.mt5Login,numericLogin),eq(mt5ConnectionsTable.mt5Server,account.server))).limit(1);
   if(source)throw Error("ACCOUNT_ALREADY_BOUND");
  }
  // Serialize concurrent account changes for the same client as well.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ea-client:"+clientId}))`);
  const [other]=await tx.select({id:clientSettingsTable.id}).from(clientSettingsTable).where(and(eq(clientSettingsTable.mt5Login,account.login),eq(clientSettingsTable.mt5Server,account.server),ne(clientSettingsTable.clientId,clientId))).limit(1);
  if(other)throw Error("ACCOUNT_ALREADY_BOUND");
  const [old]=await tx.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId,clientId)).limit(1).for("update");
  if(old?.mt5Login && (old.mt5Login!==account.login || old.mt5Server!==account.server)){
   const [allocation]=await tx.select({id:observerAllocationsTable.id}).from(observerAllocationsTable).where(eq(observerAllocationsTable.clientId,clientId)).limit(1);
   if(allocation)throw Error("ACCOUNT_REBIND_REQUIRES_RECONCILIATION");
   const [pending]=await tx.select({id:tradeExecutionsTable.id}).from(tradeExecutionsTable).where(and(eq(tradeExecutionsTable.clientId,clientId),eq(tradeExecutionsTable.status,"pending"))).limit(1);
   if(pending)throw Error("ACCOUNT_REBIND_REQUIRES_RECONCILIATION");
   const [legacy]=await tx.select({id:tradeExecutionsTable.id}).from(tradeExecutionsTable).where(and(eq(tradeExecutionsTable.clientId,clientId),eq(tradeExecutionsTable.signalKind,"OPEN"),eq(tradeExecutionsTable.status,"success"))).limit(1);
   if(legacy)throw Error("ACCOUNT_REBIND_REQUIRES_RECONCILIATION");
  }
  const fields={mt5Login:account.login,mt5Server:account.server,mt5Broker:account.broker,encryptedMt5Password:encrypted,mt5Connected:true,copyingEnabled:old?.mt5Login===account.login && old?.mt5Server===account.server && old.copyingEnabled===true};
  if(old)await tx.update(clientSettingsTable).set(fields).where(eq(clientSettingsTable.clientId,clientId));
  else await tx.insert(clientSettingsTable).values({clientId,...fields,copyingEnabled:false});
 });
}
