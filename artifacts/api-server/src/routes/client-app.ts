import { Router } from "express";
import { db, appAccessTable, licensesTable, usersTable, easTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const hashPassword = (p: string) => crypto.createHash("sha256").update(p + "ea_cloud_salt_2024").digest("hex");
const makeToken = (id: number) => Buffer.from(`${id}:client:${Date.now()}`).toString("base64");

const requireClientAuth = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "client") { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(idStr);
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, id)).limit(1);
    if (!client) { res.status(401).json({ error: "Unauthorized" }); return; }
    req.clientId = id;
    next();
  } catch { res.status(401).json({ error: "Unauthorized" }); }
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
      robotName: eas[0]?.name || mentor.robotName || "EA Cloud Pro",
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

    const token = makeToken(client.id);
    res.status(201).json({ client: toClientDto(client), token });
  } catch (err) {
    req.log.error({ err }, "AppRegister error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
router.post("/app/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }

    const [client] = await db.select().from(appAccessTable)
      .where(and(eq(appAccessTable.email, email.toLowerCase()), eq(appAccessTable.password, hashPassword(password)))).limit(1);
    if (!client) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const token = makeToken(client.id);
    res.json({ client: toClientDto(client), token });
  } catch (err) {
    req.log.error({ err }, "AppLogin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login by email only — used when user has no password (auto-generated at signup)
router.post("/app/login-by-email", async (req, res) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) { res.status(400).json({ error: "Email is required" }); return; }
    const [client] = await db.select().from(appAccessTable)
      .where(eq(appAccessTable.email, email.toLowerCase())).limit(1);
    if (!client) { res.status(404).json({ error: "No account found for this email" }); return; }
    const token = makeToken(client.id);
    res.json({ client: toClientDto(client), token });
  } catch (err) {
    req.log.error({ err }, "AppLoginByEmail error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get me
router.get("/app/me", requireClientAuth, async (req: any, res) => {
  try {
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json(toClientDto(client));
  } catch (err) {
    req.log.error({ err }, "AppGetMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Activate license key — validates email match
router.post("/app/activate", requireClientAuth, async (req: any, res) => {
  try {
    const { licenseKey } = req.body as { licenseKey: string };
    if (!licenseKey) { res.status(400).json({ error: "License key required" }); return; }

    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    if (client.status !== "approved") { res.status(403).json({ error: "Account not yet approved" }); return; }

    // Find the license
    const [license] = await db.select().from(licensesTable)
      .where(and(eq(licensesTable.key, licenseKey.trim()), eq(licensesTable.status, "active"))).limit(1);
    if (!license) { res.status(404).json({ error: "Invalid or expired license key" }); return; }

    // Enforce email pairing — license must be issued to this client's email
    if (license.clientEmail && license.clientEmail.toLowerCase() !== client.email.toLowerCase()) {
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
router.get("/app/dashboard", requireClientAuth, async (req: any, res) => {
  try {
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    if (client.status !== "approved" || !client.mentorId) {
      res.json({ client: toClientDto(client), mentor: null, eas: [] }); return;
    }

    const [mentor] = await db.select({
      id: usersTable.id, mentorName: usersTable.mentorName, robotName: usersTable.robotName,
      robotTagline: usersTable.robotTagline, backgroundImageUrl: usersTable.backgroundImageUrl,
    }).from(usersTable).where(eq(usersTable.id, client.mentorId)).limit(1);

    const eas = await db.select().from(easTable)
      .where(and(eq(easTable.mentorId, client.mentorId), eq(easTable.isActive, true)));

    res.json({ client: toClientDto(client), mentor: mentor ?? null, eas });
  } catch (err) {
    req.log.error({ err }, "AppDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
