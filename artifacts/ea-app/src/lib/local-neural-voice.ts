/** Lazy worker: large model download only when uncached speech is needed. */
export class LocalNeuralVoice {
  private worker: Worker | null = null;
  private sequence = 0;
  private unavailableUntil = 0;
  private jobs = new Map<
    number,
    {
      resolve: (v: ArrayBuffer) => void;
      reject: (e: Error) => void;
      cleanup: () => void;
    }
  >();
  generate(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
    if (signal.aborted)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    if (Date.now() < this.unavailableUntil)
      return Promise.reject(Error("Local neural speech is cooling down"));
    if (!this.worker) {
      this.worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event) => {
        const job = this.jobs.get(event.data.id);
        if (!job) return;
        this.jobs.delete(event.data.id);
        job.cleanup();
        if (event.data.wav instanceof ArrayBuffer) job.resolve(event.data.wav);
        else {
          this.unavailableUntil = Date.now() + 60000;
          job.reject(Error("Local neural speech unavailable"));
          this.dispose();
        }
      };
      this.worker.onerror = () => {
        this.unavailableUntil = Date.now() + 60000;
        this.dispose();
      };
    }
    const worker = this.worker,
      id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const cancel = () => {
        if (this.jobs.delete(id)) {
          cleanup();
          reject(new DOMException("Cancelled", "AbortError"));
          if (!this.jobs.size) {
            this.worker?.terminate();
            this.worker = null;
          }
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        this.jobs.delete(id);
        reject(Error("Local neural speech timed out"));
        this.unavailableUntil = Date.now() + 60000;
        this.dispose();
      }, 60000);
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      };
      this.jobs.set(id, { resolve, reject, cleanup });
      signal.addEventListener("abort", cancel, { once: true });
      worker.postMessage({ id, text });
    });
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.jobs.values()) {
      job.cleanup();
      job.reject(Error("Local neural speech stopped"));
    }
    this.jobs.clear();
  }
}
