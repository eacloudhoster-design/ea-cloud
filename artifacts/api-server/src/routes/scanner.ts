import express, { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { and, eq, desc } from "drizzle-orm";
import { db, appAccessTable, licensesTable, scannerReportsTable } from "@workspace/db";
import { fundamentalRequestSchema, strategySchema } from "../../../../lib/api-zod/src/scanner";
import { analyseChart, analyseFundamentals, ScannerError, scannerConfigured } from "../lib/scanner-gemini";

interface ClientRequest extends Request { scannerClientId?: number }
const router = Router();
router.use("/app/scanner", async (req: ClientRequest, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization;
  if (!token?.startsWith("Bearer ")) { res.status(401).json({ error: "Sign in to use the scanner." }); return; }
  try {
    // Use the app's existing client session format; do not change its auth flows.
    const [id, role] = Buffer.from(token.slice(7), "base64").toString().split(":");
    if (role !== "client" || !/^[1-9]\d*$/.test(id)) { res.status(401).json({ error: "Invalid client session." }); return; }
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, Number(id))).limit(1);
    if (!client || client.status !== "approved" || !client.licenseKey || !client.mentorId) { res.status(403).json({ error: "An approved, licensed client account is required." }); return; }
    const [license] = await db.select().from(licensesTable).where(and(eq(licensesTable.key, client.licenseKey), eq(licensesTable.mentorId, client.mentorId), eq(licensesTable.status, "active"))).limit(1);
    if (!license || (license.expiresAt && license.expiresAt.getTime() <= Date.now())) { res.status(403).json({ error: "Your licence is inactive or expired." }); return; }
    req.scannerClientId = client.id;
    next();
  } catch { res.status(503).json({ error: "Unable to verify scanner access. Please retry." }); }
});
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => String((req as ClientRequest).scannerClientId),
  message: { error: "Scanner request limit reached. Please try again later." },
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, fieldSize: 100, parts: 3 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
}).single("image");
function failure(res: Response, error: unknown) {
  if (error instanceof ScannerError) { res.status(error.status).json({ error: error.message }); return; }
  // Missing migration / failed persistence is never reported as a saved success.
  res.status(503).json({ error: "Scanner history is unavailable. Your report could not be saved. Please retry later." });
}
async function ensureHistory(clientId: number) {
  await db.select({ id: scannerReportsTable.id }).from(scannerReportsTable).where(eq(scannerReportsTable.clientId, clientId)).limit(1);
}
function requestSignal(res: Response) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", close);
  return { signal: controller.signal, dispose: () => res.off("close", close) };
}
router.get("/app/scanner/status", (_req, res) => res.json({ configured: scannerConfigured(), executionAvailable: false }));
router.get("/app/scanner/history", async (req: ClientRequest, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 500) { res.status(400).json({ error: "Invalid history page." }); return; }
  try {
    const rows = await db.select({ id: scannerReportsTable.id, kind: scannerReportsTable.kind, strategy: scannerReportsTable.strategy, report: scannerReportsTable.report, createdAt: scannerReportsTable.createdAt })
      .from(scannerReportsTable).where(eq(scannerReportsTable.clientId, req.scannerClientId!))
      .orderBy(desc(scannerReportsTable.createdAt), desc(scannerReportsTable.id)).limit(21).offset((page - 1) * 20);
    res.json({ records: rows.slice(0,20), hasMore: rows.length > 20 });
  } catch { res.status(503).json({ error: "Scan history is unavailable. Please retry later." }); }
});
router.post("/app/scanner/chart", limiter, (req, res, next) => upload(req, res, error => {
  if (error) { res.status(400).json({ error: "Upload one PNG, JPEG or WebP chart under 2 MB." }); return; }
  next();
}), async (req: ClientRequest, res) => {
  const strategy = strategySchema.safeParse(req.body?.strategy);
  if (!strategy.success || !req.file) { res.status(400).json({ error: "Choose a strategy and a PNG, JPEG or WebP chart." }); return; }
  const attempt = requestSignal(res);
  try {
    if (!scannerConfigured()) throw new ScannerError("AI analysis is not configured yet. Please try again later.");
    await ensureHistory(req.scannerClientId!);
    const report = await analyseChart(req.file.buffer, req.file.mimetype, strategy.data, attempt.signal);
    if (attempt.signal.aborted) return;
    const [saved] = await db.insert(scannerReportsTable).values({ clientId: req.scannerClientId!, kind: "chart", strategy: strategy.data, report }).returning();
    res.status(201).json({ id: saved.id, kind: saved.kind, strategy: saved.strategy, report: saved.report, createdAt: saved.createdAt });
  } catch (error) { if (!attempt.signal.aborted) failure(res, error); }
  finally { if (req.file) req.file.buffer.fill(0); attempt.dispose(); }
});
router.post("/app/scanner/fundamentals", limiter, express.json({ limit: "4kb" }), async (req: ClientRequest, res) => {
  const parsed = fundamentalRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose a supported market, focus and outlook." }); return; }
  const attempt = requestSignal(res);
  try {
    if (!scannerConfigured()) throw new ScannerError("AI analysis is not configured yet. Please try again later.");
    await ensureHistory(req.scannerClientId!);
    const report = await analyseFundamentals(parsed.data, attempt.signal);
    if (attempt.signal.aborted) return;
    const [saved] = await db.insert(scannerReportsTable).values({ clientId: req.scannerClientId!, kind: "fundamental", report }).returning();
    res.status(201).json({ id: saved.id, kind: saved.kind, strategy: saved.strategy, report: saved.report, createdAt: saved.createdAt });
  } catch (error) { if (!attempt.signal.aborted) failure(res, error); }
  finally { attempt.dispose(); }
});
// Future adapter boundary only. Never forwards scanner suggestions to mentor webhooks.
router.post("/app/scanner/execute", (_req, res) => res.status(503).json({ error: "Scanner trade execution is not integrated. No order was submitted." }));
export default router;
