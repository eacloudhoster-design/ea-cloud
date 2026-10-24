export type NaturalVoiceProfile = {
  id: string;
  model: string;
  voice: string;
  configured: boolean;
};
export type StoredClip = {
  key: string;
  scope: string;
  profileId: string;
  data: ArrayBuffer;
  at: number;
};
export interface NaturalAudioStore {
  profile(scope: string): Promise<NaturalVoiceProfile | null>;
  saveProfile(scope: string, profile: NaturalVoiceProfile): Promise<void>;
  get(scope: string, key: string): Promise<StoredClip | null>;
  put(clip: StoredClip): Promise<void>;
  close(): void;
}
const ttl = 14 * 86400000,
  limit = 32_000_000,
  maxClips = 96;
/** Only exact preloaded phrases persist; financial/dynamic reports remain in memory. */
export class IndexedNaturalAudioStore implements NaturalAudioStore {
  private database: Promise<IDBDatabase> | null = null;
  private closed = false;
  private open() {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined")
        return reject(Error("Persistent audio storage unavailable."));
      const request = indexedDB.open("ea-cloud-natural-audio", 2);
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(Error("Audio storage timed out."));
      }, 1200);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("clips"))
          db.createObjectStore("clips", { keyPath: "key" });
        if (!db.objectStoreNames.contains("profiles"))
          db.createObjectStore("profiles", { keyPath: "scope" });
        if (!db.objectStoreNames.contains("meta")) {
          const meta = db.createObjectStore("meta", { keyPath: "key" });
          const cursor = request.transaction!.objectStore("clips").openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            const value = row.value as StoredClip;
            if (value.data instanceof ArrayBuffer)
              meta.put({
                key: value.key,
                at: value.at,
                size: value.data.byteLength,
              });
            else row.delete();
            row.continue();
          };
        }
      };
      request.onerror = request.onblocked = () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(Error("Audio storage unavailable."));
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        if (settled || this.closed) {
          db.close();
          if (!settled) reject(Error("Audio storage closed."));
          return;
        }
        settled = true;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
    return this.database;
  }
  private async run<T>(
    name: "clips" | "profiles" | "meta",
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    if (this.closed) throw Error("Audio storage closed.");
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode),
        request = work(tx.objectStore(name));
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        reject(Error("Audio storage timed out."));
      }, 1200);
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(Error("Audio storage operation failed."));
      };
    });
  }
  async profile(scope: string) {
    const row = await this.run<any>("profiles", "readonly", (store) =>
      store.get(scope),
    );
    return row && Date.now() - row.at < 86400000 ? row.profile : null;
  }
  async saveProfile(scope: string, profile: NaturalVoiceProfile) {
    await this.run("profiles", "readwrite", (store) =>
      store.put({ scope, profile, at: Date.now() }),
    );
  }
  async get(scope: string, key: string) {
    const row = await this.run<StoredClip | undefined>(
      "clips",
      "readonly",
      (store) => store.get(key),
    );
    if (!row || row.scope !== scope) return null;
    if (Date.now() - row.at >= ttl) {
      await this.mutate(undefined, key);
      return null;
    }
    return row;
  }
  private async mutate(clip?: StoredClip, drop?: string) {
    if (this.closed) throw Error("Audio storage closed.");
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["clips", "meta"], "readwrite"),
        clips = tx.objectStore("clips"),
        meta = tx.objectStore("meta");
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        reject(Error("Audio storage timed out."));
      }, 1200);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(Error("Audio storage write failed."));
      };
      if (drop) {
        clips.delete(drop);
        meta.delete(drop);
      }
      if (clip) {
        const read = meta.getAll();
        read.onsuccess = () => {
          const rows = (
            read.result as { key: string; size: number; at: number }[]
          ).filter((row) => row.key !== clip.key);
          let bytes =
              rows.reduce(
                (sum, row) => sum + (Number.isFinite(row.size) ? row.size : 0),
                0,
              ) + clip.data.byteLength,
            count = rows.length + 1;
          for (const row of rows.sort((a, b) => a.at - b.at)) {
            if (
              Date.now() - row.at >= ttl ||
              bytes > limit ||
              count > maxClips
            ) {
              clips.delete(row.key);
              meta.delete(row.key);
              bytes -= row.size;
              count--;
            }
          }
          clips.put(clip);
          meta.put({ key: clip.key, at: clip.at, size: clip.data.byteLength });
        };
      }
    });
  }
  async put(clip: StoredClip) {
    if (!clip.data.byteLength || clip.data.byteLength > 4_100_000) return;
    await this.mutate(clip);
  }
  close() {
    this.closed = true;
    void this.database?.then((db) => db.close()).catch(() => {});
  }
}
export function announcementScope(token: string) {
  try {
    const [id, role] = atob(token).split(":");
    return role === "client" && /^[1-9]\d*$/.test(id) ? `client:${id}` : null;
  } catch {
    return null;
  }
}
