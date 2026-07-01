import { Router } from "express";
import { db, mt5ConnectionsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const EXTERNAL_MT5_URL = "http://102.214.9.67:8000/connect-mt5";

// ─── Auth helper (Bearer JWT → mentor row) ────────────────────────────────────
const getBearerMentor = async (authHeader: string | undefined) => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "mentor" && role !== "superadmin") return null;
    const id = parseInt(idStr, 10);
    const [mentor] = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    return mentor ?? null;
  } catch {
    return null;
  }
};

// ─── POST /api/admin/mt5/connect ──────────────────────────────────────────────
// Proxies credentials to the external MT5 backend, then saves the result.
router.post("/admin/mt5/connect", async (req: any, res) => {
  try {
    const mentor = await getBearerMentor(req.headers.authorization);
    if (!mentor) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { login, password, server } = req.body as {
      login?: unknown; password?: string; server?: string;
    };

    if (!login || !password || !server) {
      res.status(400).json({ error: "login, password, and server are required" }); return;
    }

    const loginNum = Number(login);
    if (!Number.isInteger(loginNum) || loginNum <= 0) {
      res.status(400).json({ error: "login must be a valid positive integer" }); return;
    }

    // ── Forward to external MT5 backend ──────────────────────────────────────
    let externalData: Record<string, unknown> = {};
    let externalStatus = 0;
    let connectionStatus = "failed";

    try {
      const externalRes = await fetch(EXTERNAL_MT5_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginNum, password, server }),
        signal: AbortSignal.timeout(15_000),
      });

      externalStatus = externalRes.status;
      externalData = (await externalRes.json().catch(() => ({}))) as Record<string, unknown>;

      // The external backend returns HTTP 200 with {success:false} on a failed
      // login, so a 2xx alone is NOT enough — also honour explicit failure flags.
      const connected =
        externalRes.ok &&
        externalData.success !== false &&
        externalData.status !== "failed" &&
        externalData.connected !== false;
      if (connected) {
        connectionStatus = "connected";
      }

      req.log.info(
        { externalStatus, connectionStatus, externalData },
        "External MT5 backend response",
      );
    } catch (fetchErr: unknown) {
      req.log.warn({ fetchErr }, "External MT5 backend unreachable");
      externalData = { error: (fetchErr as Error).message ?? "Connection timeout" };
    }

    // ── Persist to DB ─────────────────────────────────────────────────────────
    const [saved] = await db
      .insert(mt5ConnectionsTable)
      .values({
        mentorId: mentor.id,
        mt5Login: loginNum,
        mt5Server: server,
        balance: externalData.balance !== undefined ? String(externalData.balance) : null,
        status: connectionStatus,
        rawResponse: JSON.stringify(externalData),
      })
      .returning();

    req.log.info(
      { mentorId: mentor.id, mt5Login: loginNum, server, status: connectionStatus },
      "MT5 connect attempt saved",
    );

    // ── Derive a human-readable failure reason (real backend message) ─────────
    const failureReason: string | undefined =
      connectionStatus === "failed"
        ? (
            (externalData.error as string) ||
            (externalData.message as string) ||
            (externalData.detail as string) ||
            (externalData.msg as string) ||
            `MT5 backend returned HTTP ${externalStatus}`
          )
        : undefined;
    const details = externalData.details ?? externalData.last_error ?? null;

    res.status(connectionStatus === "connected" ? 200 : 422).json({
      status: connectionStatus,
      id: saved.id,
      mt5Login: loginNum,
      server,
      balance: saved.balance,
      connectedAt: saved.connectedAt,
      ...(failureReason ? { error: failureReason, details } : {}),
      ...externalData,
    });
  } catch (err) {
    req.log.error({ err }, "MT5Connect error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/admin/mt5/connections ───────────────────────────────────────────
// List all connection attempts for the authenticated mentor (newest first).
router.get("/admin/mt5/connections", async (req: any, res) => {
  try {
    const mentor = await getBearerMentor(req.headers.authorization);
    if (!mentor) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db
      .select({
        id: mt5ConnectionsTable.id,
        mt5Login: mt5ConnectionsTable.mt5Login,
        mt5Server: mt5ConnectionsTable.mt5Server,
        balance: mt5ConnectionsTable.balance,
        status: mt5ConnectionsTable.status,
        connectedAt: mt5ConnectionsTable.connectedAt,
      })
      .from(mt5ConnectionsTable)
      .where(eq(mt5ConnectionsTable.mentorId, mentor.id))
      .orderBy(desc(mt5ConnectionsTable.connectedAt))
      .limit(50);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "MT5GetConnections error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
