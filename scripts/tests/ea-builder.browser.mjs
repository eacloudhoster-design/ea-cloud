import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import {
  zipSync,
  strToU8,
} from "../../artifacts/api-server/node_modules/fflate/esm/index.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5234";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const picture = await readFile("artifacts/ea-cloud/public/default-robot.jpg");
await mkdir("work/ea-builder-ui", { recursive: true });
try {
  for (const width of [390, 360, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width < 600,
      hasTouch: width < 600,
    });
    let legacy = 0,
      packages = 0;
    const robots = [];
    await context.route("https://fonts.**", (r) => r.abort());
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
          robotName: "Existing Robot",
          mentorName: "Existing Manager",
        };
      if (p === "/api/eas") json = [{ id: 11, name: "EA One" }];
      if (p === "/api/admin/ea-builder/config")
        json = {
          origin: "https://eacloudhoster.online",
          legacyIngestion: "https://eacloudhoster.online/api/signals/webhook",
          strategyAvailable: false,
          blocker:
            "Complete verified original strategy source is required. Compilation unverified.",
        };
      if (p === "/api/admin/ea-builder/robots")
        json = { robots, execution: false };
      if (p === "/api/admin/ea-builder/package") {
        if (/name="purpose"\r\n\r\ntrading/.test(req.postData()))
          return r.fulfill({
            status: 409,
            json: {
              error:
                "Trading EA generation is blocked: complete original strategy missing.",
            },
          });
        packages++;
        robots.push({
          id: "fixture",
          name: "GOLD HUNTER PRO",
          revokedAt: null,
          lastSeenAt: null,
          lastEventAt: null,
        });
        return r.fulfill({
          body: Buffer.from(
            zipSync({
              "INSTALLATION_GUIDE.txt": strToU8("Capture only fixture"),
            }),
          ),
          contentType: "application/zip",
          headers: {
            "Content-Disposition":
              'attachment; filename="GOLD_HUNTER_PRO_Integration_Toolkit.zip"',
          },
        });
      }
      if (p === "/api/admin/copier/download") {
        legacy++;
        return r.fulfill({
          body: "// Existing copier fixture",
          contentType: "text/plain",
          headers: {
            "Content-Disposition": 'attachment; filename="Existing_Copier.mq5"',
          },
        });
      }
      return r.fulfill({ json });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/admin/setup");
    // Router may use the existing /setup-method spelling; assert a page, never SPA fallthrough.
    await page
      .getByRole("heading", { name: "Setup Methods", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Create EA", exact: true }).click();
    await page.getByLabel("EA Name", { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector("#setup-name")?.value === "Existing Robot",
    );
    assert.equal(
      await page.getByLabel("EA Manager", { exact: true }).inputValue(),
      "Existing Manager",
    );
    await page.getByLabel("EA Name", { exact: true }).fill("");
    await page.getByRole('button',{name:'Download integration toolkit (not a trading EA)',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Choose an EA'}).waitFor();
    await page.getByLabel("EA Name", { exact: true }).fill("GOLD HUNTER PRO");
    assert(await page.getByRole('button',{name:'CREATE MY EA',exact:true}).isDisabled());
    assert(await page.getByText('Blocked until complete, verified strategy source is available.',{exact:true}).isVisible());
    assert.equal(packages, 0);
    await page
      .getByLabel("Upload MT5 Chart Background", { exact: true })
      .setInputFiles({
        name: "image.png",
        mimeType: "image/png",
        buffer: picture,
      });
    await page.getByAltText("MT5 chart background preview").waitFor();
    await page
      .getByRole("button", { name: "Remove background", exact: true })
      .click();
    await page
      .getByAltText("MT5 chart background preview")
      .waitFor({ state: "detached" });
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Download integration toolkit (not a trading EA)",
        exact: true,
      })
      .click();
    assert.equal(
      (await event).suggestedFilename(),
      "GOLD_HUNTER_PRO_Integration_Toolkit.zip",
    );
    await page
      .getByRole("status")
      .filter({ hasText: "capture-only observer" })
      .waitFor();
    assert.equal(packages, 1);
    const copierDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download Trade Copier", exact: true })
      .click();
    assert.equal(
      (await copierDownload).suggestedFilename(),
      "Existing_Copier.mq5",
    );
    assert.equal(legacy, 1);
    const guideDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download copier guide", exact: true })
      .click();
    assert.equal(
      (await guideDownload).suggestedFilename(),
      "EACloud_Copier_INSTALLATION_GUIDE.txt",
    );
    assert(
      await page
        .getByText("No recent acknowledgement", { exact: true })
        .isVisible(),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `work/ea-builder-ui/${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${width}px: ownership selection, profile prefill, strategy blocker, background preview/remove, toolkit/legacy/guide downloads, truthful status, overflow`,
    );
  }
} finally {
  await browser.close();
}
