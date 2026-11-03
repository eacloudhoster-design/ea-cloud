import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const compiled = await build({
  stdin: {
    contents: `import {createRoot} from './artifacts/ea-app/node_modules/react-dom/client';import {createElement} from './artifacts/ea-app/node_modules/react/index.js';import Splash from './artifacts/ea-app/src/components/StartupSplash';createRoot(document.getElementById('root')).render(createElement(Splash,{ready:true},createElement('p',null,'Recovered interface')));`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  jsx: "automatic",
  define: {
    "import.meta.env.BASE_URL": '"/"',
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      name: "inline-style",
      setup(b) {
        b.onLoad({ filter: /StartupSplash\.css$/ }, () => ({
          contents: "",
          loader: "js",
        }));
      },
    },
  ],
});
const css = await readFile(
  "artifacts/ea-app/src/components/StartupSplash.css",
  "utf8",
);
const logo = await readFile("artifacts/ea-app/public/ea-cloud-logo.jpeg");
const server = http.createServer((req, res) => {
  if (req.url === "/test.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(compiled.outputFiles[0].contents);
  } else if (req.url === "/ea-cloud-logo.jpeg") {
    res.setHeader("Content-Type", "image/jpeg");
    res.end(logo);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<html><head><style>body{margin:0;background:#000;color:#fff}${css}</style></head><body><div id="root"></div><script type="module" src="/test.js"></script></body></html>`,
    );
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    HTMLImageElement.prototype.decode = () => new Promise(() => {});
    document.addEventListener(
      "animationend",
      (e) => e.stopImmediatePropagation(),
      true,
    );
  });
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator(".ea-startup-mark").waitFor();
  const bounds = await page.locator(".ea-startup-mark").boundingBox();
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - 195) < 1);
  assert.ok(Math.abs(bounds.y + bounds.height / 2 - 422) < 1);
  for (let i = 0; i < 14; i++) {
    await page.clock.runFor(1000);
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.clock.resume();
  await page
    .locator(".ea-startup")
    .waitFor({ state: "detached", timeout: 3000 });
  assert.equal(await page.getByText("Recovered interface").isVisible(), true);
  console.log(
    "PASS unchanged centered startup artwork, hung decode fallback and missing animationend recovery",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
