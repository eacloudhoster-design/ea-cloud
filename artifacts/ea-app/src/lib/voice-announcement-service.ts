import { AnnouncementAudio } from "./announcement-audio";
import { cleanText, speechChunks } from "./assistant-text";
export const AnnouncementPriority = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
type Job = {
  text: string;
  key: string;
  group?: string;
  priority: number;
  at: number;
};
/** Sole announcement queue; uses bundled or on-device Kokoro, never system speech. */
export class VoiceAnnouncementService {
  private audio: AnnouncementAudio | null = null;
  private queue: Job[] = [];
  private seen = new Set<string>();
  private current: Job | null = null;
  private request: AbortController | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private suspended = false;
  private disposed = false;
  private blocked = false;
  private generation = 0;
  constructor(token?: string, audio?: AnnouncementAudio) {
    if (audio) this.audio = audio;
    else if (token)
      try {
        this.audio = new AnnouncementAudio(token);
      } catch {
        /* Unsupported playback stays silent. */
      }
  }
  preload(texts: string[]) {
    void this.audio?.preload(
      texts.map((t) => cleanText(t, 700)).filter(Boolean),
    );
  }
  private fresh(job: Job) {
    return (
      Date.now() - job.at <
      (job.key === "welcome"
        ? 120000
        : job.priority === 3 || job.group === "scan"
          ? 60000
          : 20000)
    );
  }
  announce(
    text: string,
    key: string,
    priority = 1,
    group?: string,
    append = false,
  ) {
    if (this.disposed || this.suspended || !this.audio) return;
    text = cleanText(text, 800);
    if (group === "bot" || group === "symbol" || group === "mt5")
      this.audio.register(text);
    if (!text || this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 200)
      this.seen.delete(this.seen.values().next().value!);
    this.queue = this.queue.filter(
      (job) => (append || !group || job.group !== group) && this.fresh(job),
    );
    if (
      this.current &&
      (priority > this.current.priority ||
        (!append && group && group === this.current.group))
    )
      this.cancelCurrent();
    this.queue.push({ text, key, priority, group, at: Date.now() });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.queue = this.queue.slice(0, 8);
    this.drain();
  }
  discard(group: string) {
    this.queue = this.queue.filter((job) => job.group !== group);
    if (this.current?.group === group) {
      this.cancelCurrent();
      this.drain();
    }
  }
  /** Resume only in existing permitted gestures; never use another speech engine. */
  unlock() {
    if (this.disposed || this.suspended || !this.audio) return;
    void this.audio
      .unlock()
      .then(() => {
        if (!this.disposed && !this.suspended) {
          this.blocked = false;
          this.drain();
        }
      })
      .catch(() => {
        this.blocked = true;
      });
  }
  private cancelCurrent() {
    this.generation++;
    this.request?.abort();
    this.request = null;
    clearTimeout(this.timer);
    this.audio?.stop();
    this.current = null;
  }
  suspend() {
    this.suspended = true;
    this.queue = this.queue.filter(
      (job) => job.key === "welcome" && this.fresh(job),
    );
    if (
      this.current?.key === "welcome" &&
      !this.audio?.playing &&
      this.fresh(this.current)
    )
      this.queue.unshift(this.current);
    this.cancelCurrent();
    this.audio?.suspend();
  }
  foreground() {
    this.audio?.recover();
    this.suspended = false;
    this.blocked = false;
    this.drain();
  }
  dispose() {
    this.disposed = true;
    this.suspend();
    this.queue = [];
    this.seen.clear();
    this.audio?.dispose();
  }
  private drain() {
    if (
      this.current ||
      this.disposed ||
      this.suspended ||
      this.blocked ||
      !this.audio
    )
      return;
    this.queue = this.queue.filter((job) => this.fresh(job));
    const job = this.queue.shift();
    if (!job) return;
    const generation = ++this.generation,
      controller = (this.request = new AbortController());
    this.current = job;
    this.timer = setTimeout(
      () => controller.abort(),
      job.key === "welcome"
        ? 60000
        : job.priority === 3 || job.group === "scan"
          ? 60000
          : 20000,
    );
    void (async () => {
      if (!this.audio!.running)
        throw new DOMException(
          "Audio requires a user gesture.",
          "NotAllowedError",
        );
      for (const chunk of speechChunks(job.text)) {
        await this.audio!.prepare(chunk, controller.signal);
        if (
          controller.signal.aborted ||
          generation !== this.generation ||
          !this.fresh(job)
        )
          return;
        await this.audio!.play(chunk, controller.signal);
      }
    })()
      .catch((error) => {
        if (generation !== this.generation || this.disposed) return;
        if (
          !controller.signal.aborted &&
          error?.name === "NotAllowedError" &&
          this.fresh(job)
        ) {
          this.blocked = true;
          this.queue.unshift(job);
        }
        // Provider/quota/encoding failures stay silent. The transport applies bounded
        // retries/cooldown and continues serving exact cached natural recordings.
      })
      .finally(() => {
        if (generation !== this.generation || this.disposed) return;
        clearTimeout(this.timer);
        this.request = null;
        this.current = null;
        this.drain();
      });
  }
}
