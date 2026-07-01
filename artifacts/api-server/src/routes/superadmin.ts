import { Router } from "express";
import { db, usersTable, licensesTable, clientsTable, appAccessTable, tradeSignalsTable } from "@workspace/db";
import { eq, count, ne, desc, and, inArray } from "drizzle-orm";
import { requireSuperAdmin, type AuthRequest } from "../middlewares/auth";
import { sendMentorApprovedEmail, sendMentorApprovedEmailPersonalized, sendInstagramMovedEmail, sendMobileAppLaunchEmail, sendPaymentApprovalEmail, isEmailConfigured } from "../lib/email";
import { ensureMentorHasApiKey } from "../lib/api-key";

const router = Router();

router.get("/superadmin/dashboard", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const [totalMentors] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "mentor"));
    const [pendingMentors] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "pending"));
    const [approvedMentors] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "approved"));
    const [rejectedMentors] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "rejected"));
    const [totalClients] = await db.select({ count: count() }).from(clientsTable);
    const [totalLicenses] = await db.select({ count: count() }).from(licensesTable);
    const [activeLicenses] = await db.select({ count: count() }).from(licensesTable).where(eq(licensesTable.status, "active"));
    const [appUsers] = await db.select({ count: count() }).from(appAccessTable).where(eq(appAccessTable.status, "approved"));
    const [pendingAppUsers] = await db.select({ count: count() }).from(appAccessTable).where(eq(appAccessTable.status, "pending"));

    res.json({
      totalMentors: Number(totalMentors.count),
      pendingMentors: Number(pendingMentors.count),
      approvedMentors: Number(approvedMentors.count),
      rejectedMentors: Number(rejectedMentors.count),
      totalClients: Number(totalClients.count),
      totalLicenses: Number(totalLicenses.count),
      activeLicenses: Number(activeLicenses.count),
      appUsers: Number(appUsers.count),
      pendingAppUsers: Number(pendingAppUsers.count),
    });
  } catch (err) {
    req.log.error({ err }, "SuperAdminDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/superadmin/mentors", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const mentors = await db.select().from(usersTable).where(eq(usersTable.role, "mentor"));

    const mentorsWithStats = await Promise.all(mentors.map(async (mentor) => {
      const [licenseCount] = await db.select({ count: count() }).from(licensesTable).where(eq(licensesTable.mentorId, mentor.id));
      const [clientCount] = await db.select({ count: count() }).from(clientsTable).where(eq(clientsTable.mentorId, mentor.id));
      return {
        id: mentor.id, email: mentor.email, firstName: mentor.firstName,
        lastName: mentor.lastName, mentorName: mentor.mentorName, robotName: mentor.robotName,
        status: mentor.status, strikes: mentor.strikes, licenseLimit: mentor.licenseLimit,
        totalLicenses: Number(licenseCount.count), activeClients: Number(clientCount.count),
        createdAt: mentor.createdAt,
      };
    }));

    res.json(mentorsWithStats);
  } catch (err) {
    req.log.error({ err }, "GetSuperAdminMentors error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/mentors/:id/approve", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [mentor] = await db.update(usersTable).set({ status: "approved" }).where(eq(usersTable.id, id)).returning();
    if (mentor) await ensureMentorHasApiKey(mentor.id);
    if (!mentor) { res.status(404).json({ error: "Not found" }); return; }
    const [licenseCount] = await db.select({ count: count() }).from(licensesTable).where(eq(licensesTable.mentorId, mentor.id));
    const [clientCount] = await db.select({ count: count() }).from(clientsTable).where(eq(clientsTable.mentorId, mentor.id));

    // Send approval email (fire-and-forget — don't fail the request if email fails)
    sendMentorApprovedEmail({
      toEmail: mentor.email,
      firstName: mentor.firstName,
    }).catch((emailErr) =>
      req.log.warn({ emailErr, mentorId: mentor.id }, "Mentor approval email failed to send"),
    );

    res.json({ id: mentor.id, email: mentor.email, firstName: mentor.firstName,
      lastName: mentor.lastName, mentorName: mentor.mentorName, robotName: mentor.robotName,
      status: mentor.status, strikes: mentor.strikes, licenseLimit: mentor.licenseLimit,
      totalLicenses: Number(licenseCount.count), activeClients: Number(clientCount.count),
      createdAt: mentor.createdAt });
  } catch (err) {
    req.log.error({ err }, "ApproveMentor error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Resend the (updated) approval email to every already-approved mentor, one by one.
router.post("/superadmin/mentors/resend-approval-email", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const mentors = await db
      .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName })
      .from(usersTable)
      .where(and(eq(usersTable.role, "mentor"), eq(usersTable.status, "approved")));

    const results: { id: number; email: string; sent: boolean }[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const mentor of mentors) {
      try {
        await sendMentorApprovedEmail({ toEmail: mentor.email, firstName: mentor.firstName });
        sentCount++;
        results.push({ id: mentor.id, email: mentor.email, sent: true });
        req.log.info({ mentorId: mentor.id }, "Resent approval email to mentor");
      } catch (emailErr) {
        failedCount++;
        results.push({ id: mentor.id, email: mentor.email, sent: false });
        req.log.warn({ emailErr, mentorId: mentor.id }, "Resend approval email failed for mentor");
      }
    }

    req.log.info({ total: mentors.length, sentCount, failedCount }, "Bulk resend approval emails complete");
    res.json({ total: mentors.length, sent: sentCount, failed: failedCount, results });
  } catch (err) {
    req.log.error({ err }, "ResendApprovalEmails error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send the personalized (name + robot name) approval email to a provided list of
// recipients, sequentially, with per-recipient success/failure logging.
// Body: { recipients: [{ name, email, robotName }] }
router.post("/superadmin/mentors/resend-approval-email-personalized", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({
        error: "Email not configured: EMAIL_ADDRESS and EMAIL_PASSWORD must be set in Replit Secrets",
      });
      return;
    }

    const body = (req.body ?? {}) as {
      recipients?: { name?: string; email?: string; robotName?: string }[];
    };
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      res.status(400).json({ error: "Body must include a non-empty 'recipients' array" });
      return;
    }

    const results: { email: string; name: string; sent: boolean; error?: string }[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const r of body.recipients) {
      // Coerce defensively so a malformed (non-string) field can never abort the
      // whole batch — bad records are marked failed and we keep going.
      const email = typeof r?.email === "string" ? r.email.trim() : "";
      const name = typeof r?.name === "string" ? r.name.trim() : "";
      const robotName = typeof r?.robotName === "string" ? r.robotName.trim() : "";

      if (!email) {
        failedCount++;
        results.push({ email: "", name, sent: false, error: "missing or invalid email" });
        req.log.warn({ name, robotName }, "Skipped personalized approval email — missing/invalid email");
        continue;
      }

      try {
        await sendMentorApprovedEmailPersonalized({ toEmail: email, name, robotName });
        sentCount++;
        results.push({ email, name, sent: true });
        req.log.info({ email, robotName }, "Sent personalized approval email");
      } catch (emailErr) {
        failedCount++;
        results.push({ email, name, sent: false, error: "send failed" });
        req.log.warn({ emailErr, email, robotName }, "Personalized approval email failed");
      }
    }

    req.log.info(
      { total: body.recipients.length, sentCount, failedCount },
      "Bulk personalized approval emails complete",
    );
    res.json({ total: body.recipients.length, sent: sentCount, failed: failedCount, results });
  } catch (err) {
    req.log.error({ err }, "ResendApprovalEmailsPersonalized error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/mentors/broadcast-instagram-moved", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({
        error: "Email not configured: EMAIL_ADDRESS and EMAIL_PASSWORD must be set in Replit Secrets",
      });
      return;
    }

    const body = (req.body ?? {}) as {
      recipients?: { email?: string }[];
      instagramUrl?: string;
    };
    const instagramUrl = typeof body.instagramUrl === "string" ? body.instagramUrl.trim() : "";
    if (!instagramUrl) {
      res.status(400).json({ error: "Body must include 'instagramUrl'" });
      return;
    }
    // Only allow http(s) links — the URL is rendered into an email anchor, so
    // reject anything that isn't a valid web URL (blocks javascript:/data: etc.).
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(instagramUrl);
    } catch {
      res.status(400).json({ error: "'instagramUrl' must be a valid URL" });
      return;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      res.status(400).json({ error: "'instagramUrl' must be an http(s) URL" });
      return;
    }
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      res.status(400).json({ error: "Body must include a non-empty 'recipients' array" });
      return;
    }

    const results: { email: string; sent: boolean; error?: string }[] = [];
    let sentCount = 0;
    let failedCount = 0;

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const r of body.recipients) {
      const email = typeof r?.email === "string" ? r.email.trim() : "";
      if (!email || !emailRe.test(email)) {
        failedCount++;
        results.push({ email, sent: false, error: "missing or invalid email" });
        req.log.warn("Skipped Instagram-moved email — missing/invalid email");
        continue;
      }
      try {
        await sendInstagramMovedEmail({ toEmail: email, instagramUrl });
        sentCount++;
        results.push({ email, sent: true });
        req.log.info({ email }, "Sent Instagram-moved email");
      } catch (emailErr) {
        failedCount++;
        results.push({ email, sent: false, error: "send failed" });
        req.log.warn({ emailErr, email }, "Instagram-moved email failed");
      }
    }

    req.log.info(
      { total: body.recipients.length, sentCount, failedCount },
      "Bulk Instagram-moved emails complete",
    );
    res.json({ total: body.recipients.length, sent: sentCount, failed: failedCount, results });
  } catch (err) {
    req.log.error({ err }, "BroadcastInstagramMoved error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk campaign: announce the EA Cloud mobile app to a list of approved mentors.
// Does NOT touch any account or status — it only sends email. Personalizes the
// greeting from each mentor's stored name when we can match the email in the DB.
router.post("/superadmin/mentors/broadcast-mobile-app", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({
        error: "Email not configured: EMAIL_ADDRESS and EMAIL_PASSWORD must be set in Replit Secrets",
      });
      return;
    }

    const body = (req.body ?? {}) as { recipients?: { email?: string }[] };
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      res.status(400).json({ error: "Body must include a non-empty 'recipients' array" });
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Normalize + dedupe (case-insensitive) so a duplicate address can't be mailed twice.
    const seen = new Set<string>();
    const emails: string[] = [];
    const invalid: { email: string; sent: false; error: string }[] = [];
    for (const r of body.recipients) {
      const email = typeof r?.email === "string" ? r.email.trim() : "";
      const key = email.toLowerCase();
      if (!email || !emailRe.test(email)) {
        invalid.push({ email, sent: false, error: "missing or invalid email" });
        req.log.warn("Skipped mobile-app email — missing/invalid email");
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }

    // Look up stored names for personalization (mentorName preferred, else firstName).
    const nameByEmail = new Map<string, string>();
    if (emails.length > 0) {
      const rows = await db
        .select({ email: usersTable.email, firstName: usersTable.firstName, mentorName: usersTable.mentorName })
        .from(usersTable)
        .where(inArray(usersTable.email, emails));
      for (const row of rows) {
        const name = (row.mentorName?.trim() || row.firstName?.trim() || "");
        nameByEmail.set(row.email.toLowerCase(), name);
      }
    }

    const results: { email: string; sent: boolean; error?: string }[] = [...invalid];
    let sentCount = 0;
    let failedCount = invalid.length;

    for (const email of emails) {
      const mentorName = nameByEmail.get(email.toLowerCase()) ?? "";
      try {
        await sendMobileAppLaunchEmail({ toEmail: email, mentorName });
        sentCount++;
        results.push({ email, sent: true });
        req.log.info({ email, personalized: Boolean(mentorName) }, "Sent mobile-app campaign email");
      } catch (emailErr) {
        failedCount++;
        results.push({ email, sent: false, error: "send failed" });
        req.log.warn({ emailErr, email }, "Mobile-app campaign email failed");
      }
    }

    req.log.info(
      { total: body.recipients.length, sentCount, failedCount },
      "Bulk mobile-app campaign complete",
    );
    res.json({ total: body.recipients.length, sent: sentCount, failed: failedCount, results });
  } catch (err) {
    req.log.error({ err }, "BroadcastMobileApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/mentors/broadcast-payment-approval", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({
        error: "Email not configured: EMAIL_ADDRESS and EMAIL_PASSWORD must be set in Replit Secrets",
      });
      return;
    }

    const body = (req.body ?? {}) as { recipients?: { email?: string; name?: string }[] };
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
      res.status(400).json({ error: "Body must include a non-empty 'recipients' array" });
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Normalize + dedupe (case-insensitive). Names come from the request body
    // (the pasted recipient list), NOT a DB lookup, so personalization works
    // even when the recipient isn't a stored user in this environment.
    const seen = new Set<string>();
    const recipients: { email: string; name: string }[] = [];
    const invalid: { email: string; sent: false; error: string }[] = [];
    for (const r of body.recipients) {
      const email = typeof r?.email === "string" ? r.email.trim() : "";
      const name = typeof r?.name === "string" ? r.name.trim() : "";
      const key = email.toLowerCase();
      if (!email || !emailRe.test(email)) {
        invalid.push({ email, sent: false, error: "missing or invalid email" });
        req.log.warn("Skipped payment-approval email — missing/invalid email");
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({ email, name });
    }

    const results: { email: string; sent: boolean; error?: string }[] = [...invalid];
    let sentCount = 0;
    let failedCount = invalid.length;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const { email, name } of recipients) {
      try {
        await sendPaymentApprovalEmail({ toEmail: email, name });
        sentCount++;
        results.push({ email, sent: true });
        req.log.info({ email, personalized: Boolean(name) }, "Sent payment-approval campaign email");
      } catch (emailErr) {
        failedCount++;
        results.push({ email, sent: false, error: "send failed" });
        req.log.warn({ emailErr, email }, "Payment-approval campaign email failed");
      }
      // Gentle pacing between sends (pooled transporter already throttles).
      await sleep(500);
    }

    req.log.info(
      { total: body.recipients.length, sentCount, failedCount },
      "Bulk payment-approval campaign complete",
    );
    res.json({ total: body.recipients.length, sent: sentCount, failed: failedCount, results });
  } catch (err) {
    req.log.error({ err }, "BroadcastPaymentApproval error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/mentors/:id/reject", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [mentor] = await db.update(usersTable).set({ status: "rejected" }).where(eq(usersTable.id, id)).returning();
    if (!mentor) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: mentor.id, email: mentor.email, firstName: mentor.firstName,
      lastName: mentor.lastName, mentorName: mentor.mentorName || "", robotName: mentor.robotName || "",
      status: mentor.status, strikes: mentor.strikes, licenseLimit: mentor.licenseLimit,
      totalLicenses: 0, activeClients: 0, createdAt: mentor.createdAt });
  } catch (err) {
    req.log.error({ err }, "RejectMentor error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/mentors/:id/suspend", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [mentor] = await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, id)).returning();
    if (!mentor) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: mentor.id, email: mentor.email, firstName: mentor.firstName,
      lastName: mentor.lastName, mentorName: mentor.mentorName || "", robotName: mentor.robotName || "",
      status: mentor.status, strikes: mentor.strikes, licenseLimit: mentor.licenseLimit,
      totalLicenses: 0, activeClients: 0, createdAt: mentor.createdAt });
  } catch (err) {
    req.log.error({ err }, "SuspendMentor error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/mentors/:id/strike", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const newStrikes = (existing.strikes || 0) + 1;
    const newStatus = newStrikes >= 3 ? "disabled" : existing.status;
    const [mentor] = await db.update(usersTable).set({ strikes: newStrikes, status: newStatus }).where(eq(usersTable.id, id)).returning();
    res.json({ id: mentor.id, email: mentor.email, firstName: mentor.firstName,
      lastName: mentor.lastName, mentorName: mentor.mentorName || "", robotName: mentor.robotName || "",
      status: mentor.status, strikes: mentor.strikes, licenseLimit: mentor.licenseLimit,
      totalLicenses: 0, activeClients: 0, createdAt: mentor.createdAt });
  } catch (err) {
    req.log.error({ err }, "StrikeMentor error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/superadmin/mentors/:id/remove", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "RemoveMentor error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/superadmin/mentors/:id/license-limit", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { limit } = req.body as { limit: number };
    const [mentor] = await db.update(usersTable).set({ licenseLimit: limit }).where(eq(usersTable.id, id)).returning();
    if (!mentor) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: mentor.id, email: mentor.email, firstName: mentor.firstName,
      lastName: mentor.lastName, mentorName: mentor.mentorName || "", robotName: mentor.robotName || "",
      status: mentor.status, strikes: mentor.strikes, licenseLimit: mentor.licenseLimit,
      totalLicenses: 0, activeClients: 0, createdAt: mentor.createdAt });
  } catch (err) {
    req.log.error({ err }, "UpdateLicenseLimit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Durable signal queue visibility — status counts + most recent signals.
router.get("/superadmin/signal-queue", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const [pending] = await db.select({ count: count() }).from(tradeSignalsTable).where(eq(tradeSignalsTable.status, "pending"));
    const [executing] = await db.select({ count: count() }).from(tradeSignalsTable).where(eq(tradeSignalsTable.status, "executing"));
    const [success] = await db.select({ count: count() }).from(tradeSignalsTable).where(eq(tradeSignalsTable.status, "success"));
    const [failed] = await db.select({ count: count() }).from(tradeSignalsTable).where(eq(tradeSignalsTable.status, "failed"));

    const recent = await db.select({
      id: tradeSignalsTable.id,
      mentorId: tradeSignalsTable.mentorId,
      signal: tradeSignalsTable.signal,
      symbol: tradeSignalsTable.symbol,
      orderType: tradeSignalsTable.orderType,
      lots: tradeSignalsTable.lots,
      ticket: tradeSignalsTable.ticket,
      status: tradeSignalsTable.status,
      attempts: tradeSignalsTable.attempts,
      lastError: tradeSignalsTable.lastError,
      nextAttemptAt: tradeSignalsTable.nextAttemptAt,
      processedAt: tradeSignalsTable.processedAt,
      createdAt: tradeSignalsTable.createdAt,
      updatedAt: tradeSignalsTable.updatedAt,
    }).from(tradeSignalsTable).orderBy(desc(tradeSignalsTable.createdAt)).limit(50);

    res.json({
      counts: {
        pending: Number(pending.count),
        executing: Number(executing.count),
        success: Number(success.count),
        failed: Number(failed.count),
      },
      recent,
    });
  } catch (err) {
    req.log.error({ err }, "SignalQueue error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
