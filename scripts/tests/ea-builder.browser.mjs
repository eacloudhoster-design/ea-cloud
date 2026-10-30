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
  for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width < 600,
      hasTouch: width < 600,
      permissions: ["clipboard-write", "clipboard-read"],
    });
    let packages = 0,
      copiers = 0,
      failPackage = true;
    const robots = [];
    await context.route("https://fonts.**", (r) => r.abort());
    await context.route("**/api/**", async (r) => {
      const req = r.request(),
        path = new URL(req.url()).pathname;
      let json = [];
      if (path === "/api/auth/me" || path === "/api/profile")
        json = {
          id: 5,
          role: "mentor",
          status: "approved",
          email: "mentor@example.invalid",
          robotName: "GOLD HUNTER PRO",
          mentorName: "Existing Manager",
        };
      if (path === "/api/eas")
        json = [
          { id: 11, name: "EA One" },
          { id: 12, name: "EA Two" },
        ];
      if (path === "/api/admin/ea-builder/config")
        json = {
          origin: "https://eacloudhoster.online",
          strategyAvailable: true,
        };
      if (path === "/api/admin/ea-builder/robots") json = { robots };
      if (path === "/api/admin/ea-builder/package") {
        packages++;
        assert(req.postData()?.includes("trading"));
        if (failPackage) {
          failPackage = false;
          return r.fulfill({
            status: 503,
            json: { error: "Package temporarily unavailable. Please retry." },
          });
        }
        robots.push({
          id: "fixture",
          name: "GOLD HUNTER PRO",
          mode: "integrated-ea",
          copyEnabled: false,
          lastSeenAt: null,
          revokedAt: null,
        });
        return r.fulfill({
          body: Buffer.from(
            zipSync({
              "GOLD_HUNTER_PRO/GOLD_HUNTER_PRO.mq5": strToU8(
                "// Browser fixture; source verified in package tests",
              ),
            }),
          ),
          contentType: "application/zip",
          headers: {
            "Content-Disposition": 'attachment; filename="GOLD_HUNTER_PRO.zip"',
          },
        });
      }
      if (path === "/api/admin/copier/download") {
        assert.equal(new URL(req.url()).searchParams.get("format"), "zip");
        copiers++;
        return r.fulfill({
          body: Buffer.from(
            zipSync({
              "Copier/Existing_Copier.mq5": strToU8(
                "// Original standalone copier fixture",
              ),
            }),
          ),
          contentType: "application/zip",
          headers: {
            "Content-Disposition":
              'attachment; filename="GOLD_HUNTER_PRO_Copier.zip"',
          },
        });
      }
      return r.fulfill({ json });
    });
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/admin/setup");
    await page
      .getByRole("heading", { name: "CREATE YOUR TRADING EA", exact: true })
      .waitFor();
    await page.getByText("Existing Manager", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Connect Existing EA", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Edit in Profile", exact: true })
        .getAttribute("href"),
      "/admin/profile",
    );
    await page
      .getByLabel("EA registration", { exact: true })
      .selectOption("12");
    const input = page.locator("#setup-background");
    await input.setInputFiles({
      name: "background.jpg",
      mimeType: "image/jpeg",
      buffer: picture,
    });
    await page.getByAltText("MT5 chart background preview").waitFor();
    await page
      .getByRole("button", { name: "Remove background", exact: true })
      .click();
    await page
      .getByAltText("MT5 chart background preview")
      .waitFor({ state: "detached" });
    await page.getByRole("button", { name: "CREATE EA", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "temporarily unavailable" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "DOWNLOAD FILE", exact: true })
        .count(),
      0,
      "failed generation cannot show success",
    );
    await page.getByRole("button", { name: "CREATE EA", exact: true }).click();
    await page.getByText("YOUR EA IS READY", { exact: true }).waitFor();
    let event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "DOWNLOAD FILE", exact: true })
      .click();
    assert.equal((await event).suggestedFilename(), "GOLD_HUNTER_PRO.zip");
    assert.equal(packages, 2);
    await page
      .getByRole("button", { name: "CREATE COPY TRADING FILE", exact: true })
      .click();
    await page
      .getByText("YOUR COPY TRADING FILE IS READY", { exact: true })
      .waitFor();
    event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "DOWNLOAD COPY TRADING FILE", exact: true })
      .click();
    assert.equal(
      (await event).suggestedFilename(),
      "GOLD_HUNTER_PRO_Copier.zip",
    );
    assert.equal(copiers, 1);
    await page.getByRole("button", { name: "COPY URL", exact: true }).click();
    await page.getByText("URL copied successfully.", { exact: true }).waitFor();
    const layout = await page.evaluate(() => {
      const a = document
          .querySelector("#create-ea-heading")
          .closest("section")
          .getBoundingClientRect(),
        b = document
          .querySelector("#copy-heading")
          .closest("section")
          .getBoundingClientRect();
      return {
        below: b.top >= a.bottom,
        sameWidth: Math.abs(a.width - b.width) < 1,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    assert(
      layout.below && layout.sameWidth,
      "sections must be stacked on desktop and mobile",
    );
    assert(!layout.overflow, "no horizontal overflow");
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `work/ea-builder-ui/setup-final-${width}.png`,
      fullPage: true,
    });
    await context.close();
    console.log(
      `PASS ${width}px: vertical layout, saved branding, EA selection, image preview/remove, truthful failure/retry, separate package downloads, clipboard and overflow`,
    );
  }
} finally {
  await browser.close();
}
