import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5281";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  await context.grantPermissions(["notifications"], { origin });
  await context.route(origin + "/push-check", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Push regression</title>",
    }),
  );
  const workerSource = await readFile(
    "artifacts/ea-app/public/push-sw.js",
    "utf8",
  );
  await context.route(origin + "/ea-app/push-sw.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body:
        "const originalAdd=self.addEventListener.bind(self);self.__handlers={};self.addEventListener=(type,handler,...args)=>{self.__handlers[type]=handler;originalAdd(type,handler,...args);};\n" +
        workerSource,
    }),
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  let registration;
  cdp.on("ServiceWorker.workerRegistrationUpdated", (event) => {
    registration =
      event.registrations.find(
        (r) => r.scopeURL === origin + "/ea-app/" && !r.isDeleted,
      ) || registration;
  });
  await cdp.send("ServiceWorker.enable");
  await page.goto(origin + "/push-check");
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.register("/ea-app/push-sw.js", {
      scope: "/ea-app/",
    });
    const w = r.installing || r.waiting || r.active;
    if (w.state !== "activated")
      await new Promise((resolve) =>
        w.addEventListener("statechange", () => {
          if (w.state === "activated") resolve();
        }),
      );
  });
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("ea-cloud-push-device", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put("client:7", "account");
      tx.oncomplete = resolve;
    });
    db.close();
  });
  for (let i = 0; i < 100 && !registration; i++) await page.waitForTimeout(50);
  assert.ok(registration);
  const payload = {
    eventId: "00000000-0000-4000-8000-000000000001",
    title: "EA Cloud",
    body: "Robot started successfully.",
    version: 1,
    accountScope: "client:7",
    url: "/ea-app/?tab=home&activity=1",
    expiresAt: Date.now() + 600000,
  };
  const send = (data) =>
    cdp.send("ServiceWorker.deliverPushMessage", {
      origin,
      registrationId: registration.registrationId,
      data: JSON.stringify(data),
    });
  const notifications = () =>
    page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration("/ea-app/");
      return (await r.getNotifications()).map((n) => ({
        title: n.title,
        body: n.body,
        icon: n.icon,
        tag: n.tag,
      }));
    });
  await send(payload);
  await page.waitForTimeout(500);
  assert.equal((await notifications()).length, 1);
  await send(payload);
  await page.waitForTimeout(300);
  assert.equal((await notifications()).length, 1);
  const one = (await notifications())[0];
  assert.equal(one.title, "EA Cloud");
  assert.equal(one.body, "Robot started successfully.");
  assert.ok(one.icon.endsWith("/ea-app/apple-touch-icon.jpeg"));
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000002",
    body: "Robot stopped successfully.",
  });
  await page.waitForTimeout(300);
  assert.equal((await notifications()).length, 2);
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000003",
    title: "Unknown app",
    body: "Fake account connected.",
  });
  await page.waitForTimeout(200);
  assert.equal((await notifications()).length, 2);
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000004",
    title: "EA Cloud — Trade Executed",
    body: "XAUUSD BUY executed at 2750.50.",
    url: "/ea-app/?tab=metatrader&activity=1",
  });
  await page.waitForTimeout(250);
  assert.equal((await notifications()).length, 3);
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000005",
    accountScope: "client:9",
    title: "EA Cloud — Trade Executed",
    body: "PRIVATE OTHER ACCOUNT",
  });
  await page.waitForTimeout(200);
  assert.equal((await notifications()).length, 3);
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000006",
    url: "https://evil.example/",
  });
  await page.waitForTimeout(150);
  assert.equal((await notifications()).length, 3);
  const symbolPayload = {
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000007",
    title: "Symbol Configured",
    body: "XAUUSDm configured successfully.",
  };
  await page.bringToFront();
  await send(symbolPayload);
  await page.waitForTimeout(250);
  assert.equal((await notifications()).length, 4);
  assert.ok(
    (await notifications()).some(
      (n) =>
        n.title === "Symbol Configured" &&
        n.body === "XAUUSDm configured successfully.",
    ),
  );
  await send(symbolPayload);
  await page.waitForTimeout(200);
  assert.equal((await notifications()).length, 4);
  // Deliver while the app page is closed; the service worker still owns display.
  const observer = await context.newPage();
  const observerCDP = await context.newCDPSession(observer);
  await observerCDP.send("ServiceWorker.enable");
  await page.close();
  await observerCDP.send("ServiceWorker.deliverPushMessage", {
    origin,
    registrationId: registration.registrationId,
    data: JSON.stringify({
      ...symbolPayload,
      eventId: "00000000-0000-4000-8000-000000000008",
      body: "EURUSD.a configured successfully.",
    }),
  });
  await new Promise((r) => setTimeout(r, 250));
  const reopened = await context.newPage();
  await reopened.goto(origin + "/push-check");
  assert.equal(
    await reopened.evaluate(
      async () =>
        (
          await (
            await navigator.serviceWorker.getRegistration("/ea-app/")
          ).getNotifications()
        ).length,
    ),
    5,
  );
  const worker = context
    .serviceWorkers()
    .find((w) => w.url().endsWith("/push-sw.js"));
  assert.ok(worker);
  const routing = await worker.evaluate(async () => {
    const actions = [];
    self.clients.matchAll = async () => [
      {
        url: self.location.origin + "/ea-app/",
        postMessage: (data) => actions.push(data),
        focus: () => actions.push("focus"),
      },
    ];
    let waiting;
    self.__handlers.notificationclick({
      notification: {
        close() {},
        data: {
          url: "/ea-app/?tab=metatrader&activity=1",
          accountScope: "client:7",
        },
      },
      waitUntil: (p) => (waiting = p),
    });
    await waiting;
    return actions;
  });
  assert.equal(routing[0].type, "EA_PUSH_NAVIGATE");
  assert.equal(routing[0].tab, "metatrader");
  assert.equal(routing[1], "focus");
  await context.close();
  console.log(
    "PASS real service-worker push dispatch, OS notification API, icon/body, persistent duplicate suppression and invalid-payload rejection (Chromium; no live APNs send)",
  );
} finally {
  await browser.close();
}
