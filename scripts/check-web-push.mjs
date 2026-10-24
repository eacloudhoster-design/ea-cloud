// Read-only diagnosis in the authorized API environment. Prints no keys or URLs.
import { build } from "../artifacts/api-server/node_modules/esbuild/lib/main.js";
const names = [
  "WEB_PUSH_PUBLIC_KEY",
  "WEB_PUSH_PRIVATE_KEY",
  "WEB_PUSH_SUBJECT",
];
const sessionSecretConfigured =
  !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16;
const presence = Object.fromEntries(
  names.map((name) => [name, !!process.env[name]?.trim()]),
);
if (!process.env.DATABASE_URL) {
  console.log(
    JSON.stringify({
      presence,
      sessionSecretConfigured,
      storage: { ready: false, code: "DATABASE_URL_NOT_CONFIGURED" },
    }),
  );
  process.exitCode = 1;
} else {
  const timer = setTimeout(() => {
    console.log(JSON.stringify({ code: "PUSH_DIAGNOSTIC_TIMEOUT" }));
    process.exit(1);
  }, 15000);
  timer.unref();
  let pool;
  try {
    const code = await build({
      stdin: {
        contents:
          'export {pushConfiguration,pushStorageReadiness} from "./artifacts/api-server/src/lib/web-push";export {pool} from "./lib/db/src/index";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      banner: {
        js: 'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");',
      },
    });
    const module = await import(
      "data:text/javascript;base64," +
        Buffer.from(code.outputFiles[0].text).toString("base64")
    );
    pool = module.pool;
    const configuration = module.pushConfiguration(),
      storage = await module.pushStorageReadiness();
    console.log(
      JSON.stringify({
        presence,
        sessionSecretConfigured,
        configuration: {
          configured: configuration.configured,
          code: configuration.reason,
          missing: configuration.missing,
        },
        storage,
      }),
    );
  } catch {
    console.log(
      JSON.stringify({
        presence,
        sessionSecretConfigured,
        code: "PUSH_DIAGNOSTIC_UNAVAILABLE",
      }),
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
    clearTimeout(timer);
  }
}
