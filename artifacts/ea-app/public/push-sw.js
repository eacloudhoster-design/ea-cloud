// The one push-only worker. It never intercepts navigation, API or voice requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
function database(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version),
      timer = setTimeout(() => reject(Error("Push storage timeout")), 3000);
    r.onupgradeneeded = () => upgrade(r.result);
    r.onsuccess = () => {
      clearTimeout(timer);
      resolve(r.result);
    };
    r.onerror = r.onblocked = () => {
      clearTimeout(timer);
      reject(Error("Push storage unavailable"));
    };
  });
}
async function activeAccount() {
  const db = await database("ea-cloud-push-device", 1, (db) =>
    db.createObjectStore("state"),
  );
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("state"),
        r = tx.objectStore("state").get("account");
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
  } finally {
    db.close();
  }
}
async function receipt(id, shown) {
  const db = await database("ea-cloud-push-receipts", 1, (db) =>
    db.createObjectStore("receipts", { keyPath: "id" }),
  );
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("receipts", shown ? "readwrite" : "readonly"),
        store = tx.objectStore("receipts");
      let exists = false;
      const r = store.get(id);
      r.onsuccess = () => {
        exists = !!r.result;
        if (shown) {
          store.put({ id, at: Date.now() });
          const all = store.getAll();
          all.onsuccess = () => {
            for (const row of all.result.sort((a, b) => b.at - a.at).slice(255))
              store.delete(row.id);
          };
        }
      };
      tx.oncomplete = () => resolve(exists);
      tx.onerror = tx.onabort = reject;
    });
  } finally {
    db.close();
  }
}
function destination(value) {
  try {
    const u = new URL(value, self.location.origin);
    if (
      u.origin !== self.location.origin ||
      u.pathname !== "/ea-app/" ||
      !["home", "metatrader"].includes(u.searchParams.get("tab")) ||
      u.searchParams.get("activity") !== "1" ||
      [...u.searchParams.keys()].some((k) => !["tab", "activity"].includes(k))
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
self.addEventListener("push", (event) =>
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data.json();
      } catch {
        return;
      }
      if (
        data.version !== 1 ||
        !/^[a-f0-9-]{36}$/.test(data.eventId) ||
        !/^client:[1-9]\d*$/.test(data.accountScope) ||
        ![
          "EA Cloud",
          "EA Cloud — Trade Executed",
          "EA Cloud — Trade Failed",
          "EA Cloud — Trade Alert",
          "Symbol Configured",
        ].includes(data.title) ||
        typeof data.body !== "string" ||
        !data.body.trim() ||
        data.body.length > 300 ||
        !Number.isFinite(data.expiresAt) ||
        data.expiresAt < Date.now() ||
        data.expiresAt > Date.now() + 650000
      )
        return;
      const url = destination(data.url);
      if (!url) return;
      // Closed-PWA account binding persists on-device. Fail closed on missing/private storage.
      try {
        if (
          (await activeAccount()) !== data.accountScope ||
          (await receipt(data.eventId, false))
        )
          return;
      } catch {
        return;
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/ea-app/apple-touch-icon.jpeg",
        badge: "/ea-app/apple-touch-icon.jpeg",
        tag: "ea-cloud-" + data.eventId,
        renotify: false,
        data: { url, accountScope: data.accountScope },
      });
      // Mark only after successful OS submission; failed showNotification may be retried safely.
      await receipt(data.eventId, true).catch(() => {});
    })(),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = destination(event.notification.data?.url);
      if (!url) return;
      try {
        if ((await activeAccount()) !== event.notification.data?.accountScope)
          return;
      } catch {
        return;
      }
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clients.find(
        (c) =>
          new URL(c.url).origin === self.location.origin &&
          new URL(c.url).pathname.startsWith("/ea-app/"),
      );
      if (existing) {
        const u = new URL(url);
        existing.postMessage({
          type: "EA_PUSH_NAVIGATE",
          tab: u.searchParams.get("tab"),
          activity: true,
          accountScope: event.notification.data.accountScope,
        });
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
