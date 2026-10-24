/** Session-scoped, bounded decoded audio cache. Never persists account speech. */
export class AnnouncementAudio {
  private context: AudioContext;
  private cache = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private streams = new Map<string, Promise<void>>();
  private lifetime = new AbortController();
  private source: AudioBufferSourceNode | null = null;
  private end: (() => void) | null = null;
  private bytes = 0;
  private unavailableUntil = 0;
  constructor(private token: string) {
    const Constructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Constructor) throw new Error("Neural audio playback is unsupported.");
    this.context = new Constructor();
  }
  get playing() {
    return this.source !== null;
  }
  get running() {
    return this.context.state === "running";
  }
  /** Must be called synchronously inside an existing user gesture. */
  async unlock() {
    await this.context.resume();
  }
  async prepare(text: string, signal?: AbortSignal): Promise<AudioBuffer> {
    const cached = this.cache.get(text);
    if (cached) {
      this.cache.delete(text);
      this.cache.set(text, cached);
      return cached;
    }
    const streaming = this.streams.get(text);
    if (streaming) {
      await streaming;
      const completed = this.cache.get(text);
      if (completed) return completed;
      throw new Error("Speech stream did not complete.");
    }
    const pending = this.pending.get(text);
    if (pending) return pending;
    if (this.lifetime.signal.aborted || Date.now() < this.unavailableUntil)
      throw new Error("Neural voice is temporarily unavailable.");
    const work = (async () => {
      const response = await fetch("/api/app/assistant/speech", {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.any([
          this.lifetime.signal,
          AbortSignal.timeout(12000),
          ...(signal ? [signal] : []),
        ]),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("audio/wav")
      )
        throw new Error("Neural speech unavailable.");
      const data = await response.arrayBuffer();
      if (!data.byteLength || data.byteLength > 4_100_000)
        throw new Error("Invalid speech audio.");
      const audio = await this.context.decodeAudioData(data);
      if (this.lifetime.signal.aborted)
        throw new DOMException("Cancelled", "AbortError");
      this.remember(text, audio);
      return audio;
    })();
    this.pending.set(text, work);
    try {
      return await work;
    } catch (error) {
      if (!this.lifetime.signal.aborted && !signal?.aborted)
        this.unavailableUntil = Date.now() + 30000;
      throw error;
    } finally {
      this.pending.delete(text);
    }
  }
  async preload(texts: string[]) {
    for (const text of [...new Set(texts)].slice(0, 10)) {
      if (this.lifetime.signal.aborted) return;
      try {
        await this.prepare(text);
      } catch {
        return;
      }
    }
  }
  private async stream(text: string, signal: AbortSignal): Promise<void> {
    if (!this.running)
      throw new DOMException(
        "Audio requires a user gesture.",
        "NotAllowedError",
      );
    if (Date.now() < this.unavailableUntil)
      throw new Error("Neural voice is temporarily unavailable.");
    const response = await fetch("/api/app/assistant/speech", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, stream: true }),
      signal: AbortSignal.any([
        signal,
        this.lifetime.signal,
        AbortSignal.timeout(12000),
      ]),
    });
    if (!response.ok) {
      this.unavailableUntil = Date.now() + 30000;
      throw new Error("Neural speech unavailable.");
    }
    if (response.headers.get("content-type")?.includes("audio/wav")) {
      const data = await response.arrayBuffer();
      if (!data.byteLength || data.byteLength > 4_100_000)
        throw new Error("Invalid speech audio.");
      const audio = await this.context.decodeAudioData(data);
      this.remember(text, audio);
      return this.play(text, signal);
    }
    if (
      !response.body ||
      !/audio\/L16.*rate=24000/i.test(
        response.headers.get("content-type") || "",
      )
    )
      throw new Error("Invalid speech stream.");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    const sources = new Set<AudioBufferSourceNode>();
    let odd = new Uint8Array(0),
      bytes = 0,
      started = false,
      next = this.context.currentTime,
      ended = false;
    let finish!: () => void;
    const complete = new Promise<void>((resolve) => (finish = resolve));
    const stop = () => {
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      sources.clear();
      this.source = null;
      finish();
    };
    this.stop();
    this.end = stop;
    signal.addEventListener("abort", stop, { once: true });
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        bytes += value.length;
        if (bytes > 4_000_000) throw new Error("Speech stream is too large.");
        chunks.push(value);
        const joined = new Uint8Array(odd.length + value.length);
        joined.set(odd);
        joined.set(value, odd.length);
        const size = joined.length - (joined.length % 2);
        odd = joined.slice(size);
        if (!size) continue;
        const audio = this.context.createBuffer(1, size / 2, 24000),
          samples = audio.getChannelData(0),
          view = new DataView(joined.buffer);
        for (let i = 0; i < samples.length; i++)
          samples[i] = view.getInt16(i * 2, true) / 32768;
        const source = this.context.createBufferSource();
        source.buffer = audio;
        source.connect(this.context.destination);
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          if (this.source === source) this.source = null;
          source.disconnect();
          if (ended && !sources.size) finish();
        };
        next = Math.max(next, this.context.currentTime + 0.02);
        source.start(next);
        next += audio.duration;
        started = true;
        this.source = source;
      }
      if (!bytes || odd.length) throw new Error("Incomplete speech audio.");
      const all = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      const audio = this.context.createBuffer(1, bytes / 2, 24000),
        samples = audio.getChannelData(0),
        view = new DataView(all.buffer);
      for (let i = 0; i < samples.length; i++)
        samples[i] = view.getInt16(i * 2, true) / 32768;
      if (!signal.aborted) this.remember(text, audio);
      ended = true;
      if (!sources.size) finish();
      await complete;
    } catch (error) {
      stop();
      if (started && !signal.aborted)
        throw new DOMException(
          "Speech stream interrupted.",
          "PartialSpeechError",
        );
      throw error;
    } finally {
      await reader.cancel().catch(() => {});
      signal.removeEventListener("abort", stop);
      if (this.end === stop) this.end = null;
    }
  }
  private remember(text: string, audio: AudioBuffer) {
    if (this.lifetime.signal.aborted) return;
    const previous = this.cache.get(text);
    if (previous) {
      this.bytes -= previous.length * previous.numberOfChannels * 4;
      this.cache.delete(text);
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
      this.cache.set(text, audio);
      this.bytes += size;
    }
  }
  async play(text: string, signal: AbortSignal): Promise<void> {
    if (!this.cache.has(text) && !this.pending.has(text)) {
      try {
        const work = this.stream(text, signal);
        this.streams.set(text, work);
        try {
          return await work;
        } finally {
          this.streams.delete(text);
        }
      } catch (error) {
        if (
          !signal.aborted &&
          error instanceof Error &&
          !["NotAllowedError", "PartialSpeechError"].includes(error.name)
        )
          this.unavailableUntil = Date.now() + 30000;
        throw error;
      }
    }
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
      const finish = () => {
        signal.removeEventListener("abort", abort);
        source.onended = null;
        source.disconnect();
        if (this.source === source) {
          this.source = null;
          this.end = null;
        }
        resolve();
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
      source.onended = finish;
      signal.addEventListener("abort", abort, { once: true });
      try {
        source.start();
      } catch (error) {
        finish();
        reject(error);
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
    this.streams.clear();
    this.bytes = 0;
    void this.context.close().catch(() => {});
  }
}
