import {lockMentor,legacyBlocked} from "../lib/ea-builder/routing";
import { Router } from "express";
import { db, tradeSignalsTable, tradeExecutionsTable, appAccessTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { type AuthRequest } from "../middlewares/auth";
import { broadcastToMentorClients } from "../ws";
import { getMentorByApiKey } from "../lib/api-key";
import { webhookLimiter } from "../lib/rate-limit";
import { wakeWorker } from "../lib/signal-worker";
import { logger } from "../lib/logger";

const router = Router();

// Webhook endpoint — called by Mentor's MT5 EA to push a trade signal
// Authenticated via apiKey header (looked up by hash)
router.post("/signals/webhook", webhookLimiter, async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"] as string | undefined;
    if (!apiKey) { res.status(401).json({ error: "API key required" }); return; }

    const mentor = await getMentorByApiKey(apiKey);
    if (!mentor) { res.status(401).json({ error: "Invalid API key" }); return; }
    if (mentor.status !== "approved") { res.status(403).json({ error: "Mentor account not approved" }); return; }

    const {
      signal, symbol, orderType, lots, openPrice,
      stopLoss, takeProfit, ticket, comment, eaId,
    } = req.body as Record<string, unknown>;

    if (!signal || !symbol || !orderType) {
      res.status(400).json({ error: "signal, symbol, and orderType are required" }); return;
    }

    const saved = await db.transaction(async tx=>{
      await lockMentor(tx,mentor.id);
      if(await legacyBlocked(tx,mentor.id))return null;
      const [row]=await tx.insert(tradeSignalsTable).values({
      mentorId: mentor.id,
      eaId: eaId ? Number(eaId) : null,
      signal: String(signal),
      symbol: String(symbol),
      orderType: String(orderType),
      lots: lots !== undefined ? String(lots) : null,
      openPrice: openPrice !== undefined ? String(openPrice) : null,
      stopLoss: stopLoss !== undefined ? String(stopLoss) : null,
      takeProfit: takeProfit !== undefined ? String(takeProfit) : null,
      ticket: ticket !== undefined ? String(ticket) : null,
      comment: comment !== undefined ? String(comment) : null,
      rawPayload: JSON.stringify(req.body),
    }).returning();return row;
    });
    if(!saved){res.status(409).json({error:"Observer copying is active for this mentor. Legacy ingestion is blocked to prevent duplicate execution.",code:"OBSERVER_ROUTE_ACTIVE"});return;}

    // Broadcast to all WS clients subscribed to this mentor
    broadcastToMentorClients(mentor.id, {
      type: "TRADE_SIGNAL",
      signal: saved,
    });

    // The signal is now durably persisted as 'pending'. Nudge the background
    // worker to pick it up immediately; if the API restarts before it runs, the
    // worker resumes it on next boot. Acknowledge the EA right away.
    req.log.info(
      {
        signalId: saved.id,
        mentorId: mentor.id,
        kind: saved.signal,
        symbol: saved.symbol,
        enqueued: true,
      },
      "[Webhook] signal received & enqueued (status=pending)",
    );
    wakeWorker(logger);

    res.status(201).json({ received: true, id: saved.id });
  } catch (err) {
    req.log.error({ err }, "TradeSignalWebhook error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get recent trade signals for a mentor (authenticated mentor)
router.get("/signals/recent", async (req: AuthRequest, res) => {
  try {
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    const decoded = Buffer.from(auth.slice(7), "base64").toString();
    const [idStr] = decoded.split(":");
    const mentorId = parseInt(idStr);

    const signals = await db.select().from(tradeSignalsTable)
      .where(eq(tradeSignalsTable.mentorId, mentorId))
      .orderBy(desc(tradeSignalsTable.createdAt))
      .limit(50);

    res.json(signals);
  } catch (err) {
    req.log.error({ err }, "GetRecentSignals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get recent signals for client (by mentor)
router.get("/app/signals", async (req, res) => {
  try {
    const { mentorId } = req.query as { mentorId?: string };
    if (!mentorId) { res.status(400).json({ error: "mentorId required" }); return; }

    const signals = await db.select().from(tradeSignalsTable)
      .where(eq(tradeSignalsTable.mentorId, parseInt(mentorId)))
      .orderBy(desc(tradeSignalsTable.createdAt))
      .limit(20);

    res.json(signals);
  } catch (err) {
    req.log.error({ err }, "AppGetSignals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get the authenticated client's copy-execution history
router.get("/app/executions", async (req, res) => {
  try {
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    const decoded = Buffer.from(auth.slice(7), "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "client") { res.status(401).json({ error: "Unauthorized" }); return; }
    const clientId = parseInt(idStr);

    const [client] = await db.select({ id: appAccessTable.id })
      .from(appAccessTable).where(eq(appAccessTable.id, clientId)).limit(1);
    if (!client) { res.status(401).json({ error: "Unauthorized" }); return; }

    const executions = await db.select().from(tradeExecutionsTable)
      .where(eq(tradeExecutionsTable.clientId, clientId))
      .orderBy(desc(tradeExecutionsTable.createdAt))
      .limit(50);

    res.json(executions);
  } catch (err) {
    req.log.error({ err }, "AppGetExecutions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
