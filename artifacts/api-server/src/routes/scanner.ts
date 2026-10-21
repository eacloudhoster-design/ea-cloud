import express, { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { eq, desc } from "drizzle-orm";
import { db, appAccessTable, scannerReportsTable, scannerEntitlementsTable } from "@workspace/db";
import { fundamentalRequestSchema, strategySchema } from "../../../../lib/api-zod/src/scanner";
import { analyseChart, analyseFundamentals, ScannerError, scannerConfiguration, requireScannerConfiguration } from "../lib/scanner-gemini";

import scannerTradingRouter from "./scanner-trading";
import { scannerFailureDiagnostic } from "../lib/scanner-diagnostics";
import { completeScannerReport } from "../lib/scanner-completion";
import { evaluateScannerAccess } from "../lib/scanner-access";

interface ClientRequest extends Request { scannerClientId?: number }
const router = Router();
router.use("/app/scanner", async (req: ClientRequest, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization;
  if (!token?.startsWith("Bearer ")) { res.status(401).json({ error: "Sign in to use the scanner.", code: "SCANNER_AUTH_REQUIRED", category: "access", retryable: false }); return; }
  try {
    // Preserve the existing client-session format and always resolve the server-side account.
    const [id, role] = Buffer.from(token.slice(7), "base64").toString().split(":");
    if (role !== "client" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2147483647) { res.status(401).json({ error: "Invalid client session. Please sign in again.", code: "SCANNER_SESSION_INVALID", category: "access", retryable: false }); return; }
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, Number(id))).limit(1);
    if (!client || client.status !== "approved") {
      const decision = evaluateScannerAccess(client ?? null, null);
      if (!decision.allowed) res.status(decision.status).json(decision);
      return;
    }
    // Scanner access is independent of the hosting product. No plan/body/query flags grant access.
    const [entitlement] = await db.select().from(scannerEntitlementsTable).where(eq(scannerEntitlementsTable.clientId, client.id)).limit(1);
    const decision = evaluateScannerAccess(client, entitlement ?? null);
    if (!decision.allowed) { res.status(decision.status).json(decision); return; }
    if (req.method === "POST" && ["/chart", "/fundamentals"].includes(req.path) && entitlement.creditsRemaining !== null && entitlement.creditsRemaining <= 0) {
      res.status(403).json({ error: "Your scanner credits are exhausted. Contact support to top up.", code: "SCANNER_CREDITS_EXHAUSTED", category: "access", retryable: false }); return;
    }
    req.scannerClientId = client.id;
    next();
  } catch { res.status(503).json({ error: "Scanner access could not be checked. Please retry; if this persists, contact support.", code: "SCANNER_ACCESS_CHECK_UNAVAILABLE", category: "service", retryable: true }); }
});
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => String((req as ClientRequest).scannerClientId),
  message: { error: "Scanner request limit reached. Please try again later.", code: "SCANNER_REQUEST_LIMIT", category: "service", retryable: true },
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, fieldSize: 100, parts: 3 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
}).single("image");
function failure(req: Request, res: Response, error: unknown) {
  req.log?.warn(scannerFailureDiagnostic(error instanceof ScannerError ? error : {}), "Scanner analysis failed");
  if (error instanceof ScannerError) { res.status(error.status).json({ error: error.message, code: error.code ?? "AI_UNAVAILABLE", category: error.category ?? "ai", retryable: error.retryable ?? true }); return; }
  // Missing migration / failed persistence is never reported as a saved success.
  res.status(503).json({ error: "Scanner history is unavailable. Your report could not be saved. Please retry later.", code: "SCANNER_STORAGE_UNAVAILABLE", category: "storage", retryable: true });
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
router.get("/app/scanner/status", (_req, res) => res.json({ ...scannerConfiguration(), executionAvailable: false }));
router.get("/app/scanner/history", async (req: ClientRequest, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 500) { res.status(400).json({ error: "Invalid history page." }); return; }
  try {
    const rows = await db.select({ id: scannerReportsTable.id, kind: scannerReportsTable.kind, strategy: scannerReportsTable.strategy, report: scannerReportsTable.report, createdAt: scannerReportsTable.createdAt })
      .from(scannerReportsTable).where(eq(scannerReportsTable.clientId, req.scannerClientId!))
      .orderBy(desc(scannerReportsTable.createdAt), desc(scannerReportsTable.id)).limit(21).offset((page - 1) * 20);
    res.json({ records: rows.slice(0,20), hasMore: rows.length > 20 });
  } catch { res.status(503).json({ error: "Scan history is unavailable. Please retry later.", code: "SCANNER_STORAGE_UNAVAILABLE", category: "storage", retryable: true }); }
});
router.post("/app/scanner/chart", limiter, (req, res, next) => upload(req, res, error => {
  if (error) { res.status(400).json({ error: "Upload one PNG, JPEG or WebP chart under 2 MB." }); return; }
  next();
}), async (req: ClientRequest, res) => {
  const strategy = strategySchema.safeParse(req.body?.strategy);
  if (!strategy.success || !req.file) { res.status(400).json({ error: "Choose a strategy and a PNG, JPEG or WebP chart." }); return; }
  const attempt = requestSignal(res);
  try {
    requireScannerConfiguration();
    await ensureHistory(req.scannerClientId!);
    const saved = await completeScannerReport(req.scannerClientId!, "chart", strategy.data, () => analyseChart(req.file!.buffer, req.file!.mimetype, strategy.data, attempt.signal), attempt.signal);
    if (attempt.signal.aborted) return;
    res.status(201).json({ id: saved.id, kind: saved.kind, strategy: saved.strategy, report: saved.report, createdAt: saved.createdAt });
  } catch (error) { if (!attempt.signal.aborted) failure(req, res, error); }
  finally { if (req.file) req.file.buffer.fill(0); attempt.dispose(); }
});
router.post("/app/scanner/fundamentals", limiter, express.json({ limit: "4kb" }), async (req: ClientRequest, res) => {
  const parsed = fundamentalRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose a supported market, focus and outlook." }); return; }
  const attempt = requestSignal(res);
  try {
    requireScannerConfiguration();
    await ensureHistory(req.scannerClientId!);
    const saved = await completeScannerReport(req.scannerClientId!, "fundamental", null, () => analyseFundamentals(parsed.data, attempt.signal), attempt.signal);
    if (attempt.signal.aborted) return;
    res.status(201).json({ id: saved.id, kind: saved.kind, strategy: saved.strategy, report: saved.report, createdAt: saved.createdAt });
  } catch (error) { if (!attempt.signal.aborted) failure(req, res, error); }
  finally { attempt.dispose(); }
});
router.use("/app/scanner", scannerTradingRouter);
// Future adapter boundary only. Never forwards scanner suggestions to mentor webhooks.
const confirmOrder = z.object({ scanId: z.string().uuid(), requestId: z.string().uuid(), confirmed: z.literal(true), lotSize: z.number().positive().max(50), positions: z.number().int().min(1).max(20) }).strict();
router.post("/app/scanner/execute", (req, res) => {
  if (!confirmOrder.safeParse(req.body).success) { res.status(400).json({ error: "Explicit confirmation and a unique request ID are required. No order was submitted." }); return; }
  // Request IDs alone are not durable idempotency. Keep fail-closed until a
  // persistent broker-aware submission ledger/reconciliation adapter is installed.
  res.status(503).json({ error: "Scanner trade execution is not integrated. No order was submitted." });
});
export default router;
