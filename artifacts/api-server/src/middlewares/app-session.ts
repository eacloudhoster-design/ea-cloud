import { reportSessionFailure } from "../lib/session-diagnostics";
import { db, appAccessTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveAppSessionAccess } from "../lib/app-session-access";
/** Shared application session. Feature routers consume this result, not a second licence policy. */
export async function requireAppSession(req: any, res: any, next: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.appSession) { next(); return; }
  const auth = req.headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) { res.status(401).json({ error: "Sign in to EA Cloud.", code: "SESSION_REQUIRED" }); return; }
  try {
    const [id, role] = Buffer.from(auth.slice(7), "base64").toString().split(":");
    if (role !== "client" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) {
      res.status(401).json({ error: "Your session is invalid. Sign in again.", code: "SESSION_INVALID" }); return;
    }
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, Number(id))).limit(1);
    const access = await resolveAppSessionAccess(client);
    if ("code" in access) {
      req.log?.warn?.({ event: "app_session_denied", code: access.code, clientId: Number(id) }, "Application session denied");
      res.status(401).json({ ...access, code: `SESSION_${access.code}` }); return;
    }
    req.clientId = client.id;
    req.appClient = client;
    req.appSession = { clientId: client.id, mentorId: access.mentorId };
    next();
  } catch (error) {
    // A database/network failure does not constitute revocation or destroy a session.
    reportSessionFailure(req,res,error,"licence");
  }
}
