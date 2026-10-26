import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { build } from "../../../artifacts/api-server/node_modules/esbuild/lib/main.js";
import express from "../../../artifacts/api-server/node_modules/express/index.js";
export async function sessionFixture() {
  const { PGlite } = await import(
    pathToFileURL(resolve(process.env.PGLITE_MODULE))
  );
  const engine = new PGlite();
  mkdirSync("work/browser-sessions", { recursive: true });
  const banner = {
    js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
  };
  await build({
    entryPoints: ["lib/db/src/schema/index.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: "work/browser-sessions/schema.mjs",
    banner,
  });
  const schema = await import(
    pathToFileURL(resolve("work/browser-sessions/schema.mjs"))
  );
  const { getTableConfig } =
    await import("../../../lib/db/node_modules/drizzle-orm/pg-core/index.js");
  const { drizzle } =
    await import("../../../lib/db/node_modules/drizzle-orm/node-postgres/index.js");
  for (const table of [
    schema.usersTable,
    schema.appAccessTable,
    schema.licensesTable,
    schema.easTable,
    schema.scannerAdminSessionsTable,
  ]) {
    const config = getTableConfig(table);
    await engine.exec(
      `CREATE TABLE "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`,
    );
  }
  const migration = readFileSync(
    "docs/migrations/20261026-browser-sessions.sql",
    "utf8",
  );
  await engine.exec(migration);
  await engine.exec(migration);
  const query = async (config, params) => {
    const result = await engine.query(
      typeof config === "string" ? config : config.text,
      params,
      { rowMode: config.rowMode === "array" ? "array" : "object" },
    );
    return { rows: result.rows, fields: result.fields };
  };
  globalThis.__sessionSchema = schema;
  globalThis.__sessionDb = drizzle({ query });
  globalThis.__sessionPool = { query };
  const hash = createHash("sha256")
    .update("Test-only-pass-123!ea_cloud_salt_2024")
    .digest("hex");
  for (const [id, role, status] of [
    [1, "mentor", "approved"],
    [2, "superadmin", "approved"],
    [3, "mentor", "pending"],
  ])
    await engine.query(
      "INSERT INTO users(id,email,password,role,status,first_name,last_name,created_at) VALUES($1,$2,$3,$4,$5,'Test','User',now())",
      [id, `${role}${id}@example.invalid`, hash, role, status],
    );
  await engine.query(
    "INSERT INTO app_access(id,email,password,status,first_name,last_name,plan,license_key,mentor_id,created_at) VALUES(10,'client@example.invalid',$1,'approved','Client','Test','monthly','ACTIVE',1,now()),(11,'pending@example.invalid',$1,'pending','Pending','Test','monthly',NULL,NULL,now())",
    [hash],
  );
  await engine.exec(
    "SELECT setval(pg_get_serial_sequence('users','id'),3); SELECT setval(pg_get_serial_sequence('app_access','id'),11);",
  );
  await engine.exec(
    "INSERT INTO licenses(id,key,mentor_id,status,client_email) VALUES(1,'ACTIVE',1,'active','client@example.invalid')",
  );
  await build({
    stdin: {
      contents: `export * from './artifacts/api-server/src/lib/browser-session';export {default as authRouter} from './artifacts/api-server/src/routes/auth';export {default as clientRouter} from './artifacts/api-server/src/routes/client-app';export {requireAuth,requireRole} from './artifacts/api-server/src/middlewares/auth';export {requireAppSession} from './artifacts/api-server/src/middlewares/app-session';export {createWsServer} from './artifacts/api-server/src/ws';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: "work/browser-sessions/server.mjs",
    banner,
    plugins: [
      {
        name: "session-isolation",
        setup(b) {
          b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
            path: "db",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export const db=globalThis.__sessionDb;export const pool=globalThis.__sessionPool;${Object.keys(
              schema,
            )
              .filter((k) => k.endsWith("Table"))
              .map((k) => `export const ${k}=globalThis.__sessionSchema.${k};`)
              .join("")}`,
            loader: "js",
          }));
          b.onResolve({ filter: /lib\/logger$/ }, () => ({
            path: "logger",
            namespace: "quiet",
          }));
          b.onLoad({ filter: /.*/, namespace: "quiet" }, () => ({
            contents: "export const logger={info(){},warn(){},error(){}};",
            loader: "js",
          }));
          b.onResolve({ filter: /lib\/email$/ }, () => ({
            path: "email",
            namespace: "email",
          }));
          b.onLoad({ filter: /.*/, namespace: "email" }, () => ({
            contents:
              "export const sendMentorApplicationReceivedEmail=async()=>{};",
            loader: "js",
          }));
        },
      },
    ],
  });
  const api = await import(
    pathToFileURL(resolve("work/browser-sessions/server.mjs"))
  );
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use((req, res, next) => {
    req.log = { error() {}, warn() {} };
    next();
  });
  app.use("/api", api.browserSessionMiddleware);
  app.use("/api", api.authRouter, api.clientRouter);
  app.get(
    "/api/test/admin",
    api.requireAuth,
    api.requireRole("mentor"),
    (req, res) => res.json({ id: req.userId }),
  );
  app.get(
    "/api/test/superadmin",
    api.requireAuth,
    api.requireRole("superadmin"),
    (req, res) => res.json({ id: req.userId }),
  );
  app.get("/api/app/session-test", api.requireAppSession, (req, res) =>
    res.json({ id: req.clientId }),
  );
  app.get("/api/app/ea-mode-images", api.requireAppSession, (_req, res) =>
    res.json({ eas: [] }),
  );
  app.get("/api/dashboard/activity", api.requireAuth, (_req, res) =>
    res.json([]),
  );
  app.get("/api/profile", api.requireAuth, (_req, res) => res.json({}));
  app.get("/api/dashboard", api.requireAuth, (_req, res) => res.json({}));
  app.use("/ea-app", express.static("artifacts/ea-app/dist"));
  app.use(express.static("artifacts/ea-cloud/dist"));
  app.get("/ea-app/{*path}", (_req, res) =>
    res.sendFile(resolve("artifacts/ea-app/dist/index.html")),
  );
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("artifacts/ea-cloud/dist/index.html")),
  );
  return { app, engine, api };
}
