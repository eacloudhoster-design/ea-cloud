import { cleanText } from "./assistant-text";
/** Prefer installed enhanced/natural English voices; never wait for a cloud provider. */
export function selectAnnouncementVoice(voices: SpeechSynthesisVoice[]) {
  const score = (voice: SpeechSynthesisVoice) =>
    (/Premium|Enhanced|Natural|Neural/i.test(voice.name) ? 100 : 0) +
    (/Samantha|Karen|Moira|Tessa|Victoria|Serena|Zira|Aria|Jenny|Sonia|Ava|Emma/i.test(voice.name) ? 20 : 0) +
    (voice.localService ? 10 : 0) + (voice.default ? 1 : 0);
  return voices.filter(v => /^en(?:-|_|$)/i.test(v.lang))
    .sort((a,b) => score(b) - score(a))[0] || null;
}
export const AnnouncementPriority = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
type Job = { text: string; key: string; group?: string; priority: number; at: number };
/** One native player per signed-in app session. No cloud speech or microphone. */
export class VoiceAnnouncementService {
  private queue: Job[] = [];
  private seen = new Map<string, number>();
  private voice: SpeechSynthesisVoice | null = null;
  private current: Job | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private suspended = false;
  private blocked = false;
  private generation = 0;
  private synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  private selectVoice = () => {
    const voices = this.synth?.getVoices() || [];
    this.voice = selectAnnouncementVoice(voices);
  };
  constructor() {
    this.selectVoice();
    this.synth?.addEventListener("voiceschanged", this.selectVoice);
  }
  announce(text: string, key: string, priority = 1, group?: string) {
    if (this.disposed || this.suspended || !this.synth) return;
    text = cleanText(text, 800);
    if (!text) return;
    const now = Date.now();
    if (this.seen.has(key)) return;
    this.seen.set(key, now);
    if (this.seen.size > 200) this.seen.delete(this.seen.keys().next().value!);
    this.queue = this.queue.filter(j => (!group || j.group !== group) && (j.key === "welcome" || now - j.at < 20000));
    if (this.current && (priority > this.current.priority || (group && group === this.current.group))) this.cancelCurrent();
    this.queue.push({ text, key, group, priority, at: now });
    this.queue.sort((a,b) => b.priority - a.priority);
    this.queue = this.queue.slice(0,8);
    this.drain();
  }
  discard(group: string) {
    this.queue = this.queue.filter(job => job.group !== group);
    if (this.current?.group === group) { this.cancelCurrent(); this.drain(); }
  }
  /** Called from existing gestures, never from a dedicated activation control. */
  unlock() {
    if (this.disposed || this.suspended) return;
    this.blocked = false;
    // Some WebKit versions leave a blocked utterance pending without an error.
    if (this.current && !this.synth?.speaking) {
      const job = this.current;
      this.cancelCurrent();
      this.queue.unshift(job);
    }
    this.synth?.resume();
    this.drain();
  }
  private cancelCurrent() {
    this.generation++;
    clearTimeout(this.timer);
    if (this.utterance) this.utterance.onend = this.utterance.onerror = null;
    this.current = null;
    this.utterance = null;
    this.synth?.cancel();
  }
  suspend() {
    this.suspended = true;
    // Keep an unheard autoplay-blocked welcome for the earliest permitted gesture.
    // All stale trading/mode work is still discarded when the app is hidden.
    this.queue = this.queue.filter(job => job.key === "welcome");
    if (this.current?.key === "welcome" && !this.synth?.speaking) this.queue.unshift(this.current);
    this.cancelCurrent();
  }
  foreground() { this.suspended = false; }
  dispose() {
    this.disposed = true;
    this.suspend();
    this.queue = [];
    this.seen.clear();
    this.synth?.removeEventListener("voiceschanged", this.selectVoice);
  }
  private drain() {
    if (this.current || this.disposed || this.suspended || this.blocked || !this.synth || typeof SpeechSynthesisUtterance === "undefined") return;
    const now = Date.now();
    this.queue = this.queue.filter(j => j.key === "welcome" || now - j.at < (j.priority === 3 ? 60000 : 20000));
    const job = this.queue.shift();
    if (!job) return;
    const generation = ++this.generation;
    this.current = job;
    const utterance = this.utterance = new SpeechSynthesisUtterance(job.text);
    utterance.voice = this.voice;
    utterance.lang = this.voice?.lang || "en-US";
    utterance.rate = 1.04;
    utterance.pitch = 1;
    utterance.volume = 1;
    const finish = (blocked = false) => {
      if (generation !== this.generation || this.disposed) return;
      clearTimeout(this.timer);
      utterance.onend = utterance.onerror = null;
      this.current = null;
      this.utterance = null;
      this.blocked = blocked;
      if (blocked) this.queue.unshift(job);
      else this.drain();
    };
    utterance.onend = () => finish();
    utterance.onerror = event => finish(event.error === "not-allowed");
    let started = false;
    utterance.onstart = () => { started = true; };
    // Bound a silent WebKit stall. A subsequent real gesture may retry welcome.
    this.timer = setTimeout(() => { this.cancelCurrent(); if (!started) { this.blocked = true; this.queue.unshift(job); } else this.drain(); }, Math.max(20000, Math.min(60000, job.text.length * 80)));
    try { this.synth.speak(utterance); } catch { finish(true); }
  }
}
