import {startPushWorker} from "./lib/web-push";
import http from "http";
import app from "./app";
import { createWsServer } from "./ws";
import { logger } from "./lib/logger";
import { db, brokerServersTable } from "@workspace/db";
import { backfillApiKeys, backfillEncryptedKeys } from "./lib/api-key";
import { expireStaleAccounts } from "./routes/mt5-validation";
import { reconcileOnStartup, startWorker, signalWorkerHealthy } from "./lib/signal-worker";

async function seedBrokerServers() {
  try {
    const existing = await db.select({ id: brokerServersTable.id }).from(brokerServersTable).limit(1);
    if (existing.length > 0) return; // already seeded

    const servers: Array<{ brokerName: string; serverName: string; serverType: "demo" | "live" }> = [
      // Exness Demo
      ...Array.from({ length: 15 }, (_, i) => ({
        brokerName: "Exness",
        serverName: i === 0 ? "Exness-MT5Trial" : `Exness-MT5Trial${i + 1}`,
        serverType: "demo" as const,
      })),
      // Exness Live
      ...Array.from({ length: 30 }, (_, i) => ({
        brokerName: "Exness",
        serverName: i === 0 ? "Exness-MT5Real" : `Exness-MT5Real${i + 1}`,
        serverType: "live" as const,
      })),
      // JustMarkets
      { brokerName: "JustMarkets", serverName: "JustMarkets-Live", serverType: "live" },
      { brokerName: "JustMarkets", serverName: "JustMarkets-Live2", serverType: "live" },
      { brokerName: "JustMarkets", serverName: "JustMarkets-Live3", serverType: "live" },
      { brokerName: "JustMarkets", serverName: "JustMarkets-Demo", serverType: "demo" },
      { brokerName: "JustMarkets", serverName: "JustMarkets-Demo2", serverType: "demo" },
      { brokerName: "JustMarkets", serverName: "JustMarketsCY-Live", serverType: "live" },
      { brokerName: "JustMarkets", serverName: "JustMarketsCY-Demo", serverType: "demo" },
      // Profin Wealth
      { brokerName: "Profin Wealth", serverName: "Profin Wealth-Live", serverType: "live" },
      { brokerName: "Profin Wealth", serverName: "Profin Wealth-Demo", serverType: "demo" },
      // RCG Markets
      { brokerName: "RCGMarkets", serverName: "RCGMarkets-Real", serverType: "live" },
      { brokerName: "RCGMarkets", serverName: "RCGMarkets-Demo", serverType: "demo" },
    ];

    await db.insert(brokerServersTable).values(servers);
    logger.info({ count: servers.length }, "Broker servers seeded");
  } catch (err) {
    logger.warn({ err }, "Broker server seed skipped");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
createWsServer(server);

// Open the port FIRST so the deployment health check passes and the container
// becomes ready. Startup/maintenance tasks must never gate `listen()` — if one
// of them rejects, the server still serves traffic instead of the port never
// opening and the deploy failing its readiness probe.
server.listen(port, () => {
  logger.info({ port }, "Server listening");
  startPushWorker(logger,signalWorkerHealthy);
  void runStartupTasks();
});

async function runStartupTasks() {
  try {
    // Best-effort maintenance tasks. Failures are logged but must never block the
    // server (already listening) or each other.
    const maintenance: Array<{ name: string; run: Promise<unknown> }> = [
      { name: "seedBrokerServers", run: seedBrokerServers() },
      { name: "backfillApiKeys", run: backfillApiKeys(logger) },
      { name: "backfillEncryptedKeys", run: backfillEncryptedKeys(logger) },
      { name: "expireStaleAccounts", run: expireStaleAccounts(logger) },
    ];

    const results = await Promise.allSettled(maintenance.map((t) => t.run));
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        logger.error({ err: result.reason, task: maintenance[i]!.name }, "Startup task failed");
      }
    });
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      logger.warn({ failed, total: maintenance.length }, "Some startup tasks failed");
    }

    // The durable signal queue worker may ONLY start after reconciliation has
    // SUCCESSFULLY re-queued signals interrupted by the previous shutdown. If
    // reconciliation fails, skip the worker (safe degraded state) rather than
    // risk double- or missed-processing of in-flight signals.
    try {
      await reconcileOnStartup(logger);
      startWorker(logger);
    } catch (err) {
      logger.error({ err }, "Startup reconciliation failed; signal worker NOT started");
    }
  } catch (err) {
    logger.error({ err }, "Unexpected error during startup tasks");
  }
}
