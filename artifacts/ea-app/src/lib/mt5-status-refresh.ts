/** Serialize status reads and cancel them on tab/session changes. Never replay writes. */
export function startMt5StatusRefresh<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  success: (data: T) => void;
  failure: () => void;
  window: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}) {
  let stopped = false;
  let offline = false;
  let pending: AbortController | null = null;
  const refresh = async () => {
    if (stopped || offline || pending || options.document.visibilityState === "hidden") return;
    const controller = new AbortController();
    pending = controller;
    try {
      const data = await options.read(controller.signal);
      if (!stopped && !controller.signal.aborted) options.success(data);
    } catch {
      if (!stopped && !controller.signal.aborted) options.failure();
    } finally {
      if (pending === controller) pending = null;
    }
  };
  const onRefresh = () => { void refresh(); };
  const invalidate = () => {
    pending?.abort();
    pending = null;
    options.failure();
  };
  const onOffline = () => { offline = true; invalidate(); };
  const onOnline = () => { offline = false; onRefresh(); };
  const onVisibility = () => {
    if (options.document.visibilityState === "hidden") {
      invalidate();
    } else onRefresh();
  };
  options.window.addEventListener("ea:engine-refresh", onRefresh);
  options.window.addEventListener("online", onOnline);
  options.window.addEventListener("offline", onOffline);
  options.document.addEventListener("visibilitychange", onVisibility);
  const timer = options.window.setInterval(onRefresh, 30_000);
  onRefresh();
  return () => {
    stopped = true;
    pending?.abort();
    options.window.clearInterval(timer);
    options.window.removeEventListener("ea:engine-refresh", onRefresh);
    options.window.removeEventListener("online", onOnline);
    options.window.removeEventListener("offline", onOffline);
    options.document.removeEventListener("visibilitychange", onVisibility);
  };
}
