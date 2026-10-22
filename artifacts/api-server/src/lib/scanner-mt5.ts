import { db, clientSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptMT5Password } from "./mt5-crypto";
// This separate TLS-only bridge does not reuse the legacy HTTP copy sender.
export async function scannerMt5Read(clientId:number,path:"quote"|"check-order"|"activity-snapshot",body:Record<string,unknown>):Promise<unknown> {
 const base=process.env.SCANNER_MT5_VPS_URL,token=process.env.SCANNER_MT5_VPS_TOKEN;
 if(!base||!token||token.length<32)throw new Error("Scanner quote bridge is not configured.");
 const url=new URL(base);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("Scanner bridge requires a trusted HTTPS URL.");
 const [settings]=await db.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId,clientId)).limit(1);
 if(!settings?.mt5Connected||!settings.mt5Login||!settings.mt5Server||!settings.encryptedMt5Password)throw new Error("Reconnect your MT5 account to obtain verified scanner quotes.");
 const response=await fetch(new URL(`/scanner/${path}`,url),{method:"POST",redirect:"error",signal:AbortSignal.timeout(12_000),headers:{"Content-Type":"application/json","x-scanner-token":token},body:JSON.stringify({...body,login:Number(settings.mt5Login),server:settings.mt5Server,password:decryptMT5Password(settings.encryptedMt5Password)})});
 if(!response.ok)throw new Error("Broker quote/check is unavailable.");return response.json();
}
