import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest } from "../../functions/api/[[path]].js";
import { loginErrorMessage } from "../../artifacts/ea-cloud/src/lib/login-error.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const context = (path = "/api/healthz", init = {}, origin = "https://backend.example") => ({
  request: new Request(`https://website.example${path}`, init),
  env: { BACKEND_ORIGIN: origin },
});

test("missing or invalid backend configuration fails closed with JSON", async () => {
  for (const origin of [undefined, "", "http://backend.example", "https://website.example", "https://backend.example/api"]) {
    const result = await onRequest({ ...context(), env: { BACKEND_ORIGIN: origin } });
    assert.equal(result.status, 503);
    assert.match(result.headers.get("content-type"), /application\/json/);
    assert.match((await result.json()).error, /not configured/);
  }
});

test("proxy preserves POST body, bearer auth and query while replacing spoofed forwarding headers", async () => {
  globalThis.fetch = async (request) => {
    assert.equal(request.url, "https://backend.example/api/auth/login?test=1");
    assert.equal(request.method, "POST");
    assert.equal(await request.text(), JSON.stringify({ email: "fixture@example.invalid" }));
    assert.equal(request.headers.get("authorization"), "Bearer fixture-token");
    assert.equal(request.headers.get("x-forwarded-for"), "192.0.2.1");
    assert.equal(request.headers.get("forwarded"), null);
    assert.equal(request.redirect, "manual");
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  };
  const result = await onRequest(context("/api/auth/login?test=1", {
    method: "POST",
    headers: { authorization: "Bearer fixture-token", "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.1", "x-forwarded-for": "spoofed", forwarded: "spoofed" },
    body: JSON.stringify({ email: "fixture@example.invalid" }),
  }));
  assert.equal(result.status, 401);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { error: "Invalid credentials" });
});

test("HTML fallback and unreachable backend are service errors", async () => {
  globalThis.fetch = async () => new Response("<html>SPA</html>", { headers: { "content-type": "text/html" } });
  assert.equal((await onRequest(context())).status, 502);
  globalThis.fetch = async () => { throw new TypeError("Network failure"); };
  assert.equal((await onRequest(context())).status, 502);
});

test("WebSocket upgrades are returned intact", async () => {
  const upgrade = { status: 101, webSocket: {} };
  globalThis.fetch = async (request) => {
    assert.equal(request.headers.get("upgrade"), "websocket");
    assert.equal(new URL(request.url).pathname, "/api/ws");
    return upgrade;
  };
  assert.equal(await onRequest(context("/api/ws?token=fixture", { headers: { upgrade: "websocket" } })), upgrade);
});

test("login failures distinguish credentials, approval, throttling and infrastructure", () => {
  assert.equal(loginErrorMessage({ status: 401 }), "Invalid credentials");
  assert.equal(loginErrorMessage({ status: 403, data: { error: "pending_approval" } }), "pending_approval");
  assert.match(loginErrorMessage({ status: 429 }), /Too many/);
  for (const error of [new TypeError("Failed to fetch"), { status: 200 }, { status: 502 }, { status: 503 }, null]) {
    assert.match(loginErrorMessage(error), /login service/);
  }
});

test("Pages output contains distinct site and client bundles with API-only Function routing", () => {
  const output = new URL("../../artifacts/ea-cloud/dist/", import.meta.url);
  const site = readFileSync(new URL("index.html", output), "utf8");
  const app = readFileSync(new URL("ea-app/index.html", output), "utf8");
  assert.match(site, /<title>EA Cloud<\/title>/);
  assert.match(app, /<title>EA Cloud App<\/title>/);
  assert.match(app, /src="\/ea-app\/assets\//);
  assert.notEqual(site, app);
  assert.deepEqual(JSON.parse(readFileSync(new URL("_routes.json", output), "utf8")).include, ["/api/*"]);
});
