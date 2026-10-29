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
      await engine.exec(migration);
      await engine.exec(migration);
      await engine.exec(
        "INSERT INTO users(id,email,password,role,status) SELECT 4,'mentor4@example.invalid',password,'mentor','approved' FROM users WHERE id=1;INSERT INTO eas(id,mentor_id,name,is_active) VALUES(11,1,'First EA',true),(21,4,'Other EA',true)",
      );
      await build({
        entryPoints: ["artifacts/api-server/src/ea-builder-worker.ts"],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: "work/browser-sessions/ea-builder-worker.mjs",
        banner: {
          js: 'import {createRequire as workerRequire} from "node:module";const require=workerRequire(import.meta.url);',
        },
      });
      await build({
        stdin: {
          contents:
            "export {default as builderRouter} from './artifacts/api-server/src/routes/ea-builder';export {default as legacyCopier} from './artifacts/api-server/src/routes/copier';export {encryptApiKey,hashApiKey,getMentorByApiKey} from './artifacts/api-server/src/lib/api-key';",
          resolveDir: process.cwd(),
        },
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: "work/browser-sessions/builder-router.mjs",
        banner: {
          js: 'import {createRequire as builderRequire} from "node:module";const require=builderRequire(import.meta.url);',
        },
        plugins: [
          {
            name: "builder-db",
            setup(b) {
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
      server.use("/api", api.browserSessionMiddleware, router, legacyCopier);
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
          contentType = "application/json",
        } = {},
      ) =>
        appRequest(server, "https://backend.example/api" + path, {
          method,
          headers: {
            ...(session ? { Cookie: session } : {}),
            ...(robot ? { "X-EA-Robot-Token": robot } : {}),
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
        false,
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
        (
          await call(
            "/admin/ea-builder/package",
            multipart({ ...fields, purpose: "trading" }),
          )
        ).status,
        409,
      );
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
      assert.equal(history.execution, false);
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
      // Capture-only feature never provisions or touches the execution queue tables.
      assert.equal(
        (
          await engine.query(
            "SELECT count(*) FROM information_schema.tables WHERE table_name='trade_signals'",
          )
        ).rows[0].count,
        0,
      );
    } finally {
      await engine.close();
      delete globalThis.__sessionDb;
      delete globalThis.__sessionSchema;
      delete globalThis.__sessionPool;
    }
  },
);
