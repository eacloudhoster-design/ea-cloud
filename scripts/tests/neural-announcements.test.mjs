import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const b = await build({
  stdin: {
    contents:
      'export {AnnouncementAudio} from "./artifacts/ea-app/src/lib/announcement-audio";export {VoiceAnnouncementService} from "./artifacts/ea-app/src/lib/voice-announcement-service";export {localVoiceProfile} from "./artifacts/ea-app/src/lib/local-voice-profile";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  AnnouncementAudio,
  VoiceAnnouncementService,
  localVoiceProfile: profile,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  token = btoa("7:client:fixture");
function wav(text) {
  const data = Buffer.from(text + "\0".repeat(Buffer.byteLength(text) % 2)),
    h = Buffer.alloc(44);
  h.write("RIFF");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24);
  h.writeUInt32LE(48000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  const a = Buffer.concat([h, data]);
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength);
}
function store() {
  const clips = new Map();
  return {
    clips,
    profile: async () => null,
    saveProfile: async () => {},
    get: async (s, k) => (clips.get(k)?.scope === s ? clips.get(k) : null),
    put: async (c) => {
      clips.set(c.key, c);
    },
    close() {},
  };
}
async function fixture(run, blocked = false) {
  const oldWindow = globalThis.window,
    oldFetch = globalThis.fetch;
  const spoken = [],
    calls = [],
    contexts = [];
  let active = 0,
    max = 0,
    fail = false;
  class Audio extends EventTarget {
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
        start() {
          active++;
          max = Math.max(max, active);
          spoken.push(this.buffer.text);
          this.timer = setTimeout(() => {
            this.timer = null;
            active--;
            this.onended?.();
          }, 5);
        },
        stop() {
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
            active--;
          }
        },
      };
    }
  }
  globalThis.window = { AudioContext: Audio };
  Object.defineProperty(window, "speechSynthesis", {
    get() {
      throw Error("System speech forbidden");
    },
  });
  globalThis.fetch = async (url) => {
    assert.ok(
      String(url).includes("/natural-voice/"),
      "No speech API calls allowed",
    );
    return new Response("", { status: 404 });
  };
  const engine = {
    async generate(text, signal) {
      calls.push(text);
      if (fail) throw Error("Unavailable");
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      return wav(text);
    },
    dispose() {},
  };
  const players = [];
  const make = (s = store(), t = token) => {
    const a = new AnnouncementAudio(t, s, engine);
    players.push(a);
    return a;
  };
  try {
    await run({
      spoken,
      calls,
      contexts,
      engine,
      make,
      setFail: (x) => (fail = x),
      get max() {
        return max;
      },
    });
  } finally {
    for (const a of players) a.dispose();
    globalThis.window = oldWindow;
    globalThis.fetch = oldFetch;
  }
}
test("same Kokoro identity preserves exact prices and never contacts Gemini", () =>
  fixture(async (f) => {
    const audio = f.make(),
      text =
        "Mentor Élan. Entry at 2,750.25. Balance 1,250 dollars and 50 cents.";
    await audio.play(text, new AbortController().signal);
    assert.deepEqual(f.calls, [text]);
    assert.deepEqual(f.spoken, [text]);
    assert.equal(profile.voice, "af_heart");
  }));
test("safe labels persist across instances and accounts stay isolated; financial reports remain memory-only", () =>
  fixture(async (f) => {
    const s = store(),
      a = f.make(s);
    a.register("Mentor One activated.");
    await a.prepare("Mentor One activated.");
    await a.prepare("Balance is 100.25.");
    assert.equal(s.clips.size, 1);
    await f.make(s).prepare("Mentor One activated.");
    assert.equal(
      f.calls.filter((x) => x === "Mentor One activated.").length,
      1,
    );
    await f.make(s, btoa("9:client:fixture")).prepare("Mentor One activated.");
    assert.equal(
      f.calls.filter((x) => x === "Mentor One activated.").length,
      2,
    );
  }));
test("concurrent identical dynamic speech is generated once", () =>
  fixture(async (f) => {
    const a = f.make();
    await Promise.all([a.prepare("One."), a.prepare("One.")]);
    assert.deepEqual(f.calls, ["One."]);
  }));
test("bundled phrase bypasses dynamic synthesis and persists", () =>
  fixture(async (f) => {
    const text = "Robot started.",
      digest = Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ).toString("hex"),
      s = store();
    globalThis.fetch = async (url) =>
      String(url).endsWith("manifest.json")
        ? Response.json({
            profile,
            clips: { [digest]: `${profile.id}/${digest}.wav` },
          })
        : new Response(wav(text), { headers: { "content-type": "audio/wav" } });
    await f.make(s).prepare(text);
    assert.equal(f.calls.length, 0);
    assert.equal(s.clips.size, 1);
  }));
test("confirmed startup stages append in order without overlap or duplicate playback", () =>
  fixture(async (f) => {
    const service = new VoiceAnnouncementService(token, f.make());
    for (const [i, text] of [
      "Robot started.",
      "Connecting to EA Cloud service.",
      "Connected to trade server.",
      "Ready to trade.",
    ].entries())
      service.announce(text, "stage-" + i, 3, "bot", true);
    service.announce("Robot started.", "stage-0", 3, "bot", true);
    await wait(100);
    assert.deepEqual(f.spoken, [
      "Robot started.",
      "Connecting to EA Cloud service.",
      "Connected to trade server.",
      "Ready to trade.",
    ]);
    assert.equal(f.max, 1);
    service.discard("bot");
    service.announce("Robot stopped.", "stop", 3, "bot");
    await wait(20);
    assert.equal(f.spoken.at(-1), "Robot stopped.");
    service.dispose();
  }));
test("blocked welcome waits for gesture; background events stay silent", () =>
  fixture(async (f) => {
    const service = new VoiceAnnouncementService(token, f.make());
    service.announce("Welcome to Mentor One.", "welcome");
    await wait(15);
    assert.equal(f.spoken.length, 0);
    service.suspend();
    service.foreground();
    service.unlock();
    await wait(25);
    assert.deepEqual(f.spoken, ["Welcome to Mentor One."]);
    service.suspend();
    service.announce("Obsolete.", "obsolete");
    service.foreground();
    await wait(15);
    assert.equal(f.spoken.length, 1);
    service.dispose();
  }, true));
test("local generation failure stays silent while cached natural clips still play", () =>
  fixture(async (f) => {
    const a = f.make();
    await a.prepare("Cached.");
    f.setFail(true);
    const service = new VoiceAnnouncementService(token, a);
    service.announce("Uncached.", "unavailable");
    await wait(15);
    assert.equal(f.spoken.length, 0);
    service.announce("Cached.", "cached");
    await wait(15);
    assert.deepEqual(f.spoken, ["Cached."]);
    service.dispose();
  }));
test("OS-closed context resumes on gesture without changing voice", () =>
  fixture(async (f) => {
    const a = f.make();
    await a.prepare("Cached.");
    await f.contexts[0].close();
    await a.unlock();
    await a.play("Cached.", new AbortController().signal);
    assert.equal(f.contexts.length, 2);
    assert.deepEqual(f.calls, ["Cached."]);
  }));
