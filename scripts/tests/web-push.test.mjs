import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const load = async (path) => {
  const b = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    banner: {
      js: 'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");',
    },
    plugins: [
      {
        name: "db-fixture",
        setup(b) {
          b.onResolve(
            { filter: /^@workspace\/db$|signal-worker$/ },
            (args) => ({
              path: args.path,
              namespace: "fixture",
            }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents: args.path.endsWith("signal-worker")
              ? "export const signalWorkerHealthy=()=>globalThis.__pushEngineHealthy!==false;"
              : "export const db=globalThis.__pushDB;export const pushSubscriptionsTable=globalThis.__pushSchema?.pushSubscriptionsTable;export const pushEventsTable=globalThis.__pushSchema?.pushEventsTable;export const appAccessTable=globalThis.__pushSchema?.appAccessTable;export const licensesTable=globalThis.__pushSchema?.licensesTable;export const clientSettingsTable=globalThis.__pushSchema?.clientSettingsTable;export const pushDeliveriesTable=globalThis.__pushSchema?.pushDeliveriesTable;",
            loader: "js",
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(b.outputFiles[0].text).toString("base64")
  );
};
const lib = await load("artifacts/api-server/src/lib/web-push.ts");
test("push endpoints accept only trusted HTTPS providers and exact Web Push key lengths", () => {
  const sub = {
    endpoint: "https://web.push.apple.com/Qabcdef",
    keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
  };
  assert.ok(lib.subscriptionSchema.safeParse(sub).success);
  for (const endpoint of [
    "http://web.push.apple.com/a",
    "https://127.0.0.1/a",
    "https://web.push.apple.com.evil.test/a",
    "https://user@web.push.apple.com/a",
    "https://web.push.apple.com:444/a",
  ])
    assert.equal(
      lib.subscriptionSchema.safeParse({ ...sub, endpoint }).success,
      false,
    );
  assert.equal(
    lib.subscriptionSchema.safeParse({
      ...sub,
      keys: { p256dh: "short", auth: "x" },
    }).success,
    false,
  );
  assert.equal(lib.endpointHash(sub.endpoint).length, 64);
});
test(
  "actual push/settings routes enforce session ownership and send one event for each confirmed state transition",
  { skip: !process.env.PGLITE_MODULE },
  async () => {
    const { PGlite } = await import(process.env.PGLITE_MODULE),
      engine = new PGlite();
    const { drizzle } =
      await import("../../lib/db/node_modules/drizzle-orm/node-postgres/index.js");
    await mkdir("work/push-tests", { recursive: true });
    await build({
      entryPoints: ["lib/db/src/schema/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: "work/push-tests/schema.mjs",
    });
    const schema = await import(
        pathToFileURL(resolve("work/push-tests/schema.mjs"))
      ),
      { getTableConfig } =
        await import("../../lib/db/node_modules/drizzle-orm/pg-core/index.js");
    for (const table of [
      schema.appAccessTable,
      schema.licensesTable,
      schema.clientSettingsTable,
      schema.symbolPairsTable,
      schema.clientSymbolConfigsTable,
    ]) {
      const cfg = getTableConfig(table);
      await engine.exec(
        `CREATE TABLE "${cfg.name}" (${cfg.columns.map((c) => `"${c.name}" ${c.primary && [schema.symbolPairsTable, schema.clientSymbolConfigsTable].includes(table) ? "serial" : c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`,
      );
    }
    await engine.exec(
      `INSERT INTO app_access(id,status,mentor_id,license_key) VALUES(7,'approved',5,'VALID'),(9,'approved',6,'OTHER'); INSERT INTO licenses(id,key,status,mentor_id) VALUES(1,'VALID','active',5),(2,'OTHER','active',6); INSERT INTO client_settings(id,client_id,copying_enabled) VALUES(1,7,false);`,
    );
    const query = async (config, params) => {
      const r = await engine.query(
        typeof config === "string" ? config : config.text,
        params,
        { rowMode: config.rowMode === "array" ? "array" : "object" },
      );
      return { rows: r.rows, fields: r.fields };
    };
    const pool = {
      query,
      async connect() {
        return { query, release() {} };
      },
    };
    globalThis.__pushDB = drizzle(pool, { schema });
    globalThis.__pushSchema = schema;
    const { default: webpush } =
        await import("../../artifacts/api-server/node_modules/web-push/src/index.js"),
      vapid = webpush.generateVAPIDKeys();
    const saved = {};
    for (const k of [
      "WEB_PUSH_PUBLIC_KEY",
      "WEB_PUSH_PRIVATE_KEY",
      "WEB_PUSH_SUBJECT",
      "SESSION_SECRET",
    ])
      saved[k] = process.env[k];
    process.env.SESSION_SECRET = "push-fixture-session-secret-at-least-32";
    process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
    process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
    process.env.WEB_PUSH_SUBJECT = "mailto:admin@example.test";
    // Bundle actual routers against isolated PostgreSQL; only outbound OS push is mocked.
    globalThis.__sentPush = [];
    await build({
      stdin: {
        contents:
          'export {default as push} from "./artifacts/api-server/src/routes/web-push";export {default as settings} from "./artifacts/api-server/src/routes/client-settings";export {requireAppSession} from "./artifacts/api-server/src/middlewares/app-session";export {issuePushSession} from "./artifacts/api-server/src/lib/push-session";export {deliverPushEvents,configurePushEngineHealth,queueExecutionPush} from "./artifacts/api-server/src/lib/web-push";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: "work/push-tests/routes.mjs",
      banner: {
        js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
      },
      plugins: [
        {
          name: "fixtures",
          setup(b) {
            b.onResolve(
              { filter: /^@workspace\/db$|^web-push$|signal-worker$/ },
              (args) => ({
                path: args.path,
                namespace: "fixture",
              }),
            );
            b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
              loader: "js",
              contents: args.path.endsWith("signal-worker")
                ? "export const signalWorkerHealthy=()=>globalThis.__pushEngineHealthy!==false;"
                : args.path === "web-push"
                  ? "export default {setVapidDetails(){},async sendNotification(sub,payload){if(globalThis.__pushNetworkFailure)throw Error('PRIVATE provider error');if(globalThis.__pushReject){throw {statusCode:globalThis.__pushReject,headers:{'retry-after':'3'}};}globalThis.__sentPush.push(JSON.parse(payload));return {statusCode:201};}};"
                  : `export const db=globalThis.__pushDB;${Object.keys(schema)
                      .filter((k) => k.endsWith("Table"))
                      .map(
                        (k) =>
                          `export const ${k}=globalThis.__pushSchema.${k};`,
                      )
                      .join("")}`,
            }));
          },
        },
      ],
    });
    const routes = await import(
        pathToFileURL(resolve("work/push-tests/routes.mjs"))
      ),
      { default: express } =
        await import("../../artifacts/api-server/node_modules/express/index.js"),
      { appRequest } = await import("./helpers/in-process-http.mjs");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.log = { warn() {}, error() {} };
      next();
    });
    app.use("/api/app", routes.requireAppSession);
    app.use("/api", routes.push, routes.settings);
    const call = (path, method = "GET", body, id = 7, extraHeaders = {}) =>
      appRequest(app, "https://fixture/api/app/" + path, {
        method,
        headers: {
          Authorization:
            "Bearer " + Buffer.from(`${id}:client:fixture`).toString("base64"),
          Cookie: (() => {
            let cookie = "";
            routes.issuePushSession(
              {
                cookie(name, value) {
                  cookie = name + "=" + value;
                },
              },
              id,
              Buffer.from(`${id}:client:fixture`).toString("base64"),
            );
            return cookie;
          })(),
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    routes.configurePushEngineHealth(
      () => globalThis.__pushEngineHealthy !== false,
    );
    globalThis.__pushEngineHealthy = false;
    const pump = async (count) => {
      for (let i = 0; i < 100 && globalThis.__sentPush.length < count; i++) {
        await routes.deliverPushEvents({ warn() {} });
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    try {
      assert.equal(
        (await (await call("push/status")).json()).storage.reason,
        "PUSH_BASE_MIGRATION_REQUIRED",
      );
      await engine.exec(
        await readFile("docs/migrations/20261024-web-push.sql", "utf8"),
      );
      assert.equal(
        (await (await call("push/status")).json()).storage.reason,
        "PUSH_DELIVERY_MIGRATION_REQUIRED",
      );
      await engine.exec(
        await readFile(
          "docs/migrations/20261025-web-push-reliability.sql",
          "utf8",
        ),
      );
      assert.equal(
        "privateKey" in (await (await call("push/status")).json()),
        false,
      );
      assert.equal(
        (await appRequest(app, "https://fixture/api/app/push/config")).status,
        401,
      );
      const sub = {
        endpoint: "https://web.push.apple.com/Qfixture",
        keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
      };
      assert.equal((await call("push/subscriptions", "POST", sub)).status, 201);
      assert.equal(
        (await call("push/subscriptions", "POST", sub, 9)).status,
        409,
      );
      assert.equal(
        (
          await call("trading-controls", "PATCH", {
            copyingEnabled: true,
            maxOpenTrades: "bad",
          })
        ).status,
        500,
      );
      assert.equal(
        (await engine.query("SELECT * FROM push_events")).rows.length,
        0,
        "Failed activation never creates a notification",
      );
      assert.equal(
        (await call("trading-controls", "PATCH", { copyingEnabled: true }))
          .status,
        200,
      );
      assert.equal(
        (await call("trading-controls", "PATCH", { copyingEnabled: true }))
          .status,
        200,
      );
      assert.equal(
        (await engine.query("SELECT * FROM push_events")).rows.length,
        1,
      );
      globalThis.__pushEngineHealthy = false;
      await routes.deliverPushEvents({ warn() {} });
      assert.equal(
        globalThis.__sentPush.length,
        0,
        "Start must wait for verified engine health",
      );
      globalThis.__pushEngineHealthy = true;
      await routes.deliverPushEvents({ warn() {} });
      await routes.deliverPushEvents({ warn() {} });
      await pump(1);
      assert.equal(globalThis.__sentPush.length, 1);
      assert.equal(
        globalThis.__sentPush[0].body,
        "Robot started successfully.",
      );
      assert.equal(
        (await call("trading-controls", "PATCH", { copyingEnabled: "false" }))
          .status,
        400,
      );
      assert.equal(
        (await engine.query("SELECT * FROM push_events")).rows.length,
        1,
      );
      assert.equal(
        (
          await call("trading-controls", "PATCH", {
            copyingEnabled: false,
            maxOpenTrades: "bad",
          })
        ).status,
        500,
      );
      assert.equal(
        (await engine.query("SELECT * FROM push_events")).rows.length,
        1,
        "Failed deactivation never creates a notification",
      );
      await call("trading-controls", "PATCH", { copyingEnabled: false });
      await routes.deliverPushEvents({ warn() {} });
      await pump(2);
      assert.equal(
        globalThis.__sentPush[1].body,
        "Robot stopped successfully.",
      );
      await call("push/subscriptions", "DELETE", { endpoint: sub.endpoint }, 9);
      assert.equal(
        (await engine.query("SELECT * FROM push_subscriptions")).rows.length,
        1,
      );
      const legacy = {
        ...sub,
        endpoint: "https://web.push.apple.com/legacy-unverified",
      };
      await engine.query(
        "INSERT INTO push_subscriptions(client_id,endpoint_hash,subscription) VALUES($1,$2,$3)",
        [7, lib.endpointHash(legacy.endpoint), JSON.stringify(legacy)],
      );
      const diagnostic = await (await call("push/status")).json();
      assert.equal(diagnostic.storage.ready, true);
      assert.equal(diagnostic.subscriptions, 1);
      assert.equal(diagnostic.unverifiedSubscriptions, 1);
      assert.equal(
        JSON.stringify(diagnostic).includes(vapid.privateKey),
        false,
      );
      const pending = {
        clientId: 7,
        id: 55,
        signalId: 88,
        status: "pending",
        signalKind: "OPEN",
        symbol: "XAUUSD",
        action: "BUY",
      };
      await routes.queueExecutionPush(7, pending);
      await routes.queueExecutionPush(7, pending);
      await pump(3);
      assert.equal(globalThis.__sentPush[2].title, "EA Cloud — Trade Alert");
      globalThis.__pushReject = 429;
      await routes.queueExecutionPush(7, {
        ...pending,
        status: "success",
        ticket: "verified",
        retcode: 10009,
        vpsResponse: '{"price":"2750.50"}',
      });
      for (let i = 0; i < 100; i++) {
        await routes.deliverPushEvents({ warn() {} });
        if (
          (
            await engine.query(
              "SELECT * FROM push_deliveries WHERE state='retry' AND last_status=429",
            )
          ).rows.length
        )
          break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(
        (
          await engine.query(
            "SELECT * FROM push_deliveries WHERE state='retry' AND last_status=429",
          )
        ).rows.length,
        1,
      );
      globalThis.__pushReject = 0;
      await engine.exec(
        "UPDATE push_deliveries SET next_attempt_at=now() WHERE state='retry'",
      );
      await pump(4);
      assert.equal(
        globalThis.__sentPush[3].body,
        "XAUUSD BUY executed at 2750.50.",
      );
      assert.equal(
        (
          await engine.query(
            "SELECT DISTINCT subscription_id FROM push_deliveries",
          )
        ).rows.length,
        1,
        "Unverified legacy subscriptions must receive no private events",
      );
      await routes.queueExecutionPush(9, { ...pending, id: 99 });
      await pump(4);
      assert.equal(
        globalThis.__sentPush.length,
        4,
        "A client mismatch is suppressed",
      );
      await engine.exec(
        "UPDATE licenses SET status='expired' WHERE key='VALID'",
      );
      assert.equal((await call("push/subscriptions", "POST", sub)).status, 401);
      assert.equal(
        (await call("trading-controls", "PATCH", { copyingEnabled: true }))
          .status,
        401,
      );
      assert.equal(globalThis.__sentPush.length, 4);

      // Real symbol-save route → PostgreSQL → existing push outbox → provider fixture.
      await engine.exec(
        "UPDATE licenses SET status='active' WHERE key='VALID'; INSERT INTO symbol_pairs(mentor_id,pair_name,variations,is_active) VALUES(5,'XAUUSD','XAUUSDm,XAUUSD.m',true)",
      );
      const configBody = (symbol = "XAUUSDm", lot = "0.05") => ({
        configs: [
          { pairName: "XAUUSD", selectedSymbol: symbol, customLotSize: lot },
        ],
      });
      const saveSymbol = (id, body = configBody()) =>
        call("symbol-configs", "PATCH", body, 7, { "X-Symbol-Save-Id": id });
      const events = async () =>
        Number(
          (
            await engine.query(
              "SELECT count(*) AS n FROM push_events WHERE kind='symbol_configured'",
            )
          ).rows[0].n,
        );
      const id1 = "10000000-0000-4000-8000-000000000001";
      // Missing additive migration cannot turn a committed save into an error.
      let response = await saveSymbol(id1);
      assert.equal(response.status, 200);
      assert.equal((await response.json())[0].selectedSymbol, "XAUUSDm");
      assert.equal(await events(), 0);
      await engine.exec(
        await readFile(
          "docs/migrations/20261025-symbol-configured-push.sql",
          "utf8",
        ),
      );
      const id2 = "10000000-0000-4000-8000-000000000002";
      response = await saveSymbol(id2);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Symbol-Save-Id"), id2);
      assert.equal((await response.json())[0].customLotSize, "0.05");
      await pump(5);
      assert.equal(await events(), 1);
      assert.equal(globalThis.__sentPush[4].title, "Symbol Configured");
      assert.equal(
        globalThis.__sentPush[4].body,
        "XAUUSDm configured successfully.",
      );
      await saveSymbol(id2); // Same logical request must never create a second push.
      assert.equal(await events(), 1);
      const id3 = "10000000-0000-4000-8000-000000000003";
      assert.equal(
        (await saveSymbol(id3, configBody("XAUUSD.m", "0.06"))).status,
        200,
      );
      await pump(6);
      assert.equal(await events(), 2);
      assert.equal(
        globalThis.__sentPush[5].body,
        "XAUUSD.m configured successfully.",
      );
      assert.equal((await saveSymbol(id3, configBody("UNKNOWN"))).status, 400);
      assert.equal(
        (await saveSymbol(id3, configBody("XAUUSDm", "-1"))).status,
        400,
      );
      assert.equal(
        (await call("symbol-configs", "PATCH", configBody(), 9)).status,
        400,
      );
      assert.equal(
        (
          await appRequest(app, "https://fixture/api/app/symbol-configs", {
            method: "PATCH",
          })
        ).status,
        401,
      );
      assert.equal(await events(), 2);
      await engine.exec(
        "ALTER TABLE client_symbol_configs ADD CONSTRAINT fixture_write_failure CHECK (custom_lot_size <> 0.13) NOT VALID",
      );
      assert.equal(
        (await saveSymbol(id1, configBody("XAUUSDm", "0.13"))).status,
        500,
      );
      assert.equal(await events(), 2);
      await engine.exec(
        "ALTER TABLE client_symbol_configs DROP CONSTRAINT fixture_write_failure",
      );
      assert.equal((await saveSymbol(id1, configBody(null, null))).status, 200);
      assert.equal(
        await events(),
        2,
        "Removing a mapping must not announce configuration success",
      );
      await engine.exec(
        "ALTER TABLE push_events RENAME TO fixture_push_events_unavailable",
      );
      response = await saveSymbol(id1, configBody("XAUUSDm", "0.07"));
      assert.equal(response.status, 200);
      assert.equal((await response.json())[0].customLotSize, "0.07");
      await engine.exec(
        "ALTER TABLE fixture_push_events_unavailable RENAME TO push_events",
      );
      assert.equal(await events(), 2);
    } finally {
      await engine.close();
      for (const [k, v] of Object.entries(saved))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      delete globalThis.__pushDB;
      delete globalThis.__pushSchema;
      delete globalThis.__sentPush;
      delete globalThis.__pushEngineHealthy;
      delete globalThis.__pushReject;
      delete globalThis.__pushNetworkFailure;
    }
  },
);
test("VAPID readiness detects missing settings and mismatched pairs without exposing private keys", async () => {
  const { default: webpush } =
    await import("../../artifacts/api-server/node_modules/web-push/src/index.js");
  const keys = webpush.generateVAPIDKeys(),
    other = webpush.generateVAPIDKeys(),
    names = ["WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"],
    saved = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(lib.pushConfiguration().reason, "PUSH_VAPID_MISSING");
    process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey;
    process.env.WEB_PUSH_PRIVATE_KEY = other.privateKey;
    process.env.WEB_PUSH_SUBJECT = "mailto:test@example.com";
    assert.equal(lib.pushConfiguration().reason, "PUSH_VAPID_INVALID");
    process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
    const state = lib.pushConfiguration();
    assert.equal(state.configured, true);
    assert.equal(JSON.stringify(state).includes(keys.privateKey), false);
  } finally {
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
test("only explicit transient provider rejections retry, with Retry-After and a finite attempt budget", () => {
  assert.equal(lib.retryDelay(429, { "retry-after": "59" }, 1), 59000);
  assert.ok(lib.retryDelay(503, {}, 2) >= 3000);
  for (const status of [undefined, 400, 401, 403, 404, 410])
    assert.equal(lib.retryDelay(status, {}, 1), null);
  assert.equal(lib.retryDelay(429, {}, 4), null);
});
