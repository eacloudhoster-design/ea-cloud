import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const result = await build({
  entryPoints: ["artifacts/ea-app/src/lib/voice-announcement-service.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { VoiceAnnouncementService } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function fixture(
  run,
  { fail = false, suspended = false, slow = false } = {},
) {
  const original = {
    window: globalThis.window,
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
    fetch: globalThis.fetch,
  };
  const calls = [],
    spoken = [],
    sources = [],
    contexts = [];
  let active = 0,
    max = 0,
    complete;
  class Context {
    state = suspended ? "suspended" : "running";
    destination = {};
    constructor() {
      contexts.push(this);
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
    async decodeAudioData(data) {
      return {
        text: new TextDecoder().decode(data),
        length: 1000,
        numberOfChannels: 1,
      };
    }
    createBufferSource() {
      const source = {
        onended: null,
        connect() {},
        disconnect() {},
        start() {
          spoken.push({ text: this.buffer.text, at: performance.now() });
          active++;
          max = Math.max(max, active);
          this.timer = setTimeout(() => {
            active--;
            this.onended?.();
          }, 10);
        },
        stop() {
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
            active--;
          }
        },
      };
      sources.push(source);
      return source;
    }
  }
  globalThis.window = {
    AudioContext: Context,
    speechSynthesis: {
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
      speaking: false,
      cancel() {},
      resume() {},
      speak(u) {
        spoken.push({ native: true, text: u.text });
        u.onend?.();
      },
    },
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/app/assistant/speech");
    assert.equal(init.headers.Authorization, "Bearer fixture-session");
    const text = JSON.parse(init.body).text;
    calls.push(text);
    if (slow && text === "Obsolete.") {
      await new Promise((r) => (complete = r));
    }
    return fail
      ? new Response("", { status: 503 })
      : new Response(new TextEncoder().encode(text), {
          headers: { "content-type": "audio/wav" },
        });
  };
  const service = new VoiceAnnouncementService("fixture-session");
  try {
    await run({
      service,
      calls,
      spoken,
      contexts,
      sources,
      get max() {
        return max;
      },
      release: () => complete?.(),
    });
  } finally {
    service.dispose();
    Object.assign(globalThis, original);
  }
}
test("cached neural announcements use one authenticated generation, no overlap, exact dynamic names/prices and immediate reuse", async () =>
  fixture(async (f) => {
    f.service.preload(["Welcome to Mentor Élan.", "Normal mode activated."]);
    await wait(15);
    f.service.announce("Welcome to Mentor Élan.", "welcome");
    await wait(20);
    const start = performance.now();
    f.service.announce("Normal mode activated.", "normal", 2, "mode");
    await wait(20);
    assert.ok(f.spoken.at(-1).at - start < 300);
    f.service.announce("Normal mode activated.", "normal-repeat", 2, "mode");
    await wait(20);
    assert.equal(
      f.calls.filter((t) => t === "Normal mode activated.").length,
      1,
    );
    const text =
      "Gold sell setup. Entry at 2,750.25. Stop loss at 2,760.5. Take profit at 2,730.";
    f.service.announce(text, "scan", 2, "scan");
    await wait(25);
    assert.equal(f.spoken.at(-1).text, text);
    assert.equal(f.max, 1);
    assert.ok(f.spoken.every((s) => !s.native));
  }));
test("blocked neural welcome survives until existing gesture; foreground and dispose respect lifecycle", async () =>
  fixture(
    async (f) => {
      f.service.announce("Welcome to Mentor Alpha.", "welcome");
      await wait(20);
      assert.equal(f.spoken.length, 0);
      f.service.suspend();
      f.service.foreground();
      f.service.unlock();
      await wait(25);
      assert.equal(f.spoken[0].text, "Welcome to Mentor Alpha.");
      f.service.suspend();
      f.service.announce("Hidden.", "hidden");
      await wait(10);
      assert.ok(!f.calls.includes("Hidden."));
      f.service.dispose();
      assert.equal(f.contexts[0].state, "closed");
    },
    { suspended: true },
  ));
test("obsolete generation cannot speak after priority/group replacement or disposal", async () =>
  fixture(
    async (f) => {
      f.service.announce("Obsolete.", "old", 2, "mode");
      await wait(2);
      f.service.announce("Ultimate mode activated.", "new", 2, "mode");
      await wait(25);
      f.release();
      await wait(20);
      assert.ok(!f.spoken.some((s) => s.text === "Obsolete."));
      assert.equal(f.spoken[0].text, "Ultimate mode activated.");
      assert.equal(f.max, 1);
    },
    { slow: true },
  ));
test("provider failure preserves announcements with native fallback and backs off further generation", async () =>
  fixture(
    async (f) => {
      f.service.announce("Mentor One activated.", "on", 3, "bot");
      await wait(20);
      f.service.announce("Mentor One deactivated.", "off", 3, "bot");
      await wait(20);
      assert.deepEqual(
        f.spoken.map((s) => s.text),
        ["Mentor One activated.", "Mentor One deactivated."],
      );
      assert.ok(f.spoken.every((s) => s.native));
      assert.equal(f.calls.length, 1);
    },
    { fail: true },
  ));
test("cold audio streams before EOF, preserves PCM values, schedules sequentially and reuses the decoded clip", async () => {
  const bundle = await build({
    entryPoints: ["artifacts/ea-app/src/lib/announcement-audio.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { AnnouncementAudio } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const oldWindow = globalThis.window,
    oldFetch = globalThis.fetch;
  let finished = false,
    calls = 0;
  const starts = [],
    buffers = [];
  class Context {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createBuffer(_channels, length, rate) {
      const data = new Float32Array(length);
      const buffer = {
        length,
        numberOfChannels: 1,
        duration: length / rate,
        getChannelData: () => data,
      };
      buffers.push(buffer);
      return buffer;
    }
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        start(at = 0) {
          starts.push({ at, finished, duration: this.buffer.duration });
          this.timer = setTimeout(() => this.onended?.(), 5);
        },
        stop() {
          clearTimeout(this.timer);
        },
      };
    }
  }
  globalThis.window = { AudioContext: Context };
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).stream, true);
    return new Response(
      new ReadableStream({
        async start(c) {
          c.enqueue(Uint8Array.from([0, 64, 0]));
          await wait(25);
          c.enqueue(Uint8Array.from([192, 0, 32]));
          finished = true;
          c.close();
        },
      }),
      { headers: { "content-type": "audio/L16;rate=24000;channels=1" } },
    );
  };
  const audio = new AnnouncementAudio("session");
  try {
    await audio.play("Exact speech.", new AbortController().signal);
    assert.equal(starts[0].finished, false);
    assert.ok(starts[1].at >= starts[0].at + starts[0].duration);
    assert.deepEqual([...buffers.at(-1).getChannelData(0)], [0.5, -0.5, 0.25]);
    await audio.play("Exact speech.", new AbortController().signal);
    assert.equal(calls, 1);
    globalThis.fetch = async (_url, init) => {
      calls++;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(Uint8Array.from([0, 64]));
            init.signal.addEventListener(
              "abort",
              () => c.error(new DOMException("Cancelled", "AbortError")),
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "audio/L16;rate=24000;channels=1" } },
      );
    };
    const cancellation = new AbortController();
    const pending = audio.play("Cancel streamed speech.", cancellation.signal);
    await wait(10);
    cancellation.abort();
    await assert.rejects(
      () => pending,
      (error) => error.name === "AbortError",
    );
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(Uint8Array.from([0, 64]));
            setTimeout(() => c.error(new Error("Truncated")), 10);
          },
        }),
        { headers: { "content-type": "audio/L16;rate=24000;channels=1" } },
      );
    };
    await assert.rejects(
      () => audio.play("Broken speech.", new AbortController().signal),
      (error) => error.name === "PartialSpeechError",
    );
    const count = calls;
    await assert.rejects(() =>
      audio.play("Broken speech.", new AbortController().signal),
    );
    assert.equal(calls, count + 1, "incomplete audio must not be cached");
  } finally {
    audio.dispose();
    globalThis.window = oldWindow;
    globalThis.fetch = oldFetch;
  }
});
