import { useEffect, useRef } from "react";
import {
  enableWebPush,
  disableWebPush,
  prepareWebPush,
} from "@/lib/web-push-client";
import { pushAccountScope, setPushAccountScope } from "@/lib/push-device-state";
/** Session routing only. Never ask permission outside the existing bell gesture. */
export function usePushNotifications(token: string | null, ready: boolean) {
  const previous = useRef<string | null>(null),
    queue = useRef(Promise.resolve());
  useEffect(() => {
    const current = ready ? token : null,
      old = previous.current;
    previous.current = current;
    let disposed = false;
    void setPushAccountScope(pushAccountScope(current)).catch(() => {});
    queue.current = queue.current
      .then(async () => {
        if (old && old !== current) await disableWebPush(old, false);
        if (disposed) return;
        await setPushAccountScope(pushAccountScope(current)).catch(() => {});
        if (!current) return;
        await prepareWebPush()?.catch(() => {});
        if (
          !disposed &&
          "Notification" in window &&
          Notification.permission === "granted"
        )
          await enableWebPush(current, false);
      })
      .catch(() => {});
    const navigate = (event: MessageEvent) => {
      const data = event.data;
      if (
        data?.type === "EA_PUSH_NAVIGATE" &&
        data.accountScope === pushAccountScope(current) &&
        current &&
        ["home", "metatrader"].includes(data.tab)
      )
        window.dispatchEvent(
          new CustomEvent("ea:push-navigate", {
            detail: { tab: data.tab, activity: true },
          }),
        );
    };
    navigator.serviceWorker?.addEventListener("message", navigate);
    const repair = () => {
      if (current && !document.hidden) void enableWebPush(current, false);
    };
    window.addEventListener("online", repair);
    document.addEventListener("visibilitychange", repair);
    return () => {
      disposed = true;
      navigator.serviceWorker?.removeEventListener("message", navigate);
      window.removeEventListener("online", repair);
      document.removeEventListener("visibilitychange", repair);
    };
  }, [token, ready]);
}
