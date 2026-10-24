import {
  pushAccountScope,
  setPushAccountScope,
  desiredPushScope,
} from "./push-device-state";
let registration: Promise<ServiceWorkerRegistration> | null = null;
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
export async function pushRequest(
  path: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetch("/api/app/push/" + path, {
    ...init,
    cache: "no-store",
    headers: { ...headers(token), ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`Push request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
export function prepareWebPush() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !window.isSecureContext
  )
    return null;
  if (!registration)
    registration = (async () => {
      const r = await navigator.serviceWorker.register("/ea-app/push-sw.js", {
        scope: "/ea-app/",
        updateViaCache: "none",
      });
      const worker = r.installing || r.waiting || r.active;
      const active = () => worker?.state === "activated";
      if (!active())
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            reject(Error("Push worker activation timed out"));
          }, 10000);
          const changed = () => {
            if (active() || worker?.state === "activated") {
              cleanup();
              resolve();
            } else if (worker?.state === "redundant") {
              cleanup();
              reject(Error("Push worker installation failed"));
            }
          };
          const cleanup = () => {
            clearTimeout(timer);
            worker?.removeEventListener("statechange", changed);
          };
          worker?.addEventListener("statechange", changed);
          changed();
        });
      return r;
    })().catch((error) => {
      registration = null;
      throw error;
    });
  return registration;
}
/** Idempotent enable/repair. Repeated bell taps must never disable an existing subscription. */
const pending = new Map<string, Promise<boolean>>(),
  lastRepair = new Map<string, number>();
export function enableWebPush(
  token: string,
  requestPermission = true,
): Promise<boolean> {
  const scope = pushAccountScope(token);
  if (!scope) return Promise.resolve(false);
  if (desiredPushScope() !== undefined && desiredPushScope() !== scope)
    return Promise.resolve(false);
  if (!requestPermission && Date.now() - (lastRepair.get(scope) || 0) < 60000)
    return Promise.resolve(true);
  const existing = pending.get(scope);
  if (existing) return existing;
  const job = enableWebPushImpl(token, requestPermission)
    .then((ok) => {
      if (ok) lastRepair.set(scope, Date.now());
      return ok;
    })
    .finally(() => pending.delete(scope));
  pending.set(scope, job);
  return job;
}
async function enableWebPushImpl(token: string, requestPermission = true) {
  if (!("Notification" in window)) return false;
  const permission =
    Notification.permission === "default" && requestPermission
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
  try {
    if ((await permission) !== "granted") return false;
    const scope = pushAccountScope(token);
    if (
      !scope ||
      (desiredPushScope() !== undefined && desiredPushScope() !== scope)
    )
      return false;
    await setPushAccountScope(scope);
    const ready = await prepareWebPush();
    if (!ready) return false;
    const config = await pushRequest("config", token);
    if (!config.enabled || typeof config.publicKey !== "string") return false;
    if (desiredPushScope() !== scope) return false;
    let subscription = await ready.pushManager.getSubscription();
    if (subscription) {
      // Repair a lost database row; rotate on VAPID/account changes without transferring ownership.
      const key = subscription.options.applicationServerKey;
      const expected = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const matches =
        key &&
        new Uint8Array(key).length === expected.length &&
        new Uint8Array(key).every((v, i) => v === expected[i]);
      const status = await pushRequest(
        "status?endpoint=" + encodeURIComponent(subscription.endpoint),
        token,
      );
      if (!matches || status.endpointConflict) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    if (!subscription) {
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    }
    if (desiredPushScope() !== scope) return false;
    try {
      await pushRequest("subscriptions", token, {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      });
    } catch (error) {
      // A cross-account endpoint is rotated, never reassigned. Keep a valid local subscription
      // on temporary storage failure so a later bell tap/reopen can repair it.
      if (error instanceof Error && error.message.endsWith("409")) {
        await subscription.unsubscribe();
        return false;
      }
      throw error;
    }
    return true;
  } catch {
    return false;
  }
}
export const toggleWebPush = (token: string) => enableWebPush(token, true);
export async function disableWebPush(token: string, clearScope = true) {
  try {
    const scope = pushAccountScope(token);
    if (scope) lastRepair.delete(scope);
    if (clearScope) await setPushAccountScope(null);
    const ready = await prepareWebPush();
    for (const n of (await ready?.getNotifications()) || []) n.close();
    const sub = await ready?.pushManager.getSubscription();
    if (sub) {
      await Promise.all([
        pushRequest("subscriptions", token, {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {}),
        sub.unsubscribe(),
      ]);
    }
    await pushRequest("logout", token, { method: "POST" }).catch(() => {});
  } catch {}
}
