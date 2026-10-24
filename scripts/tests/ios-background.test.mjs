import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPagesBuild } from "../verify-pages-build.mjs";

for (const [from, to, setting] of [
  ["viewport-fit=cover", "viewport-fit=contain", "viewport-fit=cover"],
  ['name="apple-mobile-web-app-capable" content="yes"', 'name="apple-mobile-web-app-capable" content="no"', "app-capable=yes"],
  ["black-translucent", "black", "status-bar-style=black-translucent"],
]) {
  test(`build rejects client output without ${setting}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "ea-cloud-ios-background-"));
    try {
      cpSync(new URL("../../artifacts/ea-cloud/dist/", import.meta.url), directory, { recursive: true });
      const path = join(directory, "ea-app/index.html");
      const html = readFileSync(path, "utf8");
      assert.ok(html.includes(from));
      writeFileSync(path, html.replace(from, to));
      assert.throws(() => verifyPagesBuild(directory), /Missing iOS edge-to-edge configuration/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

for (const failure of ["missing", "browser", "outside-scope"]) {
  test(`build rejects ${failure} client manifest configuration`, () => {
    const directory = mkdtempSync(join(tmpdir(), "ea-cloud-ios-manifest-"));
    try {
      cpSync(new URL("../../artifacts/ea-cloud/dist/", import.meta.url), directory, { recursive: true });
      const path = join(directory, "ea-app/manifest.webmanifest");
      if (failure === "missing") rmSync(path);
      else {
        const manifest = JSON.parse(readFileSync(path, "utf8"));
        if (failure === "browser") manifest.display = "browser";
        else manifest.start_url = "../";
        writeFileSync(path, JSON.stringify(manifest));
      }
      assert.throws(() => verifyPagesBuild(directory), /PWA (manifest|launch configuration)/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

test("client installation metadata revalidates without changing asset or API caching", () => {
  const headers = readFileSync(new URL("../../artifacts/ea-cloud/dist/_headers", import.meta.url), "utf8");
  const routes = headers.split("\n").filter(line => line.startsWith("/"));
  assert.deepEqual(routes, ["/ea-app/", "/ea-app/index.html", "/ea-app/manifest.webmanifest"]);
  assert.equal((headers.match(/Cache-Control: no-cache/g) || []).length, 3);
  assert.match(headers, /Content-Type: application\/manifest\+json/);
});
