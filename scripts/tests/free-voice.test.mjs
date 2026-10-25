import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const b = await build({
  entryPoints: ["artifacts/ea-app/src/lib/bot-start-progress.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const { BotStartProgress } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
test("connection and ready stages require a successful save and a fresh verified snapshot", () => {
  const p = new BotStartProgress(),
    s = {
      observedAt: Date.now(),
      connected: true,
      engine: true,
      robotEnabled: true,
      tradeAllowed: true,
    };
  p.request();
  // A fresh snapshot is observed at/after the request, even across clock ticks.
  s.observedAt = p.requestedAt;
  assert.deepEqual(p.observe(s), []);
  p.saved = true;
  assert.deepEqual(p.observe({ ...s, observedAt: p.requestedAt - 1 }), []);
  assert.deepEqual(p.observe({ ...s, connected: false, engine: false }), []);
  assert.deepEqual(p.observe({ ...s, engine: false }), []);
  assert.deepEqual(p.observe(s), ["activated", "connected", "ready"]);
  assert.deepEqual(p.observe(s), []);
  p.stop();
  assert.deepEqual(p.observe(s), []);
});
test("generated clips have one identity and valid non-silent normalized PCM; all common phrases are bundled", async () => {
  const root = "artifacts/ea-app/public/natural-voice/",
    m = JSON.parse(await readFile(root + "manifest.json")),
    phrases = JSON.parse(
      await readFile("lib/api-zod/src/common-voice-phrases.json"),
    );
  assert.equal(m.profile.voice, "af_heart");
  for (const text of phrases) {
    const hash = createHash("sha256").update(text).digest("hex"),
      path = m.clips[hash];
    assert.equal(path, `${m.profile.id}/${hash}.wav`);
    const wav = await readFile(root + path);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2)
      peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 30000);
    assert.ok(wav.length > 24000);
  }
});
test("self-hosted dynamic model chunks and voice are hash-verified and below Pages size limit", async () => {
  const root = "artifacts/ea-app/public/natural-voice/model/",
    m = JSON.parse(await readFile(root + "manifest.json")),
    parts = [];
  for (const part of m.parts) {
    const b = await readFile(root + part.file);
    assert.equal(b.length, part.bytes);
    assert.ok(b.length < 25 * 1024 * 1024);
    assert.equal(createHash("sha256").update(b).digest("hex"), part.sha256);
    parts.push(b);
  }
  assert.equal(
    createHash("sha256").update(Buffer.concat(parts)).digest("hex"),
    m.sha256,
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(root + "af_heart.bin"))
      .digest("hex"),
    m.voiceSha256,
  );
});
