import { spawnSync } from "node:child_process";
import { cpSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyPagesBuild } from "./verify-pages-build.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const [target, command, base] of [["ea-cloud", "build:site", "/"], ["ea-app", "build", "/ea-app/"]]) {
  const result = spawnSync("pnpm", ["--filter", `@workspace/${target}`, command], {
    cwd: root,
    env: { ...process.env, BASE_PATH: base },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
cpSync(new URL("../artifacts/ea-app/dist/", import.meta.url),
  new URL("../artifacts/ea-cloud/dist/ea-app/", import.meta.url), { recursive: true });

const output = new URL("../artifacts/ea-cloud/dist/", import.meta.url);
const applications = verifyPagesBuild(fileURLToPath(output));
const localCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
writeFileSync(new URL("build-info.json", output), JSON.stringify({
  commit: process.env.CF_PAGES_COMMIT_SHA || (localCommit.status === 0 ? localCommit.stdout.trim() : null),
  applications,
}, null, 2) + "\n");
console.log("Verified Pages output: website at / and EA Cloud trading app at /ea-app/");
