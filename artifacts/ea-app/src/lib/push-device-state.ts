let desiredScope: string | null | undefined;
export const desiredPushScope = () => desiredScope;
export function pushAccountScope(token: string | null) {
  try {
    if (!token) return null;
    const [id, role] = atob(token).split(":");
    return role === "client" && /^[1-9]\d*$/.test(id) ? `client:${id}` : null;
  } catch {
    return null;
  }
}
export async function setPushAccountScope(scope: string | null) {
  desiredScope = scope;
  if (!("indexedDB" in window)) throw Error("Push device storage unavailable");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("ea-cloud-push-device", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = reject;
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(scope, "account");
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(Error("Push device storage unavailable"));
    });
  } finally {
    db.close();
  }
}
