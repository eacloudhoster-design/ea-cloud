import { createRequire } from "node:module";
import assert from "node:assert/strict";
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
  for (let i = 0; i < 100 && !registration; i++) await page.waitForTimeout(50);
  assert.ok(registration);
  const payload = {
    eventId: "00000000-0000-4000-8000-000000000001",
    title: "EA Cloud",
    body: "Robot started.",
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
  assert.equal(one.body, "Robot started.");
  assert.ok(one.icon.endsWith("/ea-app/apple-touch-icon.jpeg"));
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000002",
    body: "Robot stopped.",
  });
  await page.waitForTimeout(300);
  assert.equal((await notifications()).length, 2);
  await send({
    ...payload,
    eventId: "00000000-0000-4000-8000-000000000003",
    body: "Fake account connected.",
  });
  await page.waitForTimeout(200);
  assert.equal((await notifications()).length, 2);
  await context.close();
  console.log(
    "PASS real service-worker push dispatch, OS notification API, icon/body, persistent duplicate suppression and invalid-payload rejection (Chromium; no live APNs send)",
  );
} finally {
  await browser.close();
}
