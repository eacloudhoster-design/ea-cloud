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
              : "export const db=globalThis.__pushDB;export const pushSubscriptionsTable=globalThis.__pushSchema?.pushSubscriptionsTable;export const pushEventsTable=globalThis.__pushSchema?.pushEventsTable;export const appAccessTable=globalThis.__pushSchema?.appAccessTable;export const licensesTable=globalThis.__pushSchema?.licensesTable;export const clientSettingsTable=globalThis.__pushSchema?.clientSettingsTable;",
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
    ]) {
      const cfg = getTableConfig(table);
      await engine.exec(
        `CREATE TABLE "${cfg.name}" (${cfg.columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`,
      );
    }
    await engine.exec(
      await readFile("docs/migrations/20261024-web-push.sql", "utf8"),
    );
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
    ])
      saved[k] = process.env[k];
    process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
    process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
    process.env.WEB_PUSH_SUBJECT = "mailto:admin@example.test";
    // Bundle actual routers against isolated PostgreSQL; only outbound OS push is mocked.
    globalThis.__sentPush = [];
    await build({
      stdin: {
        contents:
          'export {default as push} from "./artifacts/api-server/src/routes/web-push";export {default as settings} from "./artifacts/api-server/src/routes/client-settings";export {requireAppSession} from "./artifacts/api-server/src/middlewares/app-session";export {deliverPushEvents} from "./artifacts/api-server/src/lib/web-push";',
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
                  ? "export default {setVapidDetails(){},async sendNotification(sub,payload){globalThis.__sentPush.push(JSON.parse(payload));}};"
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
    const call = (path, method = "GET", body, id = 7) =>
      appRequest(app, "https://fixture/api/app/" + path, {
        method,
        headers: {
          Authorization:
            "Bearer " + Buffer.from(`${id}:client:fixture`).toString("base64"),
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
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
      assert.equal(globalThis.__sentPush.length, 1);
      assert.equal(globalThis.__sentPush[0].body, "Robot started.");
      assert.equal(
        (await call("trading-controls", "PATCH", { copyingEnabled: "false" }))
          .status,
        400,
      );
      assert.equal(
        (await engine.query("SELECT * FROM push_events")).rows.length,
        1,
      );
      await call("trading-controls", "PATCH", { copyingEnabled: false });
      await routes.deliverPushEvents({ warn() {} });
      assert.equal(globalThis.__sentPush[1].body, "Robot stopped.");
      await call("push/subscriptions", "DELETE", { endpoint: sub.endpoint }, 9);
      assert.equal(
        (await engine.query("SELECT * FROM push_subscriptions")).rows.length,
        1,
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
      assert.equal(globalThis.__sentPush.length, 2);
    } finally {
      await engine.close();
      for (const [k, v] of Object.entries(saved))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      delete globalThis.__pushDB;
      delete globalThis.__pushSchema;
      delete globalThis.__sentPush;
      delete globalThis.__pushEngineHealthy;
    }
  },
);
