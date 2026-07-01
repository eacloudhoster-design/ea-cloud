import { Router } from "express";
import { randomBytes } from "crypto";
import { db, mt5VerifiedAccountsTable, mt5ChallengesTable, brokerServersTable } from "@workspace/db";
import { eq, and, gt, lt, isNull } from "drizzle-orm";
import { getMentorByApiKey } from "../lib/api-key";
import { webhookLimiter } from "../lib/rate-limit";
import { usersTable } from "@workspace/db";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const resolveAccountType = (
  explicit: string | undefined,
  serverName: string,
  serverDbType: string,
): string => {
  if (explicit === "demo" || explicit === "live") return explicit;
  if (serverDbType === "demo") return "demo";
  if (serverDbType === "live") return "live";
  const l = serverName.toLowerCase();
  if (l.includes("demo") || l.includes("trial") || l.includes("test")) return "demo";
  if (l.includes("real") || l.includes("live")) return "live";
  return "unknown";
};

// ─── POST /api/signals/challenge ─────────────────────────────────────────────
// Step 1 of EA registration: EA requests a one-time nonce to prove it's running.
// Validates API key + broker server whitelist before issuing.
router.post("/signals/challenge", webhookLimiter, async (req: any, res) => {
  try {
    const rawKey = req.headers["x-api-key"] as string | undefined;
    if (!rawKey) { res.status(401).json({ error: "X-API-Key header required" }); return; }

    const mentor = await getMentorByApiKey(rawKey);
    if (!mentor) { res.status(401).json({ error: "Invalid API key" }); return; }
    if (mentor.status !== "approved") { res.status(403).json({ error: "Mentor account not approved" }); return; }

    const { mt5Login, mt5Server } = req.body as { mt5Login?: string; mt5Server?: string };

    if (!mt5Login || !mt5Server) {
      res.status(400).json({ error: "mt5Login and mt5Server are required" }); return;
    }

    // Format: MT5 login must be purely numeric, 5–10 digits
    if (!/^\d{5,10}$/.test(mt5Login)) {
      res.status(400).json({ error: "mt5Login must be a 5–10 digit numeric account number" }); return;
    }

    // ── Strict broker server whitelist check ──────────────────────────────────
    const [knownServer] = await db
      .select({ serverType: brokerServersTable.serverType, brokerName: brokerServersTable.brokerName })
      .from(brokerServersTable)
      .where(
        and(
          eq(brokerServersTable.serverName, mt5Server),
          eq(brokerServersTable.isActive, true),
        ),
      )
      .limit(1);

    if (!knownServer) {
      req.log.warn({ mt5Server, mentorId: mentor.id }, "MT5 challenge rejected — unknown broker server");
      res.status(422).json({
        error: `Broker server "${mt5Server}" is not on the approved list. Contact support to add your broker.`,
        code: "UNKNOWN_BROKER_SERVER",
      });
      return;
    }

    // ── Issue nonce (5-minute TTL) ────────────────────────────────────────────
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.insert(mt5ChallengesTable).values({
      mentorId: mentor.id,
      nonce,
      mt5Login,
      mt5Server,
      expiresAt,
    });

    // Mark the account row as "challenge_issued" (upsert)
    const [existing] = await db
      .select({ id: mt5VerifiedAccountsTable.id })
      .from(mt5VerifiedAccountsTable)
      .where(
        and(
          eq(mt5VerifiedAccountsTable.mt5Login, mt5Login),
          eq(mt5VerifiedAccountsTable.mentorId, mentor.id),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(mt5VerifiedAccountsTable).values({
        mt5Login,
        mt5Server,
        mentorId: mentor.id,
        verificationStatus: "challenge_issued",
        challengeVerified: false,
      });
    } else {
      await db
        .update(mt5VerifiedAccountsTable)
        .set({ verificationStatus: "challenge_issued", mt5Server })
        .where(eq(mt5VerifiedAccountsTable.id, existing.id));
    }

    req.log.info({ mentorId: mentor.id, mt5Login, mt5Server, broker: knownServer.brokerName }, "MT5 challenge issued");

    res.status(201).json({
      nonce,
      expiresIn: 300,
      mt5Login,
      mt5Server,
      broker: knownServer.brokerName,
      serverType: knownServer.serverType,
    });
  } catch (err) {
    req.log.error({ err }, "MT5Challenge error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/signals/register-account ──────────────────────────────────────
// Step 2: EA completes the challenge by submitting the nonce + live account data.
// This is the proof that the EA is genuinely running on this broker account.
router.post("/signals/register-account", webhookLimiter, async (req: any, res) => {
  try {
    const rawKey = req.headers["x-api-key"] as string | undefined;
    if (!rawKey) { res.status(401).json({ error: "X-API-Key header required" }); return; }

    const mentor = await getMentorByApiKey(rawKey);
    if (!mentor) { res.status(401).json({ error: "Invalid API key" }); return; }
    if (mentor.status !== "approved") { res.status(403).json({ error: "Mentor account not approved" }); return; }

    const {
      mt5Login, mt5Server, nonce,
      mt5Name, mt5Currency, mt5Balance, mt5Leverage, accountType,
    } = req.body as {
      mt5Login?: string; mt5Server?: string; nonce?: string;
      mt5Name?: string; mt5Currency?: string; mt5Balance?: string;
      mt5Leverage?: string; accountType?: string;
    };

    if (!mt5Login || !mt5Server || !nonce) {
      res.status(400).json({ error: "mt5Login, mt5Server, and nonce are required" }); return;
    }

    if (!/^\d{5,10}$/.test(mt5Login)) {
      res.status(400).json({ error: "mt5Login must be a 5–10 digit numeric account number" }); return;
    }

    // ── Verify the nonce ──────────────────────────────────────────────────────
    const now = new Date();
    const [challenge] = await db
      .select()
      .from(mt5ChallengesTable)
      .where(
        and(
          eq(mt5ChallengesTable.nonce, nonce),
          eq(mt5ChallengesTable.mentorId, mentor.id),
          eq(mt5ChallengesTable.mt5Login, mt5Login),
          eq(mt5ChallengesTable.mt5Server, mt5Server),
          isNull(mt5ChallengesTable.usedAt),
          gt(mt5ChallengesTable.expiresAt, now),
        ),
      )
      .limit(1);

    if (!challenge) {
      req.log.warn({ mentorId: mentor.id, mt5Login, nonce: nonce.substring(0, 8) + "…" }, "MT5 registration failed — invalid/expired nonce");
      res.status(401).json({
        error: "Challenge nonce is invalid or has expired. Please restart your EA to obtain a fresh nonce.",
        code: "INVALID_NONCE",
      });
      return;
    }

    // ── Mark nonce as consumed (one-time use) ─────────────────────────────────
    await db
      .update(mt5ChallengesTable)
      .set({ usedAt: now })
      .where(eq(mt5ChallengesTable.id, challenge.id));

    // ── Broker server lookup (double-check) ───────────────────────────────────
    const [knownServer] = await db
      .select({ serverType: brokerServersTable.serverType, brokerName: brokerServersTable.brokerName })
      .from(brokerServersTable)
      .where(and(eq(brokerServersTable.serverName, mt5Server), eq(brokerServersTable.isActive, true)))
      .limit(1);

    if (!knownServer) {
      res.status(422).json({
        error: `Broker server "${mt5Server}" is not on the approved list.`,
        code: "UNKNOWN_BROKER_SERVER",
      });
      return;
    }

    const resolvedType = resolveAccountType(accountType, mt5Server, knownServer.serverType);
    const heartbeatExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // ── Upsert verified account ───────────────────────────────────────────────
    const [existing] = await db
      .select({ id: mt5VerifiedAccountsTable.id })
      .from(mt5VerifiedAccountsTable)
      .where(
        and(
          eq(mt5VerifiedAccountsTable.mt5Login, mt5Login),
          eq(mt5VerifiedAccountsTable.mentorId, mentor.id),
        ),
      )
      .limit(1);

    const verifiedAt = now;

    if (existing) {
      await db
        .update(mt5VerifiedAccountsTable)
        .set({
          mt5Server,
          accountType: resolvedType,
          mt5Name: mt5Name ?? null,
          mt5Currency: mt5Currency ?? null,
          mt5Balance: mt5Balance ?? null,
          mt5Leverage: mt5Leverage ?? null,
          isActive: "true",
          verificationStatus: "verified",
          challengeVerified: true,
          lastHeartbeatAt: now,
          expiresAt: heartbeatExpiry,
          verifiedAt,
        })
        .where(eq(mt5VerifiedAccountsTable.id, existing.id));
    } else {
      await db.insert(mt5VerifiedAccountsTable).values({
        mt5Login,
        mt5Server,
        accountType: resolvedType,
        mentorId: mentor.id,
        mt5Name: mt5Name ?? null,
        mt5Currency: mt5Currency ?? null,
        mt5Balance: mt5Balance ?? null,
        mt5Leverage: mt5Leverage ?? null,
        isActive: "true",
        verificationStatus: "verified",
        challengeVerified: true,
        lastHeartbeatAt: now,
        expiresAt: heartbeatExpiry,
      });
    }

    req.log.info(
      { mentorId: mentor.id, mt5Login, mt5Server, accountType: resolvedType, broker: knownServer.brokerName },
      "MT5 account verified via challenge-response",
    );

    res.status(201).json({
      registered: true,
      mt5Login,
      mt5Server,
      accountType: resolvedType,
      broker: knownServer.brokerName,
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: heartbeatExpiry.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "MT5RegisterAccount error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/signals/heartbeat ─────────────────────────────────────────────
// EA calls this every 60 s to prove the account is still live.
// Resets the 7-day expiry clock on the verified account.
router.post("/signals/heartbeat", webhookLimiter, async (req: any, res) => {
  try {
    const rawKey = req.headers["x-api-key"] as string | undefined;
    if (!rawKey) { res.status(401).json({ error: "X-API-Key header required" }); return; }

    const mentor = await getMentorByApiKey(rawKey);
    if (!mentor) { res.status(401).json({ error: "Invalid API key" }); return; }

    const { mt5Login, mt5Server } = req.body as { mt5Login?: string; mt5Server?: string };
    if (!mt5Login || !mt5Server) {
      res.status(400).json({ error: "mt5Login and mt5Server are required" }); return;
    }

    const now = new Date();
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [account] = await db
      .select({ id: mt5VerifiedAccountsTable.id, verificationStatus: mt5VerifiedAccountsTable.verificationStatus })
      .from(mt5VerifiedAccountsTable)
      .where(
        and(
          eq(mt5VerifiedAccountsTable.mt5Login, mt5Login),
          eq(mt5VerifiedAccountsTable.mentorId, mentor.id),
        ),
      )
      .limit(1);

    if (!account) {
      res.status(404).json({
        error: "Account not registered. Please restart your EA to complete verification.",
        code: "ACCOUNT_NOT_FOUND",
      });
      return;
    }

    const newStatus =
      account.verificationStatus === "verified" ? "verified" : account.verificationStatus;

    await db
      .update(mt5VerifiedAccountsTable)
      .set({
        lastHeartbeatAt: now,
        expiresAt: newExpiry,
        isActive: "true",
        verificationStatus: newStatus,
        mt5Server,
      })
      .where(eq(mt5VerifiedAccountsTable.id, account.id));

    res.json({ ok: true, nextHeartbeatIn: 60 });
  } catch (err) {
    req.log.error({ err }, "MT5Heartbeat error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/admin/mt5/accounts ─────────────────────────────────────────────
// Returns all verified accounts for the authenticated mentor with live status.
router.get("/admin/mt5/accounts", async (req: any, res) => {
  try {
    const mentor = await getBearerMentor(req.headers.authorization);
    if (!mentor) { res.status(401).json({ error: "Unauthorized" }); return; }

    const accounts = await db
      .select()
      .from(mt5VerifiedAccountsTable)
      .where(eq(mt5VerifiedAccountsTable.mentorId, mentor.id));

    const now = Date.now();
    const enriched = accounts.map((a) => {
      let effectiveStatus = a.verificationStatus;
      if (a.expiresAt && a.expiresAt.getTime() < now && a.verificationStatus === "verified") {
        effectiveStatus = "expired";
      }
      const lastBeat = a.lastHeartbeatAt?.getTime();
      const minutesSinceHeartbeat = lastBeat ? Math.floor((now - lastBeat) / 60000) : null;
      return {
        ...a,
        verificationStatus: effectiveStatus,
        minutesSinceHeartbeat,
        isLive: effectiveStatus === "verified" && (minutesSinceHeartbeat === null || minutesSinceHeartbeat < 5),
      };
    });

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "MT5GetAccounts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Periodic cleanup — mark stale accounts as expired (runs at startup) ──────
export async function expireStaleAccounts(log: Logger): Promise<void> {
  try {
    const now = new Date();
    await db
      .update(mt5VerifiedAccountsTable)
      .set({ verificationStatus: "expired", isActive: "false" })
      .where(
        and(
          lt(mt5VerifiedAccountsTable.expiresAt, now),
          eq(mt5VerifiedAccountsTable.verificationStatus, "verified"),
        ),
      );
  } catch (err) {
    log.warn({ err }, "Stale account expiry job skipped");
  }
}

import type { Logger } from "pino";

export default router;
