import { useCallback, useEffect, useRef, useState } from "react";

export type PublicMobilePanel = "account" | "navigation";
const KEY = "eaPublicMobilePanel";

/** A same-URL history entry lets native Back dismiss a sheet before leaving Home. */
export function usePublicMobilePanel(enabled: boolean) {
  const [panel, setPanel] = useState<PublicMobilePanel | null>(null);
  const [settling, setSettling] = useState(false);
  const closing = useRef(false);
  const queuedOpen = useRef<PublicMobilePanel | null>(null);
  const owner = useRef(`ea-sheet-${Math.random().toString(36).slice(2)}`);
  const pending = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const close = useCallback((after?: () => void) => {
    setPanel(null);
    queuedOpen.current = null;
    if (closing.current) {
      if (after) pending.current = after;
      return;
    }
    if (history.state?.[KEY]?.owner === owner.current) {
      closing.current = true;
      setSettling(true);
      pending.current = after || null;
      history.back();
    } else after?.();
  }, []);
  const open = useCallback((kind: PublicMobilePanel) => {
    pending.current = null;
    if (closing.current) {
      queuedOpen.current = kind;
      setPanel(kind);
      return;
    }
    const marker = { owner: owner.current, kind };
    if (history.state?.[KEY]?.owner === owner.current)
      history.replaceState({ ...history.state, [KEY]: marker }, "");
    else history.pushState({ ...history.state, [KEY]: marker }, "");
    setPanel(kind);
  }, []);
  useEffect(() => {
    const pop = () => {
      setSettling(true);
      closing.current = false;
      const queued = queuedOpen.current;
      queuedOpen.current = null;
      if (queued && enabledRef.current) {
        history.pushState(
          { ...history.state, [KEY]: { owner: owner.current, kind: queued } },
          "",
        );
        setPanel(queued);
      } else {
        const marker = history.state?.[KEY];
        setPanel(
          enabledRef.current && marker?.owner === owner.current
            ? marker.kind
            : null,
        );
      }
      // Keep the header pinned until native scroll restoration has completed.
      requestAnimationFrame(() => setSettling(false));
      const action = pending.current;
      pending.current = null;
      // Run selected navigation after the sheet's temporary entry is removed.
      // Native history restores the previous entry's scroll after popstate.
      // Select a destination on the next frame so that restoration cannot cancel it.
      if (action) requestAnimationFrame(action);
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      pending.current = null;
    };
  }, []);
  useEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);
  return { panel, settling, open, close };
}
