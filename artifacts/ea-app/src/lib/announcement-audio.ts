import { localVoiceProfile } from "./local-voice-profile";
import { LocalNeuralVoice } from "./local-neural-voice";
import {
  IndexedNaturalAudioStore,
  announcementScope,
  type NaturalAudioStore,
  type NaturalVoiceProfile,
} from "./natural-audio-store";
import { isCommonNaturalAnnouncement } from "../../../../lib/api-zod/src/voice-announcements";
export class NaturalSpeechError extends Error {
  constructor(
    public code: string,
    public retryable = false,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
/** One natural identity, exact-text reuse and bounded persistent common recordings. */
export class AnnouncementAudio {
  private context: AudioContext;
  private Constructor: typeof AudioContext;
  private cache = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private persistent = new Set<string>();
  private lifetime = new AbortController();
  private source: AudioBufferSourceNode | null = null;
  private end: (() => void) | null = null;
  private bytes = 0;
  private manifest: Promise<any> | null = null;
  private scope: string | null;
  constructor(
    private token: string,
    private storage: NaturalAudioStore = new IndexedNaturalAudioStore(),
    private engine: Pick<
      LocalNeuralVoice,
      "generate" | "dispose"
    > = new LocalNeuralVoice(),
  ) {
    const Constructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Constructor) throw new NaturalSpeechError("AUDIO_UNSUPPORTED");
    this.Constructor = Constructor;
    this.context = new Constructor();
    this.scope = announcementScope(token);
  }
  get playing() {
    return this.source !== null;
  }
  get running() {
    return this.context.state === "running";
  }
  async unlock() {
    if (this.context.state === "closed") this.context = new this.Constructor();
    const resumed = this.context.resume();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new DOMException("Audio permission is pending.", "NotAllowedError"),
          ),
        3000,
      );
      resumed.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
  private profile() {
    return Promise.resolve(localVoiceProfile);
  }
  private assets() {
    if (!this.manifest)
      this.manifest = fetch("/ea-app/natural-voice/manifest.json", {
        cache: "no-cache",
        signal: AbortSignal.any([
          this.lifetime.signal,
          AbortSignal.timeout(2000),
        ]),
      })
        .then(async (response) =>
          response.ok && response.headers.get("content-type")?.includes("json")
            ? response.json()
            : null,
        )
        .catch(() => null);
    return this.manifest;
  }
  private async asset(
    text: string,
    profile: NaturalVoiceProfile,
    key: string | null,
  ) {
    if (!key) return null;
    const manifest = await this.assets(),
      hash = key.split(":").at(-1);
    if (
      manifest?.profile?.id !== profile.id ||
      !hash ||
      manifest.clips?.[hash] !== `${profile.id}/${hash}.wav`
    )
      return null;
    try {
      const response = await fetch(
        `/ea-app/natural-voice/${profile.id}/${hash}.wav`,
        {
          cache: "force-cache",
          signal: AbortSignal.any([
            this.lifetime.signal,
            AbortSignal.timeout(4000),
          ]),
        },
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("audio/wav")
      )
        return null;
      const data = await response.arrayBuffer();
      if (data.byteLength < 44 || data.byteLength > 4_100_000) return null;
      return data;
    } catch {
      return null;
    }
  }
  recover() {
    this.manifest = null;
  }
  private async key(text: string, profile: NaturalVoiceProfile) {
    if (!this.scope || !globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return `${this.scope}:${profile.id}:${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  private async fetchAudio(
    text: string,
    _profile: NaturalVoiceProfile,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    const data = await this.engine.generate(
      text,
      AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])]),
    );
    const bytes = new Uint8Array(data);
    if (
      data.byteLength < 44 ||
      data.byteLength > 4_100_000 ||
      String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
      String.fromCharCode(...bytes.subarray(8, 12)) !== "WAVE"
    )
      throw new NaturalSpeechError("VOICE_AUDIO");
    return data;
  }
  async prepare(text: string, signal?: AbortSignal): Promise<AudioBuffer> {
    if (this.lifetime.signal.aborted || signal?.aborted)
      throw new DOMException("Cancelled", "AbortError");
    const profile = await this.profile();
    const memoryKey = `${profile.id}:${text}`;
    const hit = this.cache.get(memoryKey);
    if (hit) {
      this.cache.delete(memoryKey);
      this.cache.set(memoryKey, hit);
      return hit;
    }
    const pending = this.pending.get(memoryKey);
    if (pending) return pending;
    const work = (async () => {
      const key = await this.key(text, profile);
      const stored =
        key && this.scope
          ? await this.storage.get(this.scope, key).catch(() => null)
          : null;
      if (stored?.profileId === profile.id) {
        try {
          const audio = await this.context.decodeAudioData(
            stored.data.slice(0),
          );
          this.remember(memoryKey, audio);
          return audio;
        } catch {
          /* Corrupt/unsupported recordings are regenerated, never replaced by native speech. */
        }
      }
      const asset = await this.asset(text, profile, key);
      if (asset) {
        try {
          const audio = await this.context.decodeAudioData(asset.slice(0));
          this.remember(memoryKey, audio);
          if (key && this.scope)
            await this.storage
              .put({
                key,
                scope: this.scope,
                profileId: profile.id,
                data: asset,
                at: Date.now(),
              })
              .catch(() => {});
          return audio;
        } catch {
          /* Invalid assets cannot replace speech. */
        }
      }
      const data = await this.fetchAudio(text, profile, signal);
      const audio = await this.context.decodeAudioData(data.slice(0));
      if (this.lifetime.signal.aborted || signal?.aborted)
        throw new DOMException("Cancelled", "AbortError");
      this.remember(memoryKey, audio);
      if (key && this.scope && this.persistent.has(text))
        await this.storage
          .put({
            key,
            scope: this.scope,
            profileId: profile.id,
            data,
            at: Date.now(),
          })
          .catch(() => {});
      return audio;
    })();
    this.pending.set(memoryKey, work);
    try {
      return await work;
    } finally {
      this.pending.delete(memoryKey);
    }
  }
  private remember(key: string, audio: AudioBuffer) {
    if (this.lifetime.signal.aborted) return;
    const old = this.cache.get(key);
    if (old) {
      this.bytes -= old.length * old.numberOfChannels * 4;
      this.cache.delete(key);
    }
    const size = audio.length * audio.numberOfChannels * 4;
    while (
      this.cache.size &&
      (this.bytes + size > 16_000_000 || this.cache.size >= 32)
    ) {
      const key = this.cache.keys().next().value!,
        old = this.cache.get(key)!;
      this.bytes -= old.length * old.numberOfChannels * 4;
      this.cache.delete(key);
    }
    if (size <= 16_000_000) {
      this.cache.set(key, audio);
      this.bytes += size;
    }
  }
  register(text: string) {
    this.persistent.add(text);
  }
  async preload(texts: string[]) {
    const unique = [...new Set(texts)].slice(0, 32);
    for (const text of unique) this.persistent.add(text);
    for (const text of unique) {
      if (this.lifetime.signal.aborted) return;
      try {
        if (isCommonNaturalAnnouncement(text)) await this.prepare(text);
      } catch {
        /* Later cached phrases can remain available while generation is offline. */
      }
    }
  }
  async play(text: string, signal: AbortSignal): Promise<void> {
    if (!this.running)
      throw new DOMException(
        "Audio requires a user gesture.",
        "NotAllowedError",
      );
    const audio = await this.prepare(text, signal);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (!this.running)
      throw new DOMException(
        "Audio requires a user gesture.",
        "NotAllowedError",
      );
    await new Promise<void>((resolve, reject) => {
      const source = this.context.createBufferSource();
      source.buffer = audio;
      source.connect(this.context.destination);
      let finished = false;
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        this.context.removeEventListener("statechange", stateChanged);
        signal.removeEventListener("abort", abort);
        source.onended = null;
        source.disconnect();
        if (this.source === source) {
          this.source = null;
          this.end = null;
        }
        if (error) reject(error);
        else resolve();
      };
      const stateChanged = () => {
        if (this.context.state !== "running") {
          source.onended = null;
          try {
            source.stop();
          } catch {}
          finish(new NaturalSpeechError("AUDIO_INTERRUPTED"));
        }
      };
      const abort = () => {
        try {
          source.stop();
        } catch {}
        finish();
      };
      this.stop();
      this.source = source;
      this.end = abort;
      source.onended = () => finish();
      this.context.addEventListener("statechange", stateChanged);
      signal.addEventListener("abort", abort, { once: true });
      try {
        source.start();
      } catch (error) {
        finish(error);
      }
    });
  }
  stop() {
    this.end?.();
    this.source = null;
  }
  suspend() {
    this.stop();
    void this.context.suspend().catch(() => {});
  }
  dispose() {
    this.lifetime.abort();
    this.engine.dispose();
    this.stop();
    this.cache.clear();
    this.pending.clear();
    this.persistent.clear();
    this.storage.close();
    this.bytes = 0;
    void this.context.close().catch(() => {});
  }
}
