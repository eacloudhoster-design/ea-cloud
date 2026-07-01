import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const json429 = (_req: any, res: any) =>
  res.status(429).json({ error: "Too many requests. Please slow down and try again." });

// Strict limiter for auth endpoints (login, register) — 20 attempts per 15 min per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Limiter for API-key-authenticated webhook (EA signal POSTs)
// Key is the raw API key header so each mentor gets their own bucket
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
  keyGenerator: (req) => {
    const apiKey = req.headers["x-api-key"] as string | undefined;
    return apiKey ?? ipKeyGenerator(req.ip ?? "unknown");
  },
});

// General API limiter applied globally — 300 req/min per IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Regenerate-API-key — very tight (5 per hour per IP) to prevent key-cycling abuse
export const regenKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});
