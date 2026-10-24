import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const { chromium } = createRequire(import.meta.url)("playwright"),
  origin = process.env.APP_ORIGIN || "http://127.0.0.1:5281";
const code = await build({
  stdin: {
    contents:
      'export * from "./artifacts/ea-app/src/lib/web-push-client";export * from "./artifacts/ea-app/src/lib/push-device-state";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  globalName: "PushClientTest",
  write: false,
});
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  await context.route(origin + "/push-client-check", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Push client regression</title>",
    }),
  );
  const page = await context.newPage();
  await page.goto(origin + "/push-client-check");
  await page.evaluate(() => {
    const s = (window.__push = {
      permission: "denied",
      requests: [],
      subscribe: 0,
      unsubscribe: 0,
      permissionRequests: 0,
      enabled: true,
      failSave: false,
      conflict: false,
      registered: 0,
    });
    const bytes = new Uint8Array(65).fill(1);
    s.publicKey = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const make = () => ({
      endpoint: "https://web.push.apple.com/fixture-" + s.subscribe,
      options: { applicationServerKey: bytes.buffer },
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
        };
      },
      async unsubscribe() {
        s.unsubscribe++;
        s.current = null;
        return true;
      },
    });
    s.current = make();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        get permission() {
          return s.permission;
        },
        async requestPermission() {
          s.permissionRequests++;
          s.permission = s.grantOnPrompt ? "granted" : "denied";
          return s.permission;
        },
      },
    });
    const reg = (window.__pushRegistration = {
      active: { state: "activated" },
      pushManager: {
        async getSubscription() {
          return s.current;
        },
        async subscribe() {
          s.subscribe++;
          s.current = make();
          return s.current;
        },
      },
      async getNotifications() {
        return [];
      },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        async register(url, options) {
          s.registered++;
          s.workerURL = url;
          s.options = options;
          return reg;
        },
        get ready() {
          throw Error("Do not wait for a possibly unrelated worker");
        },
      },
    });
    window.fetch = async (url, options = {}) => {
      s.requests.push({ url, method: options.method || "GET" });
      if (url.endsWith("/config"))
        return Response.json({ enabled: s.enabled, publicKey: s.publicKey });
      if (url.includes("/status"))
        return Response.json({
          subscriptions: 0,
          endpointOwned: false,
          endpointConflict: s.conflict,
        });
      if (options.method === "POST" && s.failSave)
        return Response.json(
          { code: "PUSH_STORAGE_UNAVAILABLE" },
          { status: 503 },
        );
      return Response.json({ saved: true });
    };
  });
  await page.addScriptTag({ content: code.outputFiles[0].text });
  const call = (token) =>
      page.evaluate((token) => PushClientTest.enableWebPush(token), token),
    token = Buffer.from("7:client:fixture").toString("base64");
  assert.equal(await call(token), false);
  assert.equal(
    await page.evaluate(() => __push.requests.length),
    0,
    "denied permission makes no subscription request",
  );
  await page.evaluate(() => {
    __push.permission = "default";
    __push.grantOnPrompt = true;
  });
  assert.equal(await call(token), true);
  assert.equal(await call(token), true);
  assert.equal(
    await page.evaluate(() => __push.unsubscribe),
    0,
    "repeated bell taps repair/upsert, never disable",
  );
  assert.equal(await page.evaluate(() => __push.permissionRequests), 1);
  assert.equal(
    await page.evaluate(() => __push.subscribe),
    0,
    "existing local subscription repairs a missing DB row",
  );
  assert.equal(
    await page.evaluate(() => __push.workerURL),
    "/ea-app/push-sw.js",
  );
  await page.evaluate(() => (__push.failSave = true));
  assert.equal(await call(token), false);
  assert.equal(
    await page.evaluate(() => __push.unsubscribe),
    0,
    "temporary database failure retains the local subscription",
  );
  await page.evaluate(async () => {
    __push.failSave = false;
    __push.conflict = true;
    await PushClientTest.setPushAccountScope("client:9");
  });
  assert.equal(
    await call(Buffer.from("9:client:fixture").toString("base64")),
    true,
  );
  assert.equal(await page.evaluate(() => __push.unsubscribe), 1);
  assert.equal(await page.evaluate(() => __push.subscribe), 1);
  assert.equal(
    await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open("ea-cloud-push-device", 1);
        r.onsuccess = () => resolve(r.result);
      });
      try {
        return await new Promise((resolve) => {
          const r = db.transaction("state").objectStore("state").get("account");
          r.onsuccess = () => resolve(r.result);
        });
      } finally {
        db.close();
      }
    }),
    "client:9",
  );
  await page.evaluate(() => (__push.enabled = false));
  const before = await page.evaluate(() => __push.subscribe);
  assert.equal(
    await call(Buffer.from("9:client:fixture").toString("base64")),
    false,
  );
  assert.equal(await page.evaluate(() => __push.subscribe), before);
  assert.equal(await page.locator("[role=alert]").count(), 0);
  await page.addScriptTag({ content: code.outputFiles[0].text });
  await page.evaluate(() => {
    const installing = new EventTarget();
    installing.state = "installing";
    __pushRegistration.installing = installing;
    window.__newWorkerReady = false;
    PushClientTest.prepareWebPush().then(
      () => (window.__newWorkerReady = true),
    );
    setTimeout(() => {
      installing.state = "activated";
      __pushRegistration.active = installing;
      installing.dispatchEvent(new Event("statechange"));
    }, 100);
  });
  await page.waitForTimeout(30);
  assert.equal(
    await page.evaluate(() => __newWorkerReady),
    false,
    "an old active worker must not satisfy new-worker readiness",
  );
  await page.waitForTimeout(130);
  assert.equal(await page.evaluate(() => __newWorkerReady), true);
  await context.close();
  console.log(
    "PASS denied/granted permissions, exact worker registration, subscription repair, repeated bell taps, transient storage failure and cross-account rotation (browser fixtures)",
  );
} finally {
  await browser.close();
}
