import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const [target, base] of [["ea-cloud", "/"], ["ea-app", "/ea-app/"]]) {
  const result = spawnSync("pnpm", ["--filter", `@workspace/${target}`, "build"], {
    cwd: root,
    env: { ...process.env, BASE_PATH: base },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
cpSync(new URL("../artifacts/ea-app/dist/", import.meta.url),
  new URL("../artifacts/ea-cloud/dist/ea-app/", import.meta.url), { recursive: true });
