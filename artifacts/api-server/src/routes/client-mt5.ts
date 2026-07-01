import { Router } from "express";
import { db, appAccessTable, clientMt5ConnectionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const EXTERNAL_MT5_URL = "http://102.214.9.67:8000/connect-mt5";

// ─── Auth middleware ──────────────────────────────────────────────────────────
const requireClientAuth = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const decoded = Buffer.from(auth.slice(7), "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "client") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = parseInt(idStr, 10);
    const [client] = await db
      .select({ id: appAccessTable.id, status: appAccessTable.status })
      .from(appAccessTable)
      .where(eq(appAccessTable.id, id))
      .limit(1);
    if (!client) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.clientId = id;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

// ─── POST /api/client/mt5/connect ─────────────────────────────────────────────
router.post("/client/mt5/connect", requireClientAuth, async (req: any, res) => {
  try {
    const { login, password, server } = req.body as {
      login?: unknown;
      password?: string;
      server?: string;
    };

    req.log.info(
      { clientId: req.clientId, login, server, hasPassword: !!password },
      "[ClientMT5] connect request received",
    );

    if (!login || !password || !server) {
      req.log.warn(
        { clientId: req.clientId, login, server, hasPassword: !!password },
        "[ClientMT5] validation failed — missing fields",
      );
      res.status(400).json({ error: "login, password, and server are required" });
      return;
    }

    const loginNum = Number(login);
    if (!Number.isInteger(loginNum) || loginNum <= 0) {
      req.log.warn({ login, loginNum }, "[ClientMT5] validation failed — invalid login number");
      res.status(400).json({ error: "login must be a valid positive integer" });
      return;
    }

    // ── Build payload (identical to admin route) ──────────────────────────
    const payload = { login: loginNum, password, server };
    req.log.info(
      { endpoint: EXTERNAL_MT5_URL, login: loginNum, server },
      "[ClientMT5] forwarding to external MT5 backend",
    );

    // ── Forward to external MT5 backend ──────────────────────────────────
    let externalData: Record<string, unknown> = {};
    let externalStatus = 0;
    let connectionStatus = "failed";

    try {
      const externalRes = await fetch(EXTERNAL_MT5_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      externalStatus = externalRes.status;
      externalData = (await externalRes.json().catch(() => ({}))) as Record<string, unknown>;

      req.log.info(
        { externalStatus, externalData },
        "[ClientMT5] received response from external MT5 backend",
      );

      if (externalRes.ok) {
        connectionStatus = "connected";
      }
    } catch (fetchErr: unknown) {
      const msg = (fetchErr as Error).message ?? "Connection timeout";
      req.log.warn({ fetchErr: msg }, "[ClientMT5] external MT5 backend unreachable");
      externalData = { error: msg };
    }

    req.log.info(
      { clientId: req.clientId, mt5Login: loginNum, server, connectionStatus, externalStatus },
      "[ClientMT5] final connection status",
    );

    // ── Persist to DB ─────────────────────────────────────────────────────
    const [saved] = await db
      .insert(clientMt5ConnectionsTable)
      .values({
        clientId: req.clientId,
        mt5Login: loginNum,
        mt5Server: server,
        balance: externalData.balance !== undefined ? String(externalData.balance) : null,
        status: connectionStatus,
        rawResponse: JSON.stringify(externalData),
      })
      .returning();

    // ── Derive a human-readable failure reason ────────────────────────────
    const failureReason: string | undefined =
      connectionStatus === "failed"
        ? (
            (externalData.detail as string) ||
            (externalData.error as string) ||
            (externalData.message as string) ||
            (externalData.msg as string) ||
            `MT5 backend returned HTTP ${externalStatus}`
          )
        : undefined;

    res.status(connectionStatus === "connected" ? 200 : 502).json({
      status: connectionStatus,
      id: saved.id,
      mt5Login: loginNum,
      server,
      balance: saved.balance,
      connectedAt: saved.connectedAt,
      ...(failureReason ? { error: failureReason } : {}),
      ...externalData,
    });
  } catch (err) {
    req.log.error({ err }, "[ClientMT5] unhandled error in connect handler");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/client/mt5/connections ──────────────────────────────────────────
router.get("/client/mt5/connections", requireClientAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select({
        id: clientMt5ConnectionsTable.id,
        mt5Login: clientMt5ConnectionsTable.mt5Login,
        mt5Server: clientMt5ConnectionsTable.mt5Server,
        balance: clientMt5ConnectionsTable.balance,
        status: clientMt5ConnectionsTable.status,
        connectedAt: clientMt5ConnectionsTable.connectedAt,
      })
      .from(clientMt5ConnectionsTable)
      .where(eq(clientMt5ConnectionsTable.clientId, req.clientId))
      .orderBy(desc(clientMt5ConnectionsTable.connectedAt))
      .limit(50);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "[ClientMT5] error fetching connections");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
