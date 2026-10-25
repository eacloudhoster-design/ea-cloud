import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isEmailConfigured, sendPrivacyRequestEmail } from "../lib/email";
export const privacyRequestSchema = z
  .object({
    email: z.string().trim().email().max(254),
    kind: z.enum([
      "access",
      "correction",
      "deletion",
      "marketing_objection",
      "privacy_question",
    ]),
    message: z.string().trim().min(10).max(2000),
    acknowledged: z.literal(true),
  })
  .strict();
export function createPrivacyRouter(
  deps = { configured: isEmailConfigured, deliver: sendPrivacyRequestEmail },
) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 60 * 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error:
        "Too many privacy requests. Please try later or email eacloudhoster@gmail.com.",
    },
  });
  router.post("/privacy/requests", limit, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const origins = [
      process.env.PUBLIC_WEBSITE_ORIGIN || "https://ea-cloud-website.pages.dev",
      ...(process.env.PRIVACY_ALLOWED_ORIGINS || "").split(","),
      `${req.protocol}://${req.get("host")}`,
    ]
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      typeof req.headers.origin !== "string" ||
      !origins.includes(req.headers.origin)
    ) {
      res
        .status(403)
        .json({ error: "Submit this request from the EA Cloud website." });
      return;
    }
    if (!req.is("application/json")) {
      res.status(415).json({ error: "Use the website privacy form." });
      return;
    }
    const parsed = privacyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          "Provide a valid email, request type, 10–2,000 character message and confirmation. Do not include passwords or payment details.",
      });
      return;
    }
    if (!deps.configured()) {
      res.status(503).json({
        error:
          "Email delivery is not configured. Your request has not been submitted. Email eacloudhoster@gmail.com directly.",
      });
      return;
    }
    const id = randomUUID();
    try {
      await deps.deliver({ ...parsed.data, id });
      res.status(201).json({
        id,
        message:
          "Your request was accepted by EA Cloud’s email service for administrator review. Identity verification is required before account-specific information or changes can be provided.",
      });
    } catch {
      req.log?.warn?.(
        { event: "privacy_request_delivery_unconfirmed", requestId: id },
        "Privacy request email was not confirmed",
      );
      res.status(503).json({
        error:
          "Delivery was not confirmed. Your message remains in the form. Retry or email eacloudhoster@gmail.com directly.",
      });
    }
  });
  return router;
}
export default createPrivacyRouter();
