import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright"),
  origin = process.env.APP_ORIGIN || "http://127.0.0.1:5281";
const files = await readdir("artifacts/ea-app/dist/assets"),
  worker = files.find((x) => /^kokoro.worker-.*\.js$/.test(x));
assert.ok(worker);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  await context.route(origin + "/audio-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Real Kokoro regression</title>",
    }),
  );
  const page = await context.newPage();
  page.on("console", (m) => console.log(m.type(), m.text().slice(0, 300)));
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(origin + "/audio-check");
  const result = await page.evaluate(
    async ({ origin, worker }) => {
      const context = new AudioContext(),
        manifest = await (
          await fetch("/ea-app/natural-voice/manifest.json")
        ).json();
      let decoded = 0;
      for (const filename of Object.values(manifest.clips)) {
        const audio = await context.decodeAudioData(
          await (
            await fetch("/ea-app/natural-voice/" + filename)
          ).arrayBuffer(),
        );
        if (audio.duration <= 0 || audio.numberOfChannels !== 1)
          throw Error("Invalid clip");
        decoded++;
      }
      const engine = new Worker(origin + "/ea-app/assets/" + worker, {
          type: "module",
        }),
        started = performance.now();
      const wav = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("Real Kokoro worker timed out")),
          180000,
        );
        engine.onerror = (e) => {
          clearTimeout(timeout);
          reject(Error(e.message));
        };
        engine.onmessage = (e) => {
          clearTimeout(timeout);
          if (e.data.error) reject(Error(e.data.error));
          else resolve(e.data.wav);
        };
        engine.postMessage({
          id: 1,
          text: "Welcome to Mentor Nova. Entry at two thousand seven hundred fifty point two five.",
        });
      });
      const audio = await context.decodeAudioData(wav.slice(0));
      engine.terminate();
      await context.close();
      return {
        decoded,
        duration: audio.duration,
        latency: performance.now() - started,
        bytes: Array.from(new Uint8Array(wav)),
      };
    },
    { origin, worker },
  );
  assert.equal(result.decoded, 25);
  assert.ok(result.duration > 1);
  await mkdir("work/voice-preview", { recursive: true });
  await writeFile(
    "work/voice-preview/kokoro-dynamic.wav",
    Buffer.from(result.bytes),
  );
  delete result.bytes;
  console.log(
    "PASS real bundled WAV decoding and on-device ONNX worker synthesis",
    JSON.stringify(result),
  );
  await context.close();
} finally {
  await browser.close();
}
