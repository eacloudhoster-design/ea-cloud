import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { and, eq, ilike, or, desc, sql } from "drizzle-orm";
import { db, usersTable, appAccessTable, scannerEntitlementsTable, scannerReportsTable, scannerAdminSessionsTable, scannerAccessAuditTable } from "@workspace/db";
import { requireScannerAdmin } from "../middlewares/scanner-admin";
import type { AuthRequest } from "../middlewares/auth";
import { approvedScannerAdmin, scannerGrantSchema, scannerPasswordMatches, newScannerSession, hashScannerSession } from "../lib/scanner-admin";
import { analyseChart, scannerConfiguration, ScannerError } from "../lib/scanner-gemini";
import { strategySchema } from "../../../../lib/api-zod/src/scanner";
import { evaluateScannerAccess } from "../lib/scanner-access";
const router = Router();
const reauthLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10 });
router.post("/superadmin/scanner/session", reauthLimit, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) { res.status(400).json({ error: "Email and password required." }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
    if (!approvedScannerAdmin(user) || !scannerPasswordMatches(password, user.password)) { res.status(401).json({ error: "Invalid superadmin credentials or account is not approved." }); return; }
    const token = newScannerSession(), expiresAt = new Date(Date.now() + 30 * 60_000);
    await db.insert(scannerAdminSessionsTable).values({ userId: user.id, tokenHash: hashScannerSession(token), expiresAt });
    res.json({ token, expiresAt });
  } catch { res.status(503).json({ error: "Scanner management is not ready. Verify database connectivity and apply the scanner-management migration." }); }
});
router.use("/superadmin/scanner", requireScannerAdmin);
router.delete("/superadmin/scanner/session", async (req, res) => {
  await db.delete(scannerAdminSessionsTable).where(eq(scannerAdminSessionsTable.tokenHash, hashScannerSession(req.headers.authorization!.slice(7))));
  res.json({ success: true });
});
router.get("/superadmin/scanner/readiness", async (_req, res) => {
  try {
    // Actual catalog/column queries: do not infer migration state from source files.
    await db.select({ credits: scannerEntitlementsTable.creditsRemaining }).from(scannerEntitlementsTable).limit(1);
    await db.select({ id: scannerReportsTable.id }).from(scannerReportsTable).limit(1);
    await db.select({ id: scannerAccessAuditTable.id }).from(scannerAccessAuditTable).limit(1);
    res.json({ databaseReady: true, ai: scannerConfiguration() });
  } catch { res.status(503).json({ error: "Scanner migrations are incomplete or PostgreSQL is unavailable. Apply the three scanner migrations in order." }); }
});
router.get("/superadmin/scanner/users", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const page = Number(req.query.page ?? 1);
  if (search.length > 100 || !Number.isInteger(page) || page < 1 || page > 10000) { res.status(400).json({ error: "Invalid search or page." }); return; }
  try {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await db.select({ id: appAccessTable.id, email: appAccessTable.email, firstName: appAccessTable.firstName, lastName: appAccessTable.lastName, accountStatus: appAccessTable.status,
      entitlement: { status: scannerEntitlementsTable.status, expiresAt: scannerEntitlementsTable.expiresAt, creditsRemaining: scannerEntitlementsTable.creditsRemaining, reference: scannerEntitlementsTable.reference, updatedAt: scannerEntitlementsTable.updatedAt } })
      .from(appAccessTable).leftJoin(scannerEntitlementsTable, eq(scannerEntitlementsTable.clientId, appAccessTable.id))
      .where(search ? or(ilike(appAccessTable.email, pattern), ilike(appAccessTable.firstName, pattern), ilike(appAccessTable.lastName, pattern), sql`${appAccessTable.id}::text = ${search}`) : undefined)
      .orderBy(desc(appAccessTable.id)).limit(26).offset((page - 1) * 25);
    res.json({ users: rows.slice(0,25).map(row => ({ ...row, access: evaluateScannerAccess({ id: row.id, status: row.accountStatus }, row.entitlement) })), hasMore: rows.length > 25 });
  } catch { res.status(503).json({ error: "Unable to load scanner accounts. Verify scanner migrations and retry." }); }
});
router.put("/superadmin/scanner/users/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id), parsed = scannerGrantSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !parsed.success) { res.status(400).json({ error: "Provide a valid account, status, credits (0–1,000,000 or unlimited), ISO expiry and audit reference." }); return; }
  const data = parsed.data;
  try {
    const outcome = await db.transaction(async tx => {
      // Lock the account as well: concurrent first-time grants cannot overwrite each other.
      const [client] = await tx.select().from(appAccessTable).where(eq(appAccessTable.id, id)).for("no key update");
      if (!client) return { status: 404, error: "Client account not found. Register through existing app access first." };
      if (client.status !== "approved" && data.status === "active") return { status: 409, error: "Approve the client through App Access before granting scanner access." };
      const [current] = await tx.select().from(scannerEntitlementsTable).where(eq(scannerEntitlementsTable.clientId, id)).for("update");
      if ((current?.updatedAt.toISOString() ?? null) !== data.expectedUpdatedAt) return { status: 409, error: "Access or credits changed since this form opened. Refresh before saving." };
      const grant = { status: data.status, creditsRemaining: data.creditsRemaining, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null, reference: data.reference, updatedAt: new Date(Math.max(Date.now(), (current?.updatedAt.getTime() ?? 0) + 1)) };
      const [saved] = await tx.insert(scannerEntitlementsTable).values({ clientId: id, ...grant }).onConflictDoUpdate({ target: scannerEntitlementsTable.clientId, set: grant }).returning();
      await tx.insert(scannerAccessAuditTable).values({ actorId: req.userId!, clientId: id, changes: JSON.stringify({ before: current ?? null, after: saved }) });
      return { status: 200, entitlement: saved };
    });
    res.status(outcome.status).json(outcome);
  } catch { res.status(503).json({ error: "Scanner access could not be saved. No success has been confirmed; refresh before retrying." }); }
});
const testLimit = rateLimit({ windowMs: 60 * 60_000, limit: 12, keyGenerator: req => String((req as AuthRequest).userId) });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 3 } }).single("image");
router.post("/superadmin/scanner/test/chart", testLimit, (req, res, next) => upload(req, res, error => {
  if (error) { res.status(400).json({ error: "Upload one JPEG, PNG or WebP under 2 MB." }); return; } next();
}), async (req, res) => {
  const strategy = strategySchema.safeParse(req.body?.strategy);
  if (!req.file || !strategy.success) { res.status(400).json({ error: "Choose a chart and supported strategy." }); return; }
  const controller = new AbortController(), close = () => { if (!res.writableEnded) controller.abort(); }; res.on("close", close);
  try { const report = await analyseChart(req.file.buffer, req.file.mimetype, strategy.data, controller.signal); if (!controller.signal.aborted) res.json({ report, testOnly: true, executionAvailable: false }); }
  catch (error) { if (!controller.signal.aborted) res.status(error instanceof ScannerError ? error.status : 503).json({ error: error instanceof ScannerError ? error.message : "AI test failed. Please retry.", code: error instanceof ScannerError ? error.code : "AI_UNAVAILABLE" }); }
  finally { req.file.buffer.fill(0); res.off("close", close); }
});
export default router;
