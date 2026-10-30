import { test } from "node:test";
import { PNG } from "../../artifacts/api-server/node_modules/pngjs/lib/png.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import express from "../../artifacts/api-server/node_modules/express/index.js";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
import {
  unzipSync,
  strFromU8,
} from "../../artifacts/api-server/node_modules/fflate/esm/index.mjs";
import { sessionFixture } from "./helpers/browser-session-fixture.mjs";
import { appRequest } from "./helpers/in-process-http.mjs";
test(
  "EA builder uses real portal sessions, ownership, scoped revocable credentials and non-executing idempotent capture",
  {
    skip:
      !process.env.PGLITE_MODULE && "Set PGLITE_MODULE for isolated PostgreSQL",
  },
  async () => {
    const { app, engine, api } = await sessionFixture();
    try {
      const migration = readFileSync(
        "docs/migrations/20261030-robot-builds.sql",
        "utf8",
      );
      const { getTableConfig } =
        await import("../../lib/db/node_modules/drizzle-orm/pg-core/index.js");
      for (const table of [
        globalThis.__sessionSchema.tradeSignalsTable,
        globalThis.__sessionSchema.mt5ConnectionsTable,
      ]) {
        const c = getTableConfig(table);
        await engine.exec(
          `CREATE TABLE IF NOT EXISTS "${c.name}" (${c.columns.map((x) => `"${x.name}" ${x.getSQLType()}${x.primary ? " PRIMARY KEY" : ""}`).join(",")})`,
        );
      }
      await engine.exec(
        "ALTER TABLE trade_signals ALTER COLUMN status SET DEFAULT 'pending'; ALTER TABLE trade_signals ALTER COLUMN created_at SET DEFAULT now(); ALTER TABLE trade_signals ALTER COLUMN updated_at SET DEFAULT now()",
      );
      await engine.exec(migration);
      await engine.exec(migration);
      await engine.exec(
        "INSERT INTO users(id,email,password,role,status) SELECT 4,'mentor4@example.invalid',password,'mentor','approved' FROM users WHERE id=1;INSERT INTO eas(id,mentor_id,name,is_active) VALUES(11,1,'First EA',true),(21,4,'Other EA',true)",
      );
      await build({
        entryPoints: ["artifacts/api-server/src/ea-builder-worker.ts"],
        bundle: true,
        platform: "node",
        loader: { ".mq5": "text" },
        format: "esm",
        outfile: "work/browser-sessions/ea-builder-worker.mjs",
        banner: {
          js: 'import {createRequire as workerRequire} from "node:module";const require=workerRequire(import.meta.url);',
        },
      });
      await build({
        stdin: {
          contents:
            "export {default as builderRouter} from './artifacts/api-server/src/routes/ea-builder';export {default as legacySignals} from './artifacts/api-server/src/routes/trade-signals';export {default as legacyCopier} from './artifacts/api-server/src/routes/copier';export {encryptApiKey,hashApiKey,getMentorByApiKey} from './artifacts/api-server/src/lib/api-key';",
          resolveDir: process.cwd(),
        },
        bundle: true,
        platform: "node",
        loader: { ".mq5": "text" },
        format: "esm",
        outfile: "work/browser-sessions/builder-router.mjs",
        banner: {
          js: 'import {createRequire as builderRequire} from "node:module";const require=builderRequire(import.meta.url);',
        },
        plugins: [
          {
            name: "builder-db",
            setup(b) {
              b.onResolve({ filter: /\/logger$/ }, () => ({
                path: "logger",
                namespace: "logger-stub",
              }));
              b.onLoad({ filter: /.*/, namespace: "logger-stub" }, () => ({
                contents:
                  "export const logger={info(){},error(){},warn(){},debug(){},child(){return this}};",
                loader: "js",
              }));
              b.onResolve({ filter: /\/ws$/ }, () => ({
                path: "ws",
                namespace: "ws-stub",
              }));
              b.onLoad({ filter: /.*/, namespace: "ws-stub" }, () => ({
                contents: "export const broadcastToMentorClients=()=>{};",
                loader: "js",
              }));
              b.onResolve({ filter: /observer-vps$/ }, () => ({
                path: "bridge",
                namespace: "bridge-stub",
              }));
              b.onLoad({ filter: /.*/, namespace: "bridge-stub" }, () => ({
                contents:
                  'export const observerCapabilities=async()=>true;export const syncObserverPosition=async()=>{throw Error("Execution must be stubbed")};',
                loader: "js",
              }));
              b.onResolve({ filter: /signal-worker$/ }, () => ({
                path: "worker",
                namespace: "worker-stub",
              }));
              b.onLoad({ filter: /.*/, namespace: "worker-stub" }, () => ({
                contents: "export const wakeWorker=()=>{};",
                loader: "js",
              }));
              b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
                path: "db",
                namespace: "fixture",
              }));
              b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
                contents: `export const db=globalThis.__sessionDb;${Object.keys(
                  globalThis.__sessionSchema,
                )
                  .filter((k) => k.endsWith("Table"))
                  .map(
                    (k) => `export const ${k}=globalThis.__sessionSchema.${k};`,
                  )
                  .join("")}`,
                loader: "js",
              }));
            },
          },
        ],
      });
      const {
        builderRouter: router,
        legacyCopier,
        legacySignals,
        encryptApiKey,
        hashApiKey,
        getMentorByApiKey,
      } = await import(
        pathToFileURL(resolve("work/browser-sessions/builder-router.mjs"))
      );
      const server = express();
      server.set("trust proxy", 1);
      server.use(express.json());
      server.use((req, _res, next) => {
        req.log = { error() {} };
        next();
      });
      server.use(
        "/api",
        api.browserSessionMiddleware,
        router,
        legacyCopier,
        legacySignals,
      );
      const login = async (email) => {
        const r = await appRequest(
          app,
          "https://backend.example/api/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: "Test-only-pass-123!" }),
          },
        );
        assert.equal(r.status, 200);
        return r.headers.get("set-cookie").split(";")[0];
      };
      const legacyKey = "eac_fixture_only_not_a_production_credential";
      await engine.query(
        "UPDATE users SET api_key=$1,api_key_encrypted=$2 WHERE id=1",
        [hashApiKey(legacyKey), encryptApiKey(legacyKey)],
      );
      const cookie = await login("mentor1@example.invalid"),
        other = await login("mentor4@example.invalid");
      const call = (
        path,
        {
          method = "GET",
          body,
          session = cookie,
          robot,
          apiKey,
          contentType = "application/json",
        } = {},
      ) =>
        appRequest(server, "https://backend.example/api" + path, {
          method,
          headers: {
            ...(session ? { Cookie: session } : {}),
            ...(robot ? { "X-EA-Robot-Token": robot } : {}),
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
            "Content-Type": contentType,
            Origin: "https://backend.example",
            "X-Forwarded-Proto": "https",
          },
          ...(body !== undefined
            ? {
                body:
                  typeof body === "string" || Buffer.isBuffer(body)
                    ? body
                    : JSON.stringify(body),
              }
            : {}),
        });
      const legacy = await call("/admin/copier/download");
      assert.equal(legacy.status, 200);
      const legacySource = await legacy.text();
      assert(legacySource.includes("OnTradeTransaction"));
      assert(legacySource.includes("/signals/webhook"));
      assert(legacySource.includes(legacyKey));
      assert.equal(
        (await call("/admin/ea-builder/config", { session: null })).status,
        401,
      );
      assert.equal(
        (await (await call("/admin/ea-builder/config")).json())
          .strategyAvailable,
        true,
      );
      const multipart = (values, image) => {
        const boundary = "ea-builder-test-boundary";
        let pieces = [];
        for (const [k, v] of Object.entries(values))
          pieces.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
            ),
          );
        if (image)
          pieces.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="background"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`,
            ),
            image,
            Buffer.from("\r\n"),
          );
        pieces.push(Buffer.from(`--${boundary}--\r\n`));
        return {
          method: "POST",
          body: Buffer.concat(pieces),
          contentType: "multipart/form-data; boundary=" + boundary,
        };
      };
      const fields = {
        eaId: "11",
        name: 'Gold Hunter "PRO"',
        managerName: "Manager Test",
        purpose: "integration-toolkit",
      };
      assert.equal(
        (await engine.query("SELECT count(*) FROM robot_builds")).rows[0].count,
        0,
      );
      assert.equal(
        (
          await call(
            "/admin/ea-builder/package",
            multipart({ ...fields, eaId: "21" }),
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await call(
            "/admin/ea-builder/package",
            multipart(fields, Buffer.from("not an image")),
          )
        ).status,
        400,
      );
      const validImage = PNG.sync.write(new PNG({ width: 2, height: 3 }));
      const r = await call(
        "/admin/ea-builder/package",
        multipart(fields, validImage),
      );
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "no-store");
      const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
      const bitmap = Buffer.from(
        files[Object.keys(files).find((k) => k.endsWith(".bmp"))],
      );
      assert.equal(bitmap.readUInt16LE(28), 24);
      assert.equal(bitmap.readInt32LE(18), 2);
      assert.equal(bitmap.readInt32LE(22), 3);
      const include = strFromU8(
        files[
          Object.keys(files).find((k) => k.endsWith("EACloudBroadcast.mqh"))
        ],
      );
      const token = include.match(/eacr_[a-f0-9]{64}/)[0];
      assert(
        !include.includes(legacyKey),
        "new toolkit must never embed the mentor API key",
      );
      assert.equal(
        await getMentorByApiKey(token),
        null,
        "capture token cannot authenticate the live legacy webhook",
      );
      const listed = await (await call("/admin/ea-builder/robots")).json();
      assert.equal(listed.robots.length, 1);
      assert(!JSON.stringify(listed).includes(token));
      assert(!JSON.stringify(listed).includes("tokenHash"));
      const id = listed.robots[0].id;
      assert.equal(
        (
          await (
            await call("/admin/ea-builder/robots", { session: other })
          ).json()
        ).robots.length,
        0,
      );
      assert.equal(
        (
          await call("/admin/ea-builder/robots/" + id, {
            method: "DELETE",
            session: other,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await call("/robots/heartbeat", {
            method: "POST",
            body: {},
            session: null,
            robot: token,
          })
        ).status,
        200,
      );
      const payload = {
        eventId: "12345:D:100",
        sourceAccount: "12345",
        sourceServer: "Demo",
        accountMode: "HEDGING",
        kind: "DEAL",
        entry: "IN",
        dealId: "100",
        orderId: "99",
        positionId: "50",
        symbol: "XAUUSD",
        side: "BUY",
        volume: 0.01,
        price: 2000,
        stopLoss: 1990,
        takeProfit: 2020,
        timestampMs: Date.now(),
      };
      const send = (p) =>
        call("/robots/events", {
          method: "POST",
          body: p,
          session: null,
          robot: token,
        });
      assert.equal((await send({ ...payload, mentorId: 4 })).status, 400);
      const first = await send(payload);
      assert.equal(first.status, 201);
      assert.equal((await first.json()).execution, false);
      const second = await send(payload);
      assert.equal(second.status, 200);
      assert.equal((await second.json()).duplicate, true);
      assert.equal((await send({ ...payload, price: 2001 })).status, 409);
      assert.equal(
        (await send({ ...payload, eventId: "new", sourceAccount: "99999" }))
          .status,
        409,
      );
      for (const entry of ["OUT", "OUT_BY", "INOUT"])
        assert.equal(
          (
            await send({
              ...payload,
              eventId: "12345:D:" + entry,
              entry,
              dealId: "101",
            })
          ).status,
          201,
        );
      assert.equal(
        (
          await send({
            ...payload,
            eventId: "12345:P:50",
            kind: "POSITION",
            entry: "POSITION",
            dealId: "0",
          })
        ).status,
        201,
      );
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM robot_events")).rows[0]
            .count,
        ),
        5,
      );
      const history = await (
        await call("/admin/ea-builder/robots/" + id + "/events")
      ).json();
      assert.equal(history.events.length, 5);
      assert.equal(history.execution, "see_per_event_queue_status");
      assert.equal(
        (
          await (
            await call("/admin/ea-builder/robots/" + id + "/events", {
              session: other,
            })
          ).json()
        ).events.length,
        0,
      );
      await engine.exec("UPDATE users SET status='pending' WHERE id=1");
      assert.equal(
        (await send({ ...payload, eventId: "pending-owner" })).status,
        403,
      );
      await engine.exec("UPDATE users SET status='approved' WHERE id=1");
      assert.equal(
        (await call("/admin/ea-builder/robots/" + id, { method: "DELETE" }))
          .status,
        200,
      );
      assert.equal(
        (await send({ ...payload, eventId: "after-revoke" })).status,
        401,
      );
      assert.equal(
        (
          await call("/robots/heartbeat", {
            method: "POST",
            body: {},
            session: null,
            robot: "eacr_" + "0".repeat(64),
          })
        ).status,
        401,
      );
      // Exercise opt-in observer routing with actual cookie/credential middleware.
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM trade_signals")).rows[0]
            .count,
        ),
        0,
      );
      const observerZip = await call(
        "/admin/ea-builder/package",
        multipart({
          ...fields,
          purpose: "existing-observer",
          sourceMagic: "12345",
        }),
      );
      assert.equal(observerZip.status, 200);
      const of = unzipSync(new Uint8Array(await observerZip.arrayBuffer()));
      const observerToken = strFromU8(
        of[Object.keys(of).find((k) => k.endsWith("EACloudBroadcast.mqh"))],
      ).match(/eacr_[a-f0-9]{64}/)[0];
      const [observer] = (
        await (await call("/admin/ea-builder/robots")).json()
      ).robots.filter((r) => r.mode === "existing-observer");
      const heartbeat = {
        sourceAccount: "12345",
        sourceServer: "Demo",
        sourceMagic: "12345",
        inventoryCount: 0,
        queueDepth: 0,
        lastSequence: 1,
        historyHealthy: true,
      };
      const beat = (body) =>
        call("/robots/heartbeat", {
          method: "POST",
          session: null,
          robot: observerToken,
          body,
        });
      assert.equal(
        (await beat({ ...heartbeat, sourceMagic: "999" })).status,
        409,
      );
      assert.equal((await beat(heartbeat)).status, 200);
      const enable = () =>
        call(`/admin/ea-builder/robots/${observer.id}/enable-copy`, {
          method: "POST",
          body: { confirmLegacyBlock: true },
        });
      assert.equal(
        (await enable()).status,
        409,
        "heartbeat is not source ownership proof",
      );
      await engine.exec(
        "INSERT INTO mt5_connections(mentor_id,mt5_login,mt5_server,status,connected_at) VALUES(1,12345,'Demo','connected',now())",
      );
      assert.equal((await enable()).status, 200);
      const blockedLegacy = await call("/signals/webhook", {
        method: "POST",
        apiKey: legacyKey,
        body: {
          signal: "OPEN",
          symbol: "XAUUSD",
          orderType: "BUY",
          lots: 0.01,
        },
      });
      assert.equal(blockedLegacy.status, 409);
      assert.equal((await blockedLegacy.json()).code, "OBSERVER_ROUTE_ACTIVE");
      const snapshot = {
        ...payload,
        kind: "SNAPSHOT",
        entry: "SNAPSHOT",
        dealId: "0",
        orderId: "0",
        sourceMagic: "12345",
        sequence: 2,
        eventId: "12345:S:50:2",
        mixed: false,
      };
      const snap = (body) =>
        call("/robots/events", {
          method: "POST",
          session: null,
          robot: observerToken,
          body,
        });
      const routed = await snap(snapshot);
      assert.equal(routed.status, 201);
      assert.equal((await routed.json()).execution, true);
      assert.equal((await snap(snapshot)).status, 200);
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM trade_signals")).rows[0]
            .count,
        ),
        1,
        "retry never enqueues twice",
      );
      assert.equal(
        (await snap({ ...snapshot, eventId: "old-sequence", sequence: 1 }))
          .status,
        201,
      );
      assert.equal(
        (
          await snap({
            ...snapshot,
            eventId: "mixed",
            sequence: 3,
            mixed: true,
          })
        ).status,
        201,
      );
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM trade_signals")).rows[0]
            .count,
        ),
        1,
        "stale/mixed snapshots never execute",
      );
      await engine.exec(
        "UPDATE mt5_connections SET connected_at=now()-interval '2 days'",
      );
      const expired = await snap({
        ...snapshot,
        eventId: "expired",
        sequence: 4,
      });
      assert.equal(
        (await expired.json()).copyState,
        "source_verification_expired",
      );
      const trading = await call(
        "/admin/ea-builder/package",
        multipart(
          {
            ...fields,
            purpose: "trading",
            name: "FORGED NAME",
            managerName: "FORGED MANAGER",
          },
          validImage,
        ),
      );
      assert.equal(trading.status, 200);
      const tradingFiles = unzipSync(
        new Uint8Array(await trading.arrayBuffer()),
      );
      const mainPath = Object.keys(tradingFiles).find((k) =>
        k.endsWith("/First_EA.mq5"),
      );
      assert(mainPath, "uses saved owned EA name, not request branding");
      const tradingSource = strFromU8(tradingFiles[mainPath]);
      assert(tradingSource.includes("EA Manager: Test User"));
      assert(!tradingSource.includes("FORGED NAME"));
      assert(tradingSource.includes("DetectQuasimodoSignal"));
      assert(!/WebRequest\s*\(/.test(tradingSource));
      const integratedToken = tradingSource.match(/eacr_[a-f0-9]{64}/)[0];
      assert(!tradingSource.includes(legacyKey));
      const integratedBeat = (body) =>
        call("/robots/heartbeat", {
          method: "POST",
          session: null,
          robot: integratedToken,
          body,
        });
      assert.equal(
        (
          await integratedBeat({
            ...heartbeat,
            sourceAccount: "77777",
            sourceMagic: "54321",
          })
        ).status,
        200,
        "bind actual original MagicNumber on first authenticated heartbeat",
      );
      assert.equal(
        (
          await integratedBeat({
            ...heartbeat,
            sourceAccount: "77777",
            sourceMagic: "99999",
          })
        ).status,
        409,
        "later magic changes cannot redirect a registered robot",
      );
      const copierZip = await call("/admin/copier/download?format=zip");
      assert.equal(copierZip.status, 200);
      const copierFiles = unzipSync(
        new Uint8Array(await copierZip.arrayBuffer()),
      );
      const standalone = strFromU8(
        copierFiles[Object.keys(copierFiles).find((k) => k.endsWith(".mq5"))],
      );
      assert.equal(
        standalone.replaceAll("https://eacloudhoster.online/api", "<API>"),
        legacySource.replaceAll("https://backend.example/api", "<API>"),
        "standalone strategy/source must be unchanged except the production origin",
      );
      assert(standalone.includes(legacyKey));
      assert(standalone.includes("https://eacloudhoster.online/api"));
      assert(!standalone.includes("DetectQuasimodoSignal"));
      assert.equal(
        (
          strFromU8(
            copierFiles[
              Object.keys(copierFiles).find((k) => k.endsWith(".txt"))
            ],
          ).match(/^\d+\./gm) || []
        ).length,
        10,
      );
      // Existing EA deletion must not be blocked by the new metadata foreign keys.
      await engine.exec("DELETE FROM eas WHERE id=11");
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM robot_builds")).rows[0]
            .count,
        ),
        0,
      );
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM robot_events")).rows[0]
            .count,
        ),
        0,
      );
      // Capture-only packages still never enqueue execution, even though the
      // observer migration now adds an opt-in link to the existing queue.
      assert.equal(
        Number(
          (await engine.query("SELECT count(*) FROM trade_signals")).rows[0]
            .count,
        ),
        1,
      );
    } finally {
      await engine.close();
      delete globalThis.__sessionDb;
      delete globalThis.__sessionSchema;
      delete globalThis.__sessionPool;
    }
  },
);
