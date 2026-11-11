import { verifyBrowserSession, trustedBrowserOrigin } from "../lib/browser-session";
import { reportSessionFailure } from "../lib/session-diagnostics";
import { db, appAccessTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveAppSessionAccess } from "../lib/app-session-access";
/** Shared application session. Feature routers consume this result, not a second licence policy. */
export async function requireAppSession(req: any, res: any, next: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.appSession) { next(); return; }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !trustedBrowserOrigin(req)) {
    res.status(403).json({error:"Untrusted request origin",code:"SESSION_ORIGIN_DENIED"});return;
  }
  try {
    // Bearer values retained by older UI builds are identity hints, not credentials.
    const principal = await verifyBrowserSession(req, "client");
    if (!principal) {res.status(401).json({error:"Sign in to EA Cloud.",code:"SESSION_REQUIRED"});return;}
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, principal.id)).limit(1);
    const access = await resolveAppSessionAccess(client);
    if ("code" in access) {
      req.log?.warn?.({ event: "app_session_denied", code: access.code, clientId: principal.id }, "Application session denied");
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
