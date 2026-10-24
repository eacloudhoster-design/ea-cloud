import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const { chromium } = createRequire(import.meta.url)("playwright");
const bundled = await build({
  stdin: {
    contents: `export {IndexedNaturalAudioStore} from './artifacts/ea-app/src/lib/natural-audio-store'; export {AnnouncementAudio} from './artifacts/ea-app/src/lib/announcement-audio';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  globalName: "NaturalTest",
  write: false,
});
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext();
try {
  await context.route("http://voice.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Audio persistence regression</title>",
    }),
  );
  const page = await context.newPage();
  await page.goto("http://voice.test/");
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { IndexedNaturalAudioStore } = NaturalTest;
    const p = {
        id: "a".repeat(64),
        model: "gemini-3.8-flash-tts",
        voice: "Aoede",
        configured: true,
      },
      scope = "client:7";
    let store = new IndexedNaturalAudioStore();
    await store.saveProfile(scope, p);
    await store.put({
      key: "persist",
      scope,
      profileId: p.id,
      data: new Uint8Array([1, 2, 3, 4]).buffer,
      at: Date.now(),
    });
    store.close();
    store = new IndexedNaturalAudioStore();
    const restored = await store.get(scope, "persist"),
      profile = await store.profile(scope),
      other = await store.get("client:9", "persist");
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        store.put({
          key: "limit-" + i,
          scope,
          profileId: p.id,
          data: new ArrayBuffer(8),
          at: Date.now() + i,
        }),
      ),
    );
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("ea-cloud-natural-audio", 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    const count = await new Promise((resolve) => {
      const r = db.transaction("clips").objectStore("clips").count();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    await store.put({
      key: "expired",
      scope,
      profileId: p.id,
      data: new ArrayBuffer(8),
      at: Date.now() - 15 * 86400000,
    });
    const expired = await store.get(scope, "expired");
    store.close();
    return {
      bytes: [...new Uint8Array(restored.data)],
      profile,
      other,
      count,
      expired,
    };
  });
  assert.deepEqual(result.bytes, [1, 2, 3, 4]);
  assert.equal(result.profile.voice, "Aoede");
  assert.equal(result.other, null);
  assert.equal(result.count, 96);
  assert.equal(result.expired, null);
  // A new document uses real IndexedDB, not an injected in-memory store.
  await page.reload();
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  assert.equal(
    await page.evaluate(async () => {
      const s = new NaturalTest.IndexedNaturalAudioStore();
      try {
        return (await s.profile("client:7")).id;
      } finally {
        s.close();
      }
    }),
    "a".repeat(64),
  );
  console.log(
    "PASS real IndexedDB reopen/reload, account isolation, expiration and concurrent 96-clip bound",
  );
} finally {
  await context.close();
  await browser.close();
}
