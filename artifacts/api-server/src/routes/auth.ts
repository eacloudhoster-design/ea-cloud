import { issueSession, revokeBrowserSessions } from "../lib/browser-session";
import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { issueApiKey } from "../lib/api-key";
import { authLimiter } from "../lib/rate-limit";
import { sendMentorApplicationReceivedEmail } from "../lib/email";

// Public endpoint: check approval status by email (no auth needed — polling from pending screen)
const statusRouter = Router();

const router = Router();

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "ea_cloud_salt_2024").digest("hex");
}


router.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (user.password !== hashPassword(password)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (user.status === "pending") {
      res.status(403).json({ error: "pending_approval" });
      return;
    }

    if (user.status === "rejected" || user.status === "suspended" || user.status === "disabled") {
      res.status(403).json({ error: `Account is ${user.status}` });
      return;
    }

    const token = await issueSession(req, res, user, "portal");
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/register", authLimiter, async (req, res) => {
  try {
    const { firstName, lastName, email, password, mentorName, phone } = req.body as {
      firstName: string; lastName: string; email: string; password: string;
      mentorName: string; phone?: string;
    };

    if (!email || !password || !firstName || !lastName || !mentorName) {
      res.status(400).json({ error: "All fields required" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      password: hashPassword(password),
      firstName,
      lastName,
      role: "mentor",
      status: "pending",
      mentorName,
      phone: phone || null,
      robotName: "EA Robot",
      robotTagline: "Powered by EA Cloud",
      apiKey: null, // will be set by issueApiKey below
      licenseLimit: 10,
      strikes: 0,
    }).returning();

    // Auto-generate API key immediately on registration
    await issueApiKey(user.id);

    // Send "application received" confirmation (fire-and-forget — never fail
    // registration if the email cannot be delivered)
    sendMentorApplicationReceivedEmail({
      toEmail: user.email,
      firstName: user.firstName,
    }).catch((emailErr) =>
      req.log.warn({ emailErr, mentorId: user.id }, "Application-received email failed to send"),
    );

    const token = ""; // Pending registrations do not grant an authenticated session.
    res.status(201).json({
      user: {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role, status: user.status,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", revokeBrowserSessions);

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id, email: user.email, firstName: user.firstName,
      lastName: user.lastName, role: user.role, status: user.status,
      createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "GetMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Public: check approval status by email — used for polling from the pending screen
router.get("/auth/status", async (req, res) => {
  try {
    const email = String(req.query.email || "").toLowerCase().trim();
    if (!email) { res.status(400).json({ error: "email required" }); return; }
    const [user] = await db.select({ status: usersTable.status }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) { res.status(404).json({ error: "not found" }); return; }
    res.json({ status: user.status });
  } catch (err) {
    req.log.error({ err }, "GetStatus error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
