import { speechChunks } from "./assistant-text";
export interface VoicePreferences {
  enabled: boolean;
  volume: number;
  speed: number;
  automatic: boolean;
  trades: boolean;
  narration: boolean;
  accountSpeech: boolean;
  provider: "neural" | "device";
  fallback: boolean;
  deviceVoice: string;
}
export const defaultVoicePreferences: VoicePreferences = {
  enabled: false,
  volume: 0.8,
  speed: 1,
  automatic: true,
  trades: true,
  narration: true,
  accountSpeech: false,
  provider: "neural",
  fallback: false,
  deviceVoice: "",
};
export function normalizeVoicePreferences(raw: any): VoicePreferences {
  const base = { ...defaultVoicePreferences };
  for (const key of [
    "enabled",
    "automatic",
    "trades",
    "narration",
    "accountSpeech",
    "fallback",
  ] as const)
    if (typeof raw?.[key] === "boolean") base[key] = raw[key];
  if (Number.isFinite(raw?.volume))
    base.volume = Math.min(1, Math.max(0, raw.volume));
  if (Number.isFinite(raw?.speed))
    base.speed = Math.min(1.3, Math.max(0.8, raw.speed));
  if (raw?.provider === "device") base.provider = "device";
  if (typeof raw?.deviceVoice === "string")
    base.deviceVoice = raw.deviceVoice.slice(0, 200);
  return base;
}
export type SpeechCategory = "automatic" | "trading" | "chart" | "manual";
type Job = {
  text: string;
  key: string;
  priority: number;
  category: SpeechCategory;
};
export class VoiceQueue {
  prefs = defaultVoicePreferences;
  private jobs: Job[] = [];
  private current: Job | null = null;
  private busy = false;
  private version = 0;
  private interacted = false;
  private suspended = false;
  private listening = false;
  private controller: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private cancelAudio: (() => void) | null = null;
  private resume: (() => void) | null = null;
  private cache = new Map<string, { url: string; size: number; at: number }>();
  private cacheBytes = 0;
  private seen = new Map<string, number>();
  constructor(
    private token: string,
    private notify: (state: {
      speaking?: boolean;
      blocked?: boolean;
      error?: string;
      text?: string;
    }) => void,
  ) {}
  private allowed(category: SpeechCategory) {
    const p = this.prefs;
    return (
      !this.suspended &&
      p.enabled &&
      p.volume > 0 &&
      (category === "manual" ||
        (p.automatic &&
          (category !== "trading" || p.trades) &&
          (category !== "chart" || p.narration)))
    );
  }
  configure(prefs: VoicePreferences) {
    this.prefs = prefs;
    this.jobs = this.jobs.filter((job) => this.allowed(job.category));
    if (!prefs.enabled || prefs.volume === 0) this.stop();
    else if (this.current && !this.allowed(this.current.category))
      this.stop(false);
    if (this.audio) {
      this.audio.volume = prefs.volume;
      this.audio.playbackRate = prefs.speed;
    }
  }
  microphone(active: boolean) {
    if (active) this.stop();
    this.listening = active;
    if (!active) void this.drain();
  }
  suspend() {
    this.suspended = true;
    this.interacted = false;
    this.stop();
  }
  foreground() {
    this.suspended = false;
  }
  unlock() {
    if (this.suspended) return;
    this.interacted = true;
    if (this.resume) this.resume();
    else void this.drain();
  }
  enqueue(
    text: string,
    key: string,
    priority = 20,
    category: SpeechCategory = "automatic",
  ) {
    if (!this.allowed(category) || !text.trim()) return;
    const now = Date.now();
    if (category !== "manual" && now - (this.seen.get(key) || 0) < 30000)
      return;
    this.seen.set(key, now);
    if (this.seen.size > 100) this.seen.delete(this.seen.keys().next().value!);
    if (this.current && priority > this.current.priority) {
      this.stop(false);
    }
    this.jobs = this.jobs.filter((j) => j.key !== key);
    this.jobs.push({ text: text.slice(0, 5000), key, priority, category });
    this.jobs.sort((a, b) => b.priority - a.priority);
    this.jobs = this.jobs.slice(0, 8);
    void this.drain();
  }
  stop(clear = true) {
    this.version++;
    if (clear) this.jobs = [];
    this.controller?.abort();
    this.controller = null;
    this.cancelAudio?.();
    this.cancelAudio = null;
    this.resume = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.notify({ speaking: false, blocked: false });
  }
  dispose() {
    this.prefs = { ...this.prefs, enabled: false };
    this.interacted = false;
    this.stop();
    for (const item of this.cache.values()) URL.revokeObjectURL(item.url);
    this.cache.clear();
    this.cacheBytes = 0;
    this.seen.clear();
  }
  private async audioUrl(text: string, signal: AbortSignal) {
    const old = this.cache.get(text);
    if (old && Date.now() - old.at < 300000) {
      this.cache.delete(text);
      this.cache.set(text, old);
      return old.url;
    }
    if (old) {
      URL.revokeObjectURL(old.url);
      this.cacheBytes -= old.size;
      this.cache.delete(text);
    }
    const response = await fetch("/api/app/assistant/speech", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Neural speech unavailable.");
    }
    if (!response.headers.get("content-type")?.includes("audio/wav"))
      throw new Error("Invalid speech response.");
    const blob = await response.blob();
    if (!blob.size || blob.size > 4_100_000)
      throw new Error("Invalid audio size.");
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    while (
      this.cache.size &&
      (this.cacheBytes + blob.size > 8_500_000 || this.cache.size >= 12)
    ) {
      const key = this.cache.keys().next().value!;
      const item = this.cache.get(key)!;
      URL.revokeObjectURL(item.url);
      this.cacheBytes -= item.size;
      this.cache.delete(key);
    }
    const url = URL.createObjectURL(blob);
    this.cache.set(text, { url, size: blob.size, at: Date.now() });
    this.cacheBytes += blob.size;
    return url;
  }
  private device(text: string) {
    return new Promise<void>((resolve, reject) => {
      if (
        typeof speechSynthesis === "undefined" ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        reject(new Error("Device speech is unavailable in this browser."));
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      utterance.voice =
        voices.find((v) => v.voiceURI === this.prefs.deviceVoice) ||
        voices.find((v) =>
          /Samantha|Karen|Moira|Tessa|Victoria|Serena|Zira|Aria|Jenny|Female/i.test(
            v.name,
          ),
        ) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        null;
      utterance.lang = "en-US";
      utterance.rate = this.prefs.speed;
      utterance.volume = this.prefs.volume;
      let done = false;
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.cancelAudio = null;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => {
        speechSynthesis.cancel();
        finish(new Error("Device speech timed out."));
      }, 90000);
      utterance.onend = () => finish();
      utterance.onerror = () =>
        finish(new Error("Device speech was interrupted."));
      this.cancelAudio = () => {
        speechSynthesis.cancel();
        finish();
      };
      speechSynthesis.speak(utterance);
    });
  }
  private play(url: string, onStarted?: () => void) {
    return new Promise<void>((resolve, reject) => {
      const audio = this.audio || (this.audio = new Audio());
      audio.volume = this.prefs.volume;
      audio.playbackRate = this.prefs.speed;
      audio.src = url;
      let done = false;
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        this.cancelAudio = null;
        this.resume = null;
        this.notify({ blocked: false });
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error("Audio playback timed out. Tap replay to try again."),
          ),
        120000,
      );
      audio.onpause = () => {
        if (!audio.ended)
          finish(
            new Error("Audio was paused by your device. Replay when ready."),
          );
      };
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("Audio playback failed."));
      this.cancelAudio = () => {
        audio.pause();
        finish();
      };
      let started = false;
      const start = () => {
        this.notify({ blocked: false });
        void audio
          .play()
          .then(() => {
            if (!started && !done) {
              started = true;
              this.notify({ speaking: true, error: "" });
              onStarted?.();
            }
          })
          .catch((error) => {
            if (done) return;
            if (error?.name === "NotAllowedError") {
              this.resume = start;
              this.notify({
                blocked: true,
                speaking: false,
                error: "Tap Play queued voice to allow audio on this device.",
              });
            } else finish(new Error("Audio playback was interrupted."));
          });
      };
      this.resume = start;
      start();
    });
  }
  private async drain() {
    if (this.busy || this.listening || !this.interacted || !this.prefs.enabled)
      return;
    this.busy = true;
    try {
      while (
        this.jobs.length &&
        !this.listening &&
        this.prefs.enabled &&
        this.interacted
      ) {
        const job = this.jobs.shift()!;
        this.current = job;
        const version = this.version;
        const controller = new AbortController();
        this.controller = controller;
        this.notify({ speaking: true, error: "", text: job.text });
        try {
          const chunks = speechChunks(job.text);
          let upcoming: Promise<{ url?: string; error?: unknown }> | null =
            null;
          let deviceFallback = false;
          for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];
            if (version !== this.version || !this.prefs.enabled) break;
            if (this.prefs.provider === "device" || deviceFallback)
              await this.device(chunk);
            else
              try {
                const result: { url?: string; error?: unknown } = upcoming
                  ? await upcoming
                  : { url: await this.audioUrl(chunk, controller.signal) };
                upcoming = null;
                if (result.error) throw result.error;
                if (version === this.version)
                  await this.play(result.url!, () => {
                    if (index + 1 < chunks.length && version === this.version)
                      upcoming = this.audioUrl(
                        chunks[index + 1],
                        controller.signal,
                      ).then(
                        (url) => ({ url }),
                        (error) => ({ error }),
                      );
                  });
              } catch (error) {
                if (controller.signal.aborted) break;
                if (!this.prefs.fallback) throw error;
                deviceFallback = true;
                this.notify({
                  error:
                    "Neural voice is unavailable; using device voice fallback.",
                });
                await this.device(chunk);
              }
          }
        } catch (error) {
          if (!controller.signal.aborted)
            this.notify({ error: (error as Error).message });
        } finally {
          if (this.controller === controller) this.controller = null;
          this.current = null;
          this.notify({ speaking: false });
        }
      }
    } finally {
      this.busy = false;
      if (this.jobs.length && this.prefs.enabled && this.interacted)
        void this.drain();
    }
  }
}
