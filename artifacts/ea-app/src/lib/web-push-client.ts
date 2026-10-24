let registration: Promise<ServiceWorkerRegistration> | null = null;
export function prepareWebPush() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !window.isSecureContext
  )
    return null;
  registration ??= navigator.serviceWorker
    .register("/ea-app/push-sw.js", { scope: "/ea-app/" })
    .then(() => navigator.serviceWorker.ready)
    .catch((error) => {
      registration = null;
      throw error;
    });
  return registration;
}
export async function toggleWebPush(token: string) {
  if (!("Notification" in window)) return;
  // This function is called directly from the existing bell's user gesture.
  const permission =
    Notification.permission === "default"
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
  try {
    if ((await permission) !== "granted") return;
    const ready = await prepareWebPush();
    if (!ready) return;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const current = await ready.pushManager.getSubscription();
    if (current) {
      const removed = await fetch("/api/app/push/subscriptions", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ endpoint: current.endpoint }),
      });
      if (removed.ok) await current.unsubscribe();
      return;
    }
    const response = await fetch("/api/app/push/config", { headers });
    if (!response.ok) return;
    const config = await response.json();
    if (!config.enabled || typeof config.publicKey !== "string") return;
    const key = Uint8Array.from(
      atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const subscription = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const saved = await fetch("/api/app/push/subscriptions", {
      method: "POST",
      headers,
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!saved.ok) await subscription.unsubscribe();
  } catch {
    /* OS permission/network failures do not change trading or add UI messages. */
  }
}
