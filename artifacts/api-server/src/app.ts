import { browserSessionMiddleware } from "./lib/browser-session";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./lib/rate-limit";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app: Express = express();

// Trust the reverse proxy that sits in front of this service (Replit's shared proxy).
// Required so express-rate-limit reads the real client IP from X-Forwarded-For.
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// ── Global rate limit ─────────────────────────────────────────────
app.use("/api", globalLimiter);

app.use("/api/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api", browserSessionMiddleware, router);

export default app;
