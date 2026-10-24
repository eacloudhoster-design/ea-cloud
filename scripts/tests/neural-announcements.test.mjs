import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const bundled = await build({
  stdin: {
    contents:
      'export {AnnouncementAudio} from "./artifacts/ea-app/src/lib/announcement-audio";export {VoiceAnnouncementService} from "./artifacts/ea-app/src/lib/voice-announcement-service";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { AnnouncementAudio, VoiceAnnouncementService } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  profile = {
    id: "a".repeat(64),
    model: "gemini-3.8-flash-tts",
    voice: "Aoede",
    configured: true,
  },
  token = btoa("7:client:fixture");
function wav(text) {
  const pcm = Buffer.from(text + "\0".repeat(Buffer.byteLength(text) % 2));
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function memoryStore() {
  const clips = new Map(),
    profiles = new Map();
  return {
    clips,
    profiles,
    profile: async (s) => profiles.get(s) || null,
    saveProfile: async (s, p) => {
      profiles.set(s, p);
    },
    get: async (s, k) => (clips.get(k)?.scope === s ? clips.get(k) : null),
    put: async (c) => {
      clips.set(c.key, c);
    },
    close() {},
  };
}
async function fixture(run, { blocked = false } = {}) {
  const originals = {
    window: globalThis.window,
    fetch: globalThis.fetch,
    utterance: Object.getOwnPropertyDescriptor(
      globalThis,
      "SpeechSynthesisUtterance",
    ),
  };
  const calls = [],
    spoken = [],
    contexts = [],
    errors = [];
  let active = 0,
    max = 0,
    mode = "ok",
    slowRelease = null,
    currentProfile = { ...profile },
    failOnce = false;
  class Context extends EventTarget {
    state = blocked ? "suspended" : "running";
    destination = {};
    constructor() {
      super();
      contexts.push(this);
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      this.dispatchEvent(new Event("statechange"));
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
    async decodeAudioData(data) {
      return {
        text: new TextDecoder()
          .decode(new Uint8Array(data, 44))
          .replace(/\0+$/, ""),
        length: 1000,
        numberOfChannels: 1,
      };
    }
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        onended: null,
        live: false,
        start() {
          this.live = true;
          active++;
          max = Math.max(active, max);
          spoken.push({ text: this.buffer.text, at: performance.now() });
          this.timer = setTimeout(() => {
            if (this.live) {
              this.live = false;
              active--;
              this.onended?.();
            }
          }, 15);
        },
        stop() {
          if (this.live) {
            this.live = false;
            active--;
          }
          clearTimeout(this.timer);
        },
      };
    }
  }
  const window = { AudioContext: Context };
  Object.defineProperty(window, "speechSynthesis", {
    get() {
      throw Error("Robotic synthesis is forbidden");
    },
  });
  globalThis.window = window;
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    get() {
      throw Error("Robotic utterances are forbidden");
    },
  });
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/app/assistant/voice-config") {
      assert.match(init.headers.Authorization, /^Bearer /);
      return Response.json(currentProfile);
    }
    if (url.includes("/natural-voice/"))
      return new Response("", { status: 404 });
    assert.equal(url, "/api/app/assistant/speech");
    const body = JSON.parse(init.body);
    assert.equal(body.profileId, currentProfile.id);
    calls.push(body.text);
    if (mode === "network" || failOnce) {
      failOnce = false;
      throw Error("Network down");
    }
    if (mode === "quota")
      return Response.json(
        { code: "VOICE_PROVIDER" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    if (body.text === "Obsolete." && mode === "slow")
      await new Promise((r) => (slowRelease = r));
    return new Response(wav(body.text), {
      headers: {
        "Content-Type": "audio/wav",
        "X-EA-Voice-Identity": currentProfile.id,
      },
    });
  };
  try {
    await run({
      calls,
      spoken,
      contexts,
      get max() {
        return max;
      },
      get active() {
        return active;
      },
      setMode: (v) => (mode = v),
      setProfile: (p) => (currentProfile = p),
      failOnce: () => (failOnce = true),
      release: () => slowRelease?.(),
    });
  } finally {
    for (const context of contexts) await context.close();
    globalThis.window = originals.window;
    globalThis.fetch = originals.fetch;
    if (originals.utterance)
      Object.defineProperty(
        globalThis,
        "SpeechSynthesisUtterance",
        originals.utterance,
      );
    else delete globalThis.SpeechSynthesisUtterance;
  }
}
test("common natural recordings persist across instances, isolate accounts/profiles and preserve exact dynamic prices", () =>
  fixture(async (f) => {
    const store = memoryStore();
    let audio = new AnnouncementAudio(token, store);
    await audio.preload(["Normal mode activated."]);
    await audio.play("Normal mode activated.", new AbortController().signal);
    assert.equal(f.calls.length, 1);
    assert.equal(store.clips.size, 1);
    audio.dispose();
    audio = new AnnouncementAudio(token, store);
    const start = performance.now();
    await audio.play("Normal mode activated.", new AbortController().signal);
    assert.equal(f.calls.length, 1);
    assert.ok(f.spoken.at(-1).at - start < 300);
    audio.dispose();
    audio = new AnnouncementAudio(btoa("8:client:fixture"), store);
    await audio.preload(["Normal mode activated."]);
    assert.equal(f.calls.length, 2);
    audio.dispose();
    f.setProfile({ ...profile, id: "b".repeat(64) });
    audio = new AnnouncementAudio(token, store);
    await audio.preload(["Normal mode activated."]);
    assert.equal(f.calls.length, 3);
    const text =
      "Gold sell. Entry at 2,750.25. Stop loss at 2,760.5. Take profit at 2,730.";
    await audio.play(text, new AbortController().signal);
    assert.equal(f.spoken.at(-1).text, text);
    assert.ok(
      ![...store.clips.values()].some((row) =>
        new TextDecoder().decode(row.data).includes("2,750.25"),
      ),
      "financial reports must not persist",
    );
    audio.dispose();
  }));
test("simultaneous identical requests share one generation and one decode cache", () =>
  fixture(async (f) => {
    const audio = new AnnouncementAudio(token, memoryStore());
    try {
      await Promise.all([
        audio.prepare("Shared recording."),
        audio.prepare("Shared recording."),
      ]);
      assert.equal(f.calls.length, 1);
    } finally {
      audio.dispose();
    }
  }));
test("429 stops generation retries while existing cached natural clips continue; no robotic API is touched", () =>
  fixture(async (f) => {
    const audio = new AnnouncementAudio(token, memoryStore());
    try {
      await audio.preload(["Normal mode activated."]);
      f.setMode("quota");
      await assert.rejects(
        () => audio.prepare("Quota unavailable."),
        (e) => e.code === "VOICE_PROVIDER",
      );
      await assert.rejects(() => audio.prepare("Do not hammer Gemini."));
      assert.equal(f.calls.length, 2);
      await audio.play("Normal mode activated.", new AbortController().signal);
      assert.equal(f.spoken.at(-1).text, "Normal mode activated.");
      assert.equal(f.calls.length, 2);
    } finally {
      audio.dispose();
    }
  }));
test("transient network error retries once; cancellation discards obsolete audio without overlapping", () =>
  fixture(async (f) => {
    const audio = new AnnouncementAudio(token, memoryStore());
    try {
      f.failOnce();
      await audio.prepare("Retry naturally.");
      assert.equal(f.calls.filter((x) => x === "Retry naturally.").length, 2);
    } finally {
      audio.dispose();
    }
    const manager = new VoiceAnnouncementService(token);
    try {
      f.setMode("slow");
      manager.announce("Obsolete.", "old", 2, "mode");
      await wait(10);
      manager.announce("Ultimate mode activated.", "ultimate", 2, "mode");
      await wait(40);
      f.release();
      await wait(30);
      assert.ok(!f.spoken.some((x) => x.text === "Obsolete."));
      assert.equal(f.spoken.at(-1).text, "Ultimate mode activated.");
      assert.equal(f.max, 1);
    } finally {
      manager.dispose();
    }
  }));
test("blocked welcome survives backgrounding and speaks once after permitted gesture; disposal/hidden events are silent", () =>
  fixture(
    async (f) => {
      const manager = new VoiceAnnouncementService(token);
      try {
        manager.announce("Welcome to Mentor Élan.", "welcome");
        await wait(10);
        assert.equal(f.spoken.length, 0);
        manager.suspend();
        manager.foreground();
        await wait(10);
        assert.equal(f.spoken.length, 0);
        manager.unlock();
        await wait(40);
        assert.equal(f.spoken[0].text, "Welcome to Mentor Élan.");
        manager.unlock();
        await wait(20);
        assert.equal(f.spoken.length, 1);
        manager.suspend();
        manager.announce("Hidden.", "hidden");
        await wait(10);
        assert.ok(!f.calls.includes("Hidden."));
      } finally {
        manager.dispose();
      }
    },
    { blocked: true },
  ));
test("priority, duplicate and rapid group replacement retain one natural player", () =>
  fixture(async (f) => {
    const manager = new VoiceAnnouncementService(token);
    try {
      manager.announce("Normal mode activated.", "normal", 2, "mode");
      await wait(5);
      manager.announce("Ultimate mode activated.", "ultimate", 2, "mode");
      manager.announce("Confirmed execution.", "trade", 3);
      manager.announce("Confirmed execution.", "trade", 3);
      await wait(80);
      assert.equal(
        f.spoken.filter((x) => x.text === "Confirmed execution.").length,
        1,
      );
      assert.equal(f.max, 1);
    } finally {
      manager.dispose();
    }
  }));
test("OS-closed audio context can be recreated inside a new permitted gesture without changing voice", () =>
  fixture(async (f) => {
    const audio = new AnnouncementAudio(token, memoryStore());
    try {
      await audio.preload(["Normal mode activated."]);
      await f.contexts.at(-1).close();
      await audio.unlock();
      await audio.play("Normal mode activated.", new AbortController().signal);
      assert.equal(f.calls.length, 1);
      assert.equal(f.spoken.at(-1).text, "Normal mode activated.");
    } finally {
      audio.dispose();
    }
  }));
test("quota failures in the central announcer remain silent and never invoke forbidden system voices", () =>
  fixture(async (f) => {
    f.setMode("quota");
    const manager = new VoiceAnnouncementService(token);
    try {
      manager.announce("Mentor active.", "on", 3, "bot");
      await wait(30);
      manager.announce("Beast mode activated.", "beast", 2, "mode");
      await wait(30);
      assert.equal(f.spoken.length, 0);
      assert.equal(f.calls.length, 1);
    } finally {
      manager.dispose();
    }
  }));
