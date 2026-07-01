import { Router } from "express";
import { requireSuperAdmin, type AuthRequest } from "../middlewares/auth";
import { regenKeyLimiter } from "../lib/rate-limit";
import { isEmailConfigured, sendTestEmail } from "../lib/email";

const router = Router();

// POST /api/test-email — send a test email to verify Gmail SMTP configuration.
// Protected (super admin only) and rate-limited to prevent abuse.
// Body: { to?: string } — defaults to the configured EMAIL_ADDRESS.
router.post("/test-email", requireSuperAdmin, regenKeyLimiter, async (req: AuthRequest, res) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({
        error: "Email not configured: EMAIL_ADDRESS and EMAIL_PASSWORD must be set in Replit Secrets",
      });
      return;
    }

    const { to } = (req.body ?? {}) as { to?: string };
    const recipient = (to && to.trim()) || process.env.EMAIL_ADDRESS!;

    await sendTestEmail(recipient);
    req.log.info({ to: recipient }, "Test email sent");
    res.json({ success: true, to: recipient });
  } catch (err) {
    req.log.error({ err }, "Test email failed");
    res.status(500).json({ error: "Failed to send test email. Check server logs for details." });
  }
});

export default router;
