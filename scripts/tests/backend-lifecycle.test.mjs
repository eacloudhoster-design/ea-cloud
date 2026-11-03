import { test } from "node:test";
import assert from "node:assert/strict";
import { createShutdown } from "../../artifacts/api-server/src/lib/shutdown.ts";
import { startBackendDiagnostics } from "../../artifacts/api-server/src/lib/backend-lifecycle.ts";

const logger = (records) =>
  Object.fromEntries(
    ["info", "warn", "error"].map((key) => [
      key,
      (record) => records.push(record),
    ]),
  );
test("resource sampling is bounded, sanitized and stops on shutdown", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const records = [],
    stop = startBackendDiagnostics(
      { totalCount: 10, idleCount: 0, waitingCount: 8 },
      logger(records),
      () => false,
    );
  t.mock.timers.tick(60000);
  assert.equal(records.length, 1);
  assert.equal(records[0].event, "backend_lifecycle_sample");
  assert.equal(records[0].pool.waiting, 8);
  assert.equal(records[0].signalWorkerHealthy, false);
  assert.ok(records[0].rssBytes > 0);
  stop();
  t.mock.timers.tick(120000);
  assert.equal(records.length, 1);
});
test("external shutdown stops workers once and drains HTTP before ending pool", async () => {
  const records = [],
    actions = [];
  let drained;
  const shutdown = createShutdown({
    server: {
      close: (cb) => {
        actions.push("close");
        drained = cb;
      },
      closeAllConnections: () => actions.push("force"),
    },
    sockets: {
      clients: [{ terminate: () => actions.push("ws") }],
      close: () => actions.push("ws-close"),
    },
    pool: { end: async () => actions.push("pool") },
    stop: () => actions.push("stop"),
    log: logger(records),
    exit: () => actions.push("exit"),
  });
  shutdown("SIGTERM");
  shutdown("SIGTERM");
  assert.deepEqual(actions, ["stop", "ws", "ws-close", "close"]);
  drained();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(actions, ["stop", "ws", "ws-close", "close", "pool"]);
  assert.equal(records.at(-1).event, "backend_shutdown_complete");
});
test("stuck drain has a bounded deadline only after an external shutdown", async () => {
  const records = [],
    actions = [];
  const shutdown = createShutdown({
    server: {
      close: () => {},
      closeAllConnections: () => actions.push("force"),
    },
    sockets: { clients: [], close: () => {} },
    pool: { end: async () => {} },
    stop: () => {},
    log: logger(records),
    exit: () => actions.push("exit"),
    graceMs: 20,
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(actions, []);
  shutdown("SIGTERM");
  await new Promise((r) => setTimeout(r, 35));
  assert.deepEqual(actions, ["force", "exit"]);
  assert.equal(records.at(-1).event, "backend_shutdown_deadline");
});
