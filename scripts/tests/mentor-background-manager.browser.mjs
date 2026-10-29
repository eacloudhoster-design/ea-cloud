import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5234";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const picture = await readFile("artifacts/ea-cloud/public/default-robot.jpg");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
await mkdir("work/mentor-backgrounds", { recursive: true });
try {
  for (const width of [390, 320, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width < 600,
      isMobile: width < 600,
    });
    const records = new Map([
      [11, [null, "https://images.example/beast.png", null, null]],
      [12, ["https://images.example/other.png", null, null, null]],
    ]);
    const initialSecond = [...records.get(12)],
      writes = [];
    let next = 0,
      fail = false,
      uploads = 0;
    await context.addInitScript(() => {
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
    });
    await context.route("https://fonts.**", (r) => r.abort());
    await context.route("https://images.example/**", (r) =>
      r.fulfill({ body: picture, contentType: "image/jpeg" }),
    );
    await context.route("**/api/**", async (r) => {
      const req = r.request(),
        p = new URL(req.url()).pathname;
      let json = [];
      if (p === "/api/auth/me" || p === "/api/profile")
        json = {
          id: 5,
          role: "mentor",
          status: "approved",
          email: "mentor@example.invalid",
          backgroundImageUrl: "https://images.example/legacy.png",
        };
      if (p === "/api/eas")
        json = [11, 12].map((id) => ({
          id,
          name: `EA ${id}`,
          isActive: true,
          symbol: "XAUUSD",
          lotSize: "0.01",
          riskLevel: "medium",
        }));
      if (p === "/api/storage/uploads/request-url") {
        if (fail)
          return r.fulfill({
            status: 503,
            json: { error: "Storage temporarily unavailable" },
          });
        json = {
          uploadURL: `${origin}/api/storage/r2/5/test-${++next}`,
          objectPath: `/r2/5/test-${next}`,
        };
      }
      if (p.startsWith("/api/storage/r2/")) {
        if (req.method() === "PUT") {
          uploads++;
          await new Promise((resolve) => setTimeout(resolve, 150));
          return r.fulfill({ json: { ok: true } });
        }
        return r.fulfill({ body: picture, contentType: "image/jpeg" });
      }
      if (p === "/api/app/me")
        json = {
          id: 7,
          token: btoa("7:client:fixture"),
          status: "approved",
          licenseKey: "VALID",
        };
      if (p === "/api/app/dashboard")
        json = {
          mentor: {
            id: 5,
            robotName: "EA 11",
            backgroundImageUrl: "https://images.example/legacy.png",
          },
          eas: [],
        };
      if (p === "/api/app/ea-mode-images")
        json = {
          eas: [11, 12].map((id) => ({
            id,
            name: `EA ${id}`,
            images: records
              .get(id)
              .map(
                (v, i) =>
                  v || (i === 0 ? "https://images.example/legacy.png" : null),
              ),
          })),
        };
      if (p === "/api/app/trading-controls") {
        assert.equal(
          req.method(),
          "GET",
          "artwork mode changes must never send trading commands",
        );
        json = { copyingEnabled: false };
      }
      const match = p.match(/^\/api\/eas\/(\d+)\/mode-images$/);
      if (match) {
        const id = Number(match[1]);
        if (req.method() === "PUT") {
          records.set(id, req.postDataJSON().images);
          writes.push({ id, images: [...records.get(id)] });
        }
        json = {
          eaId: id,
          savedImages: records.get(id),
          normalFallback: "https://images.example/legacy.png",
        };
      }
      return r.fulfill({ json });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/admin/profile");
    const editor = page.locator(".mentor-background-editor");
    const save = editor.getByRole("button", {
      name: "Save artwork",
      exact: true,
    });
    await save.waitFor();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".mentor-background-editor")
          ?.getAttribute("aria-busy") === "false",
    );
    // Measure settled geometry after the existing staggered entrance animations.
    await page.waitForTimeout(800);
    assert.equal(await page.locator(".mentor-background-card").count(), 4);
    assert.equal(
      await page.getByText("Background Image", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByAltText("NORMAL artwork preview").getAttribute("src"),
      "https://images.example/legacy.png",
    );
    const boxes = await page
      .locator(".mentor-background-preview")
      .evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            fit: n.querySelector("img")
              ? getComputedStyle(n.querySelector("img")).objectFit
              : null,
          };
        }),
      );
    for (const b of boxes) assert(Math.abs(b.width / b.height - 9 / 16) < 0.01);
    if ((await editor.boundingBox()).width < 480) {
      assert.equal(boxes[0].y, boxes[1].y);
      assert.equal(boxes[2].y, boxes[3].y);
      assert(boxes[2].y > boxes[0].y);
    } else assert(boxes.every((b) => b.y === boxes[0].y));
    assert(boxes.filter((b) => b.fit).every((b) => b.fit === "cover"));
    assert(await page.locator(".mentor-background-card").evaluateAll(cards=>cards.every(card=>card.scrollWidth<=card.clientWidth)),"card labels and controls fit within their panel");
    const section = name => page.getByRole('heading',{name,exact:true}).locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    const personal = await section('Personal Information').boundingBox();
    const branding = await section('Branding & Assets').boundingBox();
    const credentials = await section('API Credentials').boundingBox();
    if(width>=1024){
      assert(Math.abs(personal.y-branding.y)<1,'desktop section tops align');
      assert(Math.abs(personal.width-branding.width)<1,'desktop sections have equal widths');
      assert(branding.x>=personal.x+personal.width,'branding is in right column');
    }else{
      assert(branding.y>=personal.y+personal.height,'mobile retains personal then branding order');
      assert(Math.abs(personal.x-branding.x)<1);
    }
    assert(credentials.y>=Math.max(personal.y+personal.height,branding.y+branding.height),'credentials stay below both sections');
    assert(Math.abs(credentials.x-personal.x)<1);
    assert(credentials.width>=branding.width,'credentials retain full-row width');
    await page.screenshot({path:`work/mentor-backgrounds/${width}-profile-columns.png`,fullPage:true});

    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `work/mentor-backgrounds/${width}-initial.png`,
    });
    const names = ["NORMAL", "BEAST", "AGGRESSIVE", "ULTIMATE"];
    for (const name of names) {
      await editor
        .getByLabel(`Upload ${name} image`, { exact: true })
        .setInputFiles({
          name: name + ".jpg",
          mimeType: "image/jpeg",
          buffer: picture,
        });
      await editor
        .getByRole("status")
        .filter({ hasText: `${name} image uploaded` })
        .waitFor();
    }
    assert.equal(uploads, 4);
    assert.equal(writes.length, 0, "uploads do not silently publish");
    const select = page.getByLabel("EA for mode artwork");
    page.once("dialog", (d) => d.dismiss());
    await select.selectOption("12");
    assert.equal(
      await select.inputValue(),
      "11",
      "unsaved changes need confirmation",
    );
    await save.click();
    await editor
      .getByRole("status")
      .filter({ hasText: "Artwork saved" })
      .waitFor();
    const saved = [...records.get(11)];
    assert(saved.every(Boolean));
    assert.deepEqual(records.get(12), initialSecond);
    await page.reload();
    await save.waitFor();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".mentor-background-editor")
          ?.getAttribute("aria-busy") === "false",
    );
    for (const [i, name] of names.entries())
      assert.equal(
        await editor
          .getByAltText(`${name} artwork preview`)
          .getAttribute("src"),
        saved[i],
      );
    await select.selectOption("12");
    await editor.getByAltText("NORMAL artwork preview").waitFor();
    assert.equal(
      await editor.getByAltText("NORMAL artwork preview").getAttribute("src"),
      initialSecond[0],
    );
    await select.selectOption("11");
    await editor.getByAltText("BEAST artwork preview").waitFor();
    if (width === 390) {
      const client = await context.newPage();
      await client.goto(origin + "/ea-app/");
      await client
        .locator(".ea-startup")
        .waitFor({ state: "detached", timeout: 25000 });
      const nav = client.getByRole("navigation", { name: "Main navigation" });
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      await client
        .getByRole("button", { name: "EA Manipulation", exact: true })
        .click();
      await client.getByLabel("EA artwork", { exact: true }).selectOption("11");
      const dock = await nav.boundingBox();
      for (const [i, name] of names.entries()) {
        await client
          .getByRole("button", { name: `${name} visual mode`, exact: true })
          .click();
        await client.waitForFunction((src) => {
          const im = document.querySelector("[data-home-background]");
          return (
            im?.getAttribute("src") === src &&
            im.complete &&
            im.naturalWidth > 0
          );
        }, saved[i]);
        assert.deepEqual(
          await nav.boundingBox(),
          dock,
          "mode artwork must not move client navigation",
        );
      }
      await client.close();
    }
    await editor
      .getByRole("button", { name: "Remove Image for BEAST", exact: true })
      .click();
    await save.click();
    await editor
      .getByRole("status")
      .filter({ hasText: "Artwork saved" })
      .waitFor();
    assert.deepEqual(records.get(11), [saved[0], null, saved[2], saved[3]]);
    assert.deepEqual(records.get(12), initialSecond);
    // Failed and invalid uploads retain the old reference and never save.
    fail = true;
    await editor
      .getByLabel("Upload NORMAL image", { exact: true })
      .setInputFiles({
        name: "failed.jpg",
        mimeType: "image/jpeg",
        buffer: picture,
      });
    await editor
      .getByRole("alert")
      .filter({ hasText: "Storage temporarily unavailable" })
      .waitFor();
    assert.equal(
      await editor.getByAltText("NORMAL artwork preview").getAttribute("src"),
      saved[0],
    );
    await editor
      .getByLabel("Upload NORMAL image", { exact: true })
      .setInputFiles({
        name: "bad.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg/>"),
      });
    await editor.getByRole("alert").filter({ hasText: "up to 10MB" }).waitFor();
    assert.equal(writes.length, 2);
    await page.goto(origin + "/admin/settings");
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    for (const name of ["Notifications", "Security", "Platform"])
      assert(
        await page.getByRole("heading", { name, exact: true }).isVisible(),
      );
    assert.equal(
      await page.getByText("App Background Image", { exact: true }).count(),
      0,
    );
    assert.equal(await page.locator("input[type=file]").count(), 0);
    await page.goto(origin + "/admin/ea-manager");
    await page
      .getByRole("link", { name: "Manage app background images in Profile" })
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Manage app background images in Profile" })
        .count(),
      2,
    );
    assert.equal(await page.locator(".mentor-background-editor").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${width}px: grid, uploads, persistence, EA isolation, removal, failures, duplicate removal`,
    );
  }
} finally {
  await browser.close();
}
