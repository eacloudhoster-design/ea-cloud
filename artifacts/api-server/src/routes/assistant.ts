import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  appAccessTable,
  clientSettingsTable,
  usersTable,
  scannerReportsTable,
  scannerEntitlementsTable,
  tradeExecutionsTable,
} from "@workspace/db";
import { requireAppSession } from "../middlewares/app-session";
import { scannerMt5Read } from "../lib/scanner-mt5";
import { evaluateScannerAccess } from "../lib/scanner-access";
import { signalWorkerHealthy } from "../lib/signal-worker";
import {
  VoiceError,
  synthesize,
  classifyQuestion,
} from "../lib/assistant-voice";
const router = Router();
router.use("/app/assistant", requireAppSession, (req: any, _res, next) => {
  req.assistantClient = { ...req.appClient, mentorId: req.appSession.mentorId };
  next();
});
router.use(
  "/app/assistant",
  rateLimit({
    windowMs: 60000,
    limit: 30,
    keyGenerator: (req: any) => String(req.clientId),
    message: {
      error: "Assistant request limit reached. Please wait a moment.",
    },
  }),
);
function failure(req: any, res: any, error: unknown) {
  const err =
    error instanceof VoiceError
      ? error
      : new VoiceError("The assistant is temporarily unavailable.");
  req.log?.warn(
    {
      event: "assistant_failed",
      code: err.code,
      upstreamStatus: err.upstreamStatus,
    },
    "Assistant request failed",
  );
  res.status(err.status).json({ error: err.message, code: err.code });
}
const safeText = z
  .string()
  .trim()
  .min(1)
  .max(700)
  .refine(
    (value) =>
      !/(?:password|api[_ -]?key|access[_ -]?token|authorization)\s*[:=]|\bBearer\s+\S+/i.test(
        value,
      ),
    "Do not send passwords or access tokens to the assistant.",
  );
router.post("/app/assistant/speech", async (req: any, res) => {
  const parsed = z.object({ text: safeText }).strict().safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Provide a short spoken passage without credentials." });
    return;
  }
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const audio = await synthesize(
      req.clientId,
      parsed.data.text,
      controller.signal,
    );
    if (!controller.signal.aborted) {
      res.type("audio/wav").send(audio);
    }
  } catch (error) {
    if (!controller.signal.aborted) failure(req, res, error);
  }
});
router.post("/app/assistant/intent", async (req: any, res) => {
  const parsed = z.object({ question: safeText }).strict().safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Ask a short question without passwords or tokens." });
    return;
  }
  try {
    res.json(
      await classifyQuestion(parsed.data.question, AbortSignal.timeout(20000)),
    );
  } catch (error) {
    failure(req, res, error);
  }
});
const liveSchema = z
  .object({
    connected: z.boolean(),
    tradeAllowed: z.boolean(),
    account: z
      .object({
        balance: z.number().finite(),
        equity: z.number().finite(),
        profit: z.number().finite(),
        currency: z.string().min(1).max(12),
      })
      .nullable(),
    positionsCount: z.number().int().min(0).max(10000).optional(),
  })
  .refine((value) => !value.connected || value.account !== null);
router.get("/app/assistant/report/:id", async (req: any, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "A valid saved analysis is required." });
    return;
  }
  try {
    const client = req.assistantClient;
    const [grant] = await db
      .select()
      .from(scannerEntitlementsTable)
      .where(eq(scannerEntitlementsTable.clientId, client.id))
      .limit(1);
    if (!evaluateScannerAccess(client, grant ?? null).allowed) {
      res
        .status(403)
        .json({ error: "Scanner access is unavailable for this account." });
      return;
    }
    const [row] = await db
      .select({
        id: scannerReportsTable.id,
        kind: scannerReportsTable.kind,
        report: scannerReportsTable.report,
        createdAt: scannerReportsTable.createdAt,
      })
      .from(scannerReportsTable)
      .where(
        and(
          eq(scannerReportsTable.id, id.data),
          eq(scannerReportsTable.clientId, client.id),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Analysis not found." });
      return;
    }
    res.json(row);
  } catch (error) {
    failure(req, res, error);
  }
});
router.get("/app/assistant/facts", async (req: any, res) => {
  try {
    const client = req.assistantClient;
    const [mentor] = await db
      .select({ robotName: usersTable.robotName })
      .from(usersTable)
      .where(eq(usersTable.id, client.mentorId))
      .limit(1);
    const [settings] = await db
      .select()
      .from(clientSettingsTable)
      .where(eq(clientSettingsTable.clientId, client.id))
      .limit(1);
    let account: any = null,
      connected: boolean | null = settings?.mt5Connected ? null : false,
      tradeAllowed: boolean | null = null,
      positionsCount: number | null = null;
    if (settings?.mt5Connected) {
      try {
        const live = liveSchema.parse(
          await scannerMt5Read(client.id, "activity-snapshot", {
            symbols: [],
            includePositionsCount: true,
          }),
        );
        connected = live.connected;
        tradeAllowed = live.tradeAllowed;
        if (live.connected) {
          account = live.account;
          positionsCount = live.positionsCount ?? null;
        }
      } catch {
        /* Unknown is not zero or a confirmed disconnect. */
      }
    }
    let latest: any = null;
    try {
      const [entitlement] = await db
        .select()
        .from(scannerEntitlementsTable)
        .where(eq(scannerEntitlementsTable.clientId, client.id))
        .limit(1);
      if (evaluateScannerAccess(client, entitlement ?? null).allowed) {
        const [row] = await db
          .select({
            id: scannerReportsTable.id,
            kind: scannerReportsTable.kind,
            report: scannerReportsTable.report,
            createdAt: scannerReportsTable.createdAt,
          })
          .from(scannerReportsTable)
          .where(eq(scannerReportsTable.clientId, client.id))
          .orderBy(desc(scannerReportsTable.createdAt))
          .limit(1);
        latest = row ?? null;
      }
    } catch {
      /* Scanner permission/history failure cannot grant access. */
    }
    const executions = await db
      .select({
        id: tradeExecutionsTable.id,
        status: tradeExecutionsTable.status,
        signalKind: tradeExecutionsTable.signalKind,
        symbol: tradeExecutionsTable.symbol,
        action: tradeExecutionsTable.action,
        ticket: tradeExecutionsTable.ticket,
        retcode: tradeExecutionsTable.retcode,
        updatedAt: tradeExecutionsTable.updatedAt,
      })
      .from(tradeExecutionsTable)
      .where(eq(tradeExecutionsTable.clientId, client.id))
      .orderBy(desc(tradeExecutionsTable.updatedAt))
      .limit(20);
    res.json({
      observedAt: Date.now(),
      botName: mentor?.robotName?.trim() || null,
      robotEnabled:
        typeof settings?.copyingEnabled === "boolean"
          ? settings.copyingEnabled
          : null,
      engine: signalWorkerHealthy(),
      connected,
      tradeAllowed,
      account,
      positionsCount,
      latest,
      executions,
    });
  } catch (error) {
    failure(req, res, error);
  }
});
export default router;
