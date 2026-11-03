import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once, EventEmitter } from "node:events";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
import WebSocket from "../../artifacts/api-server/node_modules/ws/wrapper.mjs";

test("disconnect during slow session verification retains no closed socket or cookie", async () => {
  let finishVerification;
  globalThis.__wsVerify = () =>
    new Promise((r) => {
      finishVerification = r;
    });
  globalThis.__wsEvents = new EventEmitter();
  const compiled = await build({
    entryPoints: ["artifacts/api-server/src/ws.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    banner: {
      js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
    },
    plugins: [
      {
        name: "isolated-auth",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(?:@workspace\/db|\.\/lib\/(?:browser-session|app-session-access|logger))$/,
            },
            (args) => ({ path: args.path, namespace: "mock" }),
          );
          b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            loader: "js",
            contents:
              args.path === "@workspace/db"
                ? 'export const appAccessTable={id:"id"};export const db={select:()=>({from:()=>({where:()=>({limit:async()=>[{id:1}]})})})};'
                : args.path.endsWith("browser-session")
                  ? "export const verifyBrowserSession=(...a)=>globalThis.__wsVerify(...a);export const browserSessionEvents=globalThis.__wsEvents;"
                  : args.path.endsWith("app-session-access")
                    ? "export const resolveAppSessionAccess=async()=>({mentorId:2});"
                    : "export const logger={info(){},warn(){}};",
          }));
          b.onLoad({ filter: /\/src\/ws\.ts$/ }, async (args) => ({
            contents:
              (await readFile(args.path, "utf8")) +
              "\nexport const retainedConnections=()=>connections.size;",
            loader: "ts",
          }));
        },
      },
    ],
  });
  await mkdir("work/backend-lifecycle", { recursive: true });
  const file = resolve("work/backend-lifecycle/ws.mjs");
  await writeFile(file, compiled.outputFiles[0].contents);
  const api = await import(pathToFileURL(file));
  const server = http.createServer();
  const wss = api.createWsServer(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const client = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/api/ws`,
    );
    await once(client, "open");
    client.close();
    await once(client, "close");
    finishVerification({ id: 1, hash: "test-only" });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(api.retainedConnections(), 0);
    assert.equal(api.broadcastToClient(1, { type: "test" }), 0);
  } finally {
    for (const socket of wss.clients) socket.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
    assert.equal(globalThis.__wsEvents.listenerCount("revoke"), 0);
    delete globalThis.__wsVerify;
    delete globalThis.__wsEvents;
  }
});
