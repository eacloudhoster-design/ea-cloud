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
const profileValid = (value: any): value is NaturalVoiceProfile =>
  value &&
  /^[a-f0-9]{64}$/.test(value.id) &&
  typeof value.model === "string" &&
  typeof value.voice === "string" &&
  typeof value.configured === "boolean";
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
  private unavailableUntil = 0;
  private configuration: Promise<NaturalVoiceProfile> | null = null;
  private configurationRetryAt = 0;
  private configurationValue: NaturalVoiceProfile | null = null;
  private manifest: Promise<any> | null = null;
  private scope: string | null;
  constructor(
    private token: string,
    private storage: NaturalAudioStore = new IndexedNaturalAudioStore(),
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
    if (this.configuration) return this.configuration;
    if (Date.now() < this.configurationRetryAt)
      return Promise.reject(new NaturalSpeechError("VOICE_CONFIGURATION"));
    const work = (async () => {
      const previous = this.scope
        ? await this.storage.profile(this.scope).catch(() => null)
        : null;
      if (
        typeof navigator !== "undefined" &&
        navigator.onLine === false &&
        profileValid(previous)
      )
        return previous;
      try {
        const response = await fetch("/api/app/assistant/voice-config", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.any([
            this.lifetime.signal,
            AbortSignal.timeout(4000),
          ]),
        });
        if (response.status === 401 || response.status === 403)
          throw new NaturalSpeechError("VOICE_ACCESS_DENIED");
        if (!response.ok) throw new NaturalSpeechError("VOICE_CONFIGURATION");
        const profile = await response.json();
        if (!profileValid(profile))
          throw new NaturalSpeechError("VOICE_CONFIGURATION");
        if (this.scope)
          await this.storage.saveProfile(this.scope, profile).catch(() => {});
        return profile;
      } catch (error) {
        if (
          error instanceof NaturalSpeechError &&
          error.code === "VOICE_ACCESS_DENIED"
        )
          throw error;
        if (!this.lifetime.signal.aborted && profileValid(previous))
          return previous;
        const manifest = await this.assets();
        if (profileValid(manifest?.profile))
          return { ...manifest.profile, configured: false };
        throw error;
      }
    })();
    this.configuration = work
      .then((profile) => {
        this.configurationValue = profile;
        return profile;
      })
      .catch((error) => {
        this.configuration = null;
        this.configurationRetryAt = Date.now() + 10000;
        throw error;
      });
    return this.configuration;
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
    if (!isCommonNaturalAnnouncement(text) || !key) return null;
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
    this.configurationRetryAt = 0;
    if (!this.configurationValue?.configured) this.configuration = null;
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
    profile: NaturalVoiceProfile,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    const timeout = AbortSignal.timeout(32000),
      combined = AbortSignal.any([
        this.lifetime.signal,
        timeout,
        ...(signal ? [signal] : []),
      ]);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (combined.aborted) throw new DOMException("Cancelled", "AbortError");
      try {
        const response = await fetch("/api/app/assistant/speech", {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, profileId: profile.id }),
          signal: combined,
        });
        if (!response.ok) {
          if (response.status === 409) {
            this.configurationValue = null;
            this.configuration = null;
          }
          const body = await response.json().catch(() => ({}));
          const seconds = Number(response.headers.get("Retry-After"));
          const retryAfter =
            Number.isFinite(seconds) && seconds > 0
              ? seconds * 1000
              : response.status === 429
                ? 60000
                : 0;
          throw new NaturalSpeechError(
            typeof body.code === "string"
              ? body.code
              : `VOICE_HTTP_${response.status}`,
            [429, 502, 503, 504].includes(response.status) &&
              body.code !== "VOICE_CONFIGURATION",
            retryAfter,
          );
        }
        if (response.headers.get("X-EA-Voice-Identity") !== profile.id)
          throw new NaturalSpeechError("VOICE_IDENTITY_MISMATCH");
        if (!response.headers.get("content-type")?.includes("audio/wav"))
          throw new NaturalSpeechError("VOICE_AUDIO");
        const data = await response.arrayBuffer();
        const bytes = new Uint8Array(data);
        if (
          data.byteLength < 44 ||
          data.byteLength > 4_100_000 ||
          String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
          String.fromCharCode(...bytes.subarray(8, 12)) !== "WAVE"
        )
          throw new NaturalSpeechError("VOICE_AUDIO");
        return data;
      } catch (error) {
        if (combined.aborted) throw error;
        const failure =
          error instanceof NaturalSpeechError
            ? error
            : new NaturalSpeechError("VOICE_NETWORK", true);
        if (attempt || !failure.retryable || failure.retryAfter > 1500) {
          this.unavailableUntil =
            Date.now() + Math.max(30000, failure.retryAfter);
          throw failure;
        }
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Cancelled", "AbortError"));
          };
          const timer = setTimeout(
            () => {
              combined.removeEventListener("abort", abort);
              resolve();
            },
            Math.max(250, failure.retryAfter),
          );
          combined.addEventListener("abort", abort, { once: true });
        });
      }
    }
    throw new NaturalSpeechError("VOICE_UNAVAILABLE");
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
      if (!profile.configured || Date.now() < this.unavailableUntil)
        throw new NaturalSpeechError("VOICE_UNAVAILABLE");
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
    const unique = [...new Set(texts)].slice(0, 12);
    for (const text of unique) this.persistent.add(text);
    for (const text of unique) {
      if (this.lifetime.signal.aborted) return;
      try {
        await this.prepare(text);
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
    this.stop();
    this.cache.clear();
    this.pending.clear();
    this.persistent.clear();
    this.storage.close();
    this.bytes = 0;
    void this.context.close().catch(() => {});
  }
}
