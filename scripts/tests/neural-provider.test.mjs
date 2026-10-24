import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const bundle = await build({
  entryPoints: ["artifacts/api-server/src/lib/assistant-voice.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const rest = JSON.parse(
    await readFile("scripts/tests/fixtures/gemini-voice-rest.json", "utf8"),
  ),
  quota = JSON.parse(
    await readFile("scripts/tests/fixtures/gemini-voice-quota.json", "utf8"),
  );
async function fixture(name, run) {
  const provider = await import(
      "data:text/javascript;base64," +
        Buffer.from(bundle.outputFiles[0].text).toString("base64") +
        "#" +
        name
    ),
    oldFetch = globalThis.fetch;
  const saved = {};
  for (const k of [
    "GEMINI_API_KEY",
    "GEMINI_VOICE_MODEL",
    "GEMINI_VOICE_NAME",
    "VOICE_ASSETS_DIR",
    "VOICE_AUDIO_CACHE_DIR",
  ])
    saved[k] = process.env[k];
  process.env.GEMINI_API_KEY = "fixture-private-key";
  delete process.env.GEMINI_VOICE_MODEL;
  delete process.env.GEMINI_VOICE_NAME;
  delete process.env.VOICE_AUDIO_CACHE_DIR;
  process.env.VOICE_ASSETS_DIR = await mkdtemp(
    join(tmpdir(), "voice-contract-"),
  );
  try {
    await run(provider);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}
test("REST request matches structured speech configuration and documented steps audio; exact text and Aoede are retained", () =>
  fixture("contract", async (p) => {
    let calls = 0;
    const text = "Mentor Élan. Entry at 2,750.25.";
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      assert.ok(!url.includes("fixture-private-key"));
      const body = JSON.parse(init.body);
      assert.equal(body.model, "gemini-3.8-flash-tts");
      assert.equal(body.store, false);
      assert.equal(body.input[0].content[0].text, text);
      assert.deepEqual(body.generation_config.structured_speech_config, [
        { voice: "Aoede" },
      ]);
      assert.ok(!("speech_config" in body.generation_config));
      assert.equal(body.response_format.mime_type, "audio/l16");
      return Response.json(rest);
    };
    const audio = await p.synthesize(7, text, new AbortController().signal);
    assert.equal(audio.toString("ascii", 0, 4), "RIFF");
    assert.equal(audio.readUInt32LE(24), 24000);
    assert.deepEqual([...audio.subarray(44)], [1, 0, 2, 0, 3, 0, 4, 0]);
    await p.synthesize(7, text, new AbortController().signal);
    assert.equal(calls, 1);
    await p.synthesize(8, text, new AbortController().signal);
    assert.equal(calls, 2, "private recordings stay account scoped");
  }));
test("simultaneous common generation is shared between clients; aborting one waiter does not cancel another", () =>
  fixture("dedup", async (p) => {
    let calls = 0,
      release;
    globalThis.fetch = async () => {
      calls++;
      await new Promise((r) => (release = r));
      return Response.json(rest);
    };
    const a = new AbortController(),
      b = new AbortController();
    const first = p.synthesize(7, "Normal mode activated.", a.signal),
      second = p.synthesize(8, "Normal mode activated.", b.signal);
    await new Promise((r) => setTimeout(r, 10));
    a.abort();
    await assert.rejects(
      () => first,
      (e) => e.name === "AbortError",
    );
    release();
    await second;
    assert.equal(calls, 1);
  }));
test("quota fields are sanitized, distinguish quota scope and stop repeated upstream requests during Retry-After", () =>
  fixture("quota", async (p) => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(quota, { status: 429 });
    };
    let failure;
    await assert.rejects(
      () => p.synthesize(7, "Quota test.", new AbortController().signal),
      (e) => {
        failure = e;
        return e.upstreamStatus === 429;
      },
    );
    assert.equal(failure.quota.violations[0].limit, "TestRequestsPerMinute");
    assert.equal(failure.quota.violations[0].value, "3");
    assert.equal(failure.quota.retryAfterSeconds, 59);
    assert.ok(!JSON.stringify(failure.quota).includes("PRIVATE_PROJECT"));
    await assert.rejects(
      () => p.synthesize(8, "Another phrase.", new AbortController().signal),
      (e) =>
        e.code === "VOICE_QUOTA_COOLDOWN" && e.quota.retryAfterSeconds >= 59,
    );
    assert.equal(calls, 1);
  }));
test("zero or daily quota applies a longer cooldown and never changes voice or provider", () =>
  fixture("daily", async (p) => {
    const body = structuredClone(quota);
    body.error.details[0].violations[0].quotaValue = "0";
    globalThis.fetch = async () => Response.json(body, { status: 429 });
    await assert.rejects(() =>
      p.synthesize(7, "Zero test.", new AbortController().signal),
    );
    await assert.rejects(
      () => p.synthesize(7, "Zero test next.", new AbortController().signal),
      (e) => e.quota.retryAfterSeconds >= 3599,
    );
  }));
test("fixed natural recordings persist across provider instances and work during quota exhaustion", () =>
  fixture("disk", async (p) => {
    process.env.VOICE_AUDIO_CACHE_DIR = process.env.VOICE_ASSETS_DIR;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(rest);
    };
    const first = await p.synthesize(
      7,
      "Normal mode activated.",
      new AbortController().signal,
    );
    const other = await import(
      "data:text/javascript;base64," +
        Buffer.from(bundle.outputFiles[0].text).toString("base64") +
        "#disk-restart"
    );
    globalThis.fetch = async () => {
      calls++;
      return Response.json(quota, { status: 429 });
    };
    await assert.rejects(() =>
      other.synthesize(7, "Uncached label.", new AbortController().signal),
    );
    assert.deepEqual(
      await other.synthesize(
        8,
        "Normal mode activated.",
        new AbortController().signal,
      ),
      first,
    );
    assert.equal(
      calls,
      2,
      "recording survives process-memory reset and is shared only for a public fixed phrase",
    );
  }));
test("malformed, non-completed, missing and wrong-rate audio is rejected; SDK shortcut cannot masquerade as a REST response", () =>
  fixture("invalid", async (p) => {
    const wrong = structuredClone(rest);
    wrong.steps[0].content[0].sample_rate = 16000;
    const malformed = structuredClone(rest);
    malformed.steps[0].content[0].data = "@@invalid";
    for (const [i, body] of [
      { status: "completed", output_audio: { data: "AQACAA==" } },
      { status: "completed", steps: [] },
      { ...rest, status: "incomplete" },
      wrong,
      malformed,
    ].entries()) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(() =>
        p.synthesize(7, "Invalid " + i, new AbortController().signal),
      );
    }
    for (const status of [400, 401, 403, 404, 500]) {
      globalThis.fetch = async () => new Response("", { status });
      await assert.rejects(
        () => p.synthesize(7, "Status " + status, new AbortController().signal),
        (e) =>
          e.upstreamStatus === status &&
          !e.message.includes("fixture-private-key"),
      );
    }
  }));
test("legacy configured PCM TTS is still natural Aoede and requires successful audio completion", () =>
  fixture("legacy", async (p) => {
    process.env.GEMINI_VOICE_MODEL = "gemini-2.5-flash-preview-tts";
    globalThis.fetch = async (url, init) => {
      assert.match(url, /generateContent$/);
      assert.equal(
        JSON.parse(init.body).generationConfig.speechConfig.voiceConfig
          .prebuiltVoiceConfig.voiceName,
        "Aoede",
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;rate=24000",
                    data: "AQACAA==",
                  },
                },
              ],
            },
          },
        ],
      });
    };
    const wav = await p.synthesize(
      7,
      "Legacy test.",
      new AbortController().signal,
    );
    assert.equal(wav.length, 48);
  }));
test("stream completion uses interaction.completed and requires completed status before caching", () =>
  fixture("stream", async (p) => {
    const event = (body) => "data: " + JSON.stringify(body) + "\r\n\r\n";
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        event({
          event_type: "step.delta",
          delta: { type: "audio", data: "AQACAA==", mime_type: "audio/l16" },
        }) +
          event({
            event_type: "interaction.completed",
            interaction: { status: "completed" },
          }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
    const chunks = [];
    await p.synthesize(7, "Stream test.", new AbortController().signal, (pcm) =>
      chunks.push(pcm),
    );
    assert.equal(Buffer.concat(chunks).length, 4);
    await p.synthesize(7, "Stream test.", new AbortController().signal);
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response(
        event({
          event_type: "step.delta",
          delta: { type: "audio", data: "AQACAA==" },
        }) + event({ event_type: "interaction.complete" }),
        { headers: { "content-type": "text/event-stream" } },
      );
    await assert.rejects(
      () =>
        p.synthesize(
          7,
          "Bad terminal.",
          new AbortController().signal,
          () => {},
        ),
      /did not complete/,
    );
  }));
