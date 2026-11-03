import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
import express from "../../artifacts/api-server/node_modules/express/index.js";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

test("readiness distinguishes DB outage from liveness, shares probes and recovers", async () => {
  let resolveQuery,
    rejectQuery,
    calls = 0;
  globalThis.__readinessPool = {
    totalCount: 10,
    idleCount: 0,
    waitingCount: 3,
    query: () => {
      calls++;
      return new Promise((ok, no) => {
        resolveQuery = ok;
        rejectQuery = no;
      });
    },
  };
  const compiled = await build({
    entryPoints: ["artifacts/api-server/src/routes/health.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    banner: {
      js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
    },
    plugins: [
      {
        name: "disposable-pool",
        setup(b) {
          b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
            path: "db",
            namespace: "test",
          }));
          b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: "export const pool = globalThis.__readinessPool;",
            loader: "js",
          }));
        },
      },
    ],
  });
  await mkdir("work/backend-lifecycle", { recursive: true });
  const file = resolve("work/backend-lifecycle/health.mjs");
  await writeFile(file, compiled.outputFiles[0].contents);
  const { default: router } = await import(pathToFileURL(file));
  const app = express(),
    records = [];
  app.use((req, _res, next) => {
    req.log = { warn: (r) => records.push(r) };
    next();
  });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const live = await fetch(url + "/healthz");
    assert.equal(live.status, 200);
    assert.equal(calls, 0);
    const a = fetch(url + "/readyz"),
      b = fetch(url + "/readyz");
    while (calls < 1) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(calls, 1);
    rejectQuery(Error("PRIVATE database credentials SQL"));
    for (const response of await Promise.all([a, b])) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), {
        status: "unavailable",
        code: "DATABASE_NOT_READY",
      });
    }
    assert.ok(!JSON.stringify(records).includes("PRIVATE"));
    const recovered = fetch(url + "/readyz");
    while (calls < 2) await new Promise((r) => setTimeout(r, 5));
    resolveQuery({ rows: [] });
    assert.equal((await recovered).status, 200);
    assert.equal((await fetch(url + "/healthz")).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    delete globalThis.__readinessPool;
  }
});
