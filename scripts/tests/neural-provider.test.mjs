import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const bundle = await build({
  entryPoints: ["artifacts/api-server/src/lib/assistant-voice.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const provider = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
test("current neural TTS uses structured delivery, verbatim transcript, private client cache and validated PCM", async () => {
  const oldFetch = globalThis.fetch,
    oldKey = process.env.GEMINI_API_KEY,
    oldModel = process.env.GEMINI_VOICE_MODEL;
  process.env.GEMINI_API_KEY = "fixture-secret";
  delete process.env.GEMINI_VOICE_MODEL;
  let calls = 0;
  const transcript = "Mentor Élan. Entry at 2,750.25. Stop loss at 2,760.5.";
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      assert.ok(!url.includes("fixture-secret"));
      const body = JSON.parse(init.body);
      assert.equal(body.model, "gemini-3.8-flash-tts");
      assert.equal(body.store, false);
      const part = body.input[0].content[0];
      assert.equal(part.text, transcript);
      assert.match(part.annotations[0].style, /adult feminine/);
      assert.match(part.annotations[0].style, /retaining every digit/);
      assert.equal(body.generation_config.speech_config[0].voice, "Aoede");
      assert.equal(body.response_format.mime_type, "audio/l16");
      return Response.json({
        status: "completed",
        output_audio: { data: Buffer.alloc(2400).toString("base64") },
      });
    };
    const wav = await provider.synthesize(
      701,
      transcript,
      new AbortController().signal,
    );
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(24), 24000);
    await provider.synthesize(701, transcript, new AbortController().signal);
    assert.equal(calls, 1);
    await provider.synthesize(702, transcript, new AbortController().signal);
    assert.equal(calls, 2);
    for (const status of [401, 403, 404, 429, 500]) {
      globalThis.fetch = async () => new Response("", { status });
      await assert.rejects(
        () =>
          provider.synthesize(
            701,
            "failure " + status,
            new AbortController().signal,
          ),
        (error) =>
          error.upstreamStatus === status &&
          !error.message.includes("fixture-secret"),
      );
    }
    for (const body of [
      { status: "completed", output_audio: { data: "@@bad" } },
      {
        status: "in_progress",
        output_audio: { data: Buffer.alloc(12).toString("base64") },
      },
      { status: "completed" },
      { status: "completed", output_audio: { data: "" } },
    ]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(() =>
        provider.synthesize(
          701,
          JSON.stringify(body),
          new AbortController().signal,
        ),
      );
    }
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [
      ["GEMINI_API_KEY", oldKey],
      ["GEMINI_VOICE_MODEL", oldModel],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
test("streamed PCM starts before completion, validates fragmented SSE, caches only complete speech", async () => {
  const oldFetch = globalThis.fetch,
    oldKey = process.env.GEMINI_API_KEY,
    oldModel = process.env.GEMINI_VOICE_MODEL;
  process.env.GEMINI_API_KEY = "fixture-secret";
  delete process.env.GEMINI_VOICE_MODEL;
  let requests = 0,
    finished = false;
  const received = [];
  const event = (body) => "data: " + JSON.stringify(body) + "\r\n\r\n";
  try {
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.equal(JSON.parse(init.body).stream, true);
      return new Response(
        new ReadableStream({
          async start(c) {
            const a = event({
              event_type: "step.delta",
              delta: {
                type: "audio",
                data: Buffer.from([1, 0, 2]).toString("base64"),
              },
            });
            c.enqueue(new TextEncoder().encode(a.slice(0, -1)));
            c.enqueue(new TextEncoder().encode(a.slice(-1)));
            await new Promise((r) => setTimeout(r, 15));
            c.enqueue(
              new TextEncoder().encode(
                event({
                  event_type: "step.delta",
                  delta: {
                    type: "audio",
                    data: Buffer.from([0, 3, 0]).toString("base64"),
                  },
                }) + event({ event_type: "interaction.complete" }),
              ),
            );
            finished = true;
            c.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
    const audio = await provider.synthesize(
      801,
      "Stream exact prices.",
      new AbortController().signal,
      (pcm) => {
        if (!received.length) assert.equal(finished, false);
        received.push(pcm);
      },
    );
    assert.deepEqual([...Buffer.concat(received)], [1, 0, 2, 0, 3, 0]);
    assert.equal(audio.length, 50);
    const cached = [];
    await provider.synthesize(
      801,
      "Stream exact prices.",
      new AbortController().signal,
      (pcm) => cached.push(pcm),
    );
    assert.equal(requests, 1);
    assert.deepEqual(Buffer.concat(cached), audio.subarray(44));
    globalThis.fetch = async () =>
      new Response(
        event({
          event_type: "step.delta",
          delta: { type: "audio", data: "AQACAA==" },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    await assert.rejects(
      () =>
        provider.synthesize(
          801,
          "Incomplete.",
          new AbortController().signal,
          () => {},
        ),
      /did not complete/,
    );
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [
      ["GEMINI_API_KEY", oldKey],
      ["GEMINI_VOICE_MODEL", oldModel],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
