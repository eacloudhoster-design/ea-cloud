import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { sessionFailureInfo } from "../lib/session-diagnostics";

let readiness: Promise<void> | undefined;

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Keep liveness separate: a transient database outage must not create a
// Render restart loop. Concurrent readiness probes share one bounded query.
router.get("/readyz", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    readiness ??= pool
      .query("SELECT 1")
      .then(() => {})
      .finally(() => {
        readiness = undefined;
      });
    await readiness;
    res.json({ status: "ok" });
  } catch (error) {
    req.log?.warn(
      {
        event: "backend_database_not_ready",
        ...sessionFailureInfo(error),
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
      },
      "Database readiness unavailable",
    );
    res.status(503).json({ status: "unavailable", code: "DATABASE_NOT_READY" });
  }
});

export default router;
