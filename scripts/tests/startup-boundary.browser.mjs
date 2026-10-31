import assert from "node:assert/strict";
import http from "node:http";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const compiled = await build({
  stdin: {
    contents: `import {createRoot} from './artifacts/ea-app/node_modules/react-dom/client';import {createElement} from './artifacts/ea-app/node_modules/react/index.js';import Boundary from './artifacts/ea-app/src/components/StartupErrorBoundary';window.failRender=true;function Child(){if(window.failRender)throw Error('PRIVATE fixture failure');return createElement('p',null,'Recovered app');}createRoot(document.getElementById('root')).render(createElement(Boundary,null,createElement(Child)));`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  jsx: "automatic",
  tsconfig: "artifacts/ea-app/tsconfig.json",
  define: { "process.env.NODE_ENV": '"production"' },
});
const server = http.createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url === "/boundary.js" ? "text/javascript" : "text/html",
  );
  res.end(
    req.url === "/boundary.js"
      ? compiled.outputFiles[0].text
      : '<!doctype html><div id="root"></div><script type="module" src="/boundary.js"></script>',
  );
});
server.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("alert").waitFor();
  assert.match(
    await page.getByRole("alert").innerText(),
    /could not finish loading/,
  );
  const records = await page.evaluate(() => window.__eaStartupDiagnostics);
  assert.equal(records[0].code, "FRONTEND_RENDER_FAILED");
  assert.ok(!JSON.stringify(records).includes("PRIVATE"));
  await page.evaluate(() => (window.failRender = false));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Recovered app", { exact: true }).waitFor();
  console.log(
    "PASS frontend crash boundary distinguishes render failure and Retry remounts initialization",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
