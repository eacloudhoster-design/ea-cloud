import { issueBrowserSession, revokeBrowserSessions, identityHint } from "../lib/browser-session";
import {issuePushSession} from "../lib/push-session";
import { requireAppSession } from "../middlewares/app-session";
import { resolveAppSessionAccess } from "../lib/app-session-access";
import { Router } from "express";
import { db, appAccessTable, licensesTable, usersTable, easTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();
router.post("/app/logout", async (req, res) => {
  try { await revokeBrowserSessions(req, res); res.json({ success: true }); }
  catch { res.status(503).json({ error: "Unable to sign out. Please retry." }); }
});

const hashPassword = (p: string) => crypto.createHash("sha256").update(p + "ea_cloud_salt_2024").digest("hex");


export const requireClientAuth = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "client" || !/^[1-9]\d*$/.test(idStr) || !Number.isSafeInteger(Number(idStr)) || Number(idStr) > 2147483647) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(idStr);
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, id)).limit(1);
    if (!client) { res.status(401).json({ error: "Unauthorized" }); return; }
    req.clientId = id;
    next();
  } catch { res.status(503).json({ error: "Unable to verify your session. Please retry." }); }
};

const toClientDto = (c: typeof appAccessTable.$inferSelect) => ({
  id: c.id, firstName: c.firstName, lastName: c.lastName,
  email: c.email, status: c.status, plan: c.plan,
  licenseKey: c.licenseKey ?? null, mentorId: c.mentorId ?? null,
  createdAt: c.createdAt,
});

// Public mentor config — no auth required
router.get("/app/mentor-config", async (req, res) => {
  try {
    const [mentor] = await db.select({
      id: usersTable.id,
      robotName: usersTable.robotName,
      robotTagline: usersTable.robotTagline,
      backgroundImageUrl: usersTable.backgroundImageUrl,
      mentorName: usersTable.mentorName,
    }).from(usersTable)
      .where(eq(usersTable.role, "mentor"))
      .limit(1);

    if (!mentor) {
      res.json({ robotName: "EA Cloud Pro", robotTagline: "@ea_cloud", backgroundImageUrl: null, symbols: [] });
      return;
    }

    const eas = await db.select({ symbol: easTable.symbol, name: easTable.name })
      .from(easTable)
      .where(and(eq(easTable.mentorId, mentor.id), eq(easTable.isActive, true)));

    const allSymbols = [...new Set(
      eas.flatMap(ea => ea.symbol.split(",").map((s: string) => s.trim()).filter(Boolean))
    )];

    res.json({
      robotName: mentor.robotName?.trim() || eas[0]?.name || "EA Cloud Pro",
      robotTagline: mentor.robotTagline || "@ea_cloud",
      backgroundImageUrl: mentor.backgroundImageUrl || null,
      symbols: allSymbols,
      eas: eas.map(ea => ({ name: ea.name, symbol: ea.symbol })),
    });
  } catch (err) {
    req.log.error({ err }, "MentorConfig error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Register
router.post("/app/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, plan } = req.body as {
      firstName: string; lastName: string; email: string; password: string; plan: string;
    };
    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ error: "All fields required" }); return;
    }
    const existing = await db.select({ id: appAccessTable.id }).from(appAccessTable)
      .where(eq(appAccessTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "Email already registered" }); return; }

    const [client] = await db.insert(appAccessTable).values({
      firstName, lastName,
      email: email.toLowerCase(),
      password: hashPassword(password),
      plan: plan ?? "monthly",
      status: "pending",
    }).returning();

    const token = await issueBrowserSession(req, res, "client", client);
    issuePushSession(res,client.id,token);
    res.status(201).json({ client: toClientDto(client), token });
  } catch (err) {
    req.log.error({ err }, "AppRegister error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
// Retain the legacy URL, but require the same password verification on both paths.
router.post(["/app/login", "/app/login-by-email"], async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }

    const [client] = await db.select().from(appAccessTable)
      .where(and(eq(appAccessTable.email, email.toLowerCase()), eq(appAccessTable.password, hashPassword(password)))).limit(1);
    if (!client) { res.status(401).json({ error: "Invalid credentials" }); return; }

    // Credentials may open the existing activation screen, but only a verified
    // licence opens the app. This keeps renewals possible after session revocation.
    let verified = client;
    let sessionAccess: "app" | "setup" = "setup";
    if (client.status === "approved") {
      const access = await resolveAppSessionAccess(client);
      if ("code" in access) verified = { ...client, licenseKey: null };
      else {
        verified = { ...client, mentorId: access.mentorId, licenseKey: access.licenseKey };
        sessionAccess = "app";
      }
    }
    const token = await issueBrowserSession(req, res, "client", client);
    issuePushSession(res,client.id,token);
    res.json({ client: toClientDto(verified), token, sessionAccess });
  } catch (err) {
    req.log.error({ err }, "AppLogin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get me
router.get("/app/me", requireClientAuth, async (req: any, res) => {
  try {
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.setHeader("Cache-Control", "no-store");
    let verified = client;
    if (client.status === "approved") {
      const access = await resolveAppSessionAccess(client);
      if ("code" in access) {
        if (client.licenseKey || access.code !== "LICENCE_NOT_LINKED") { res.status(401).json({ ...access, code: `SESSION_${access.code}` }); return; }
      } else verified = { ...client, mentorId: access.mentorId, licenseKey: access.licenseKey };
    }
    res.json({ ...toClientDto(verified), token: identityHint(client.id, "client") });
  } catch (err) {
    req.log.error({ err }, "AppGetMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Activate license key — validates email match
router.post("/app/activate", requireClientAuth, async (req: any, res) => {
  try {
    const { licenseKey } = req.body as { licenseKey: string };
    if (typeof licenseKey !== "string" || !licenseKey.trim() || licenseKey.length > 256) { res.status(400).json({ error: "License key required" }); return; }

    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    if (client.status !== "approved") { res.status(403).json({ error: "Account not yet approved" }); return; }

    // Find the license
    const [license] = await db.select().from(licensesTable)
      .where(and(eq(licensesTable.key, licenseKey.trim()), sql`lower(trim(${licensesTable.status})) = 'active'`)).limit(1);
    if (!license) { res.status(404).json({ error: "Invalid or expired license key" }); return; }

    if (license.expiresAt && (!Number.isFinite(new Date(license.expiresAt).getTime()) || new Date(license.expiresAt).getTime() <= Date.now())) {
      res.status(403).json({ error: "This licence has expired. Contact your mentor.", code: "LICENCE_EXPIRED" }); return;
    }

    // Enforce email pairing — license must be issued to this client's email
    if (license.clientEmail && license.clientEmail.trim().toLowerCase() !== client.email.trim().toLowerCase()) {
      res.status(403).json({ error: "This license key is not registered to your email address" });
      return;
    }

    const [updated] = await db.update(appAccessTable)
      .set({ licenseKey: licenseKey.trim(), mentorId: license.mentorId })
      .where(eq(appAccessTable.id, req.clientId)).returning();

    res.json(toClientDto(updated));
  } catch (err) {
    req.log.error({ err }, "AppActivate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dashboard
router.get("/app/dashboard", requireAppSession, async (req: any, res) => {
  try {
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    const mentorId = req.appSession?.mentorId ?? client.mentorId;
    if (client.status !== "approved" || !mentorId) {
      res.json({ client: toClientDto(client), mentor: null, eas: [] }); return;
    }

    const [mentor] = await db.select({
      id: usersTable.id, mentorName: usersTable.mentorName, robotName: usersTable.robotName,
      robotTagline: usersTable.robotTagline, backgroundImageUrl: usersTable.backgroundImageUrl,
    }).from(usersTable).where(eq(usersTable.id, mentorId)).limit(1);

    const eas = await db.select().from(easTable)
      .where(and(eq(easTable.mentorId, mentorId), eq(easTable.isActive, true)));

    res.json({ client: toClientDto(client), mentor: mentor ?? null, eas });
  } catch (err) {
    req.log.error({ err }, "AppDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
