import { useEffect, useMemo, useState } from "react";
import { robotBg } from "@/lib/branding";
export type ModeEa = { id: number; name: string; images: (string | null)[] };
export function useVisualModes(
  clientToken: string | null,
  enabled: boolean,
  mentorImage: string | null,
  mentorId: number | null,
) {
  const scope = `${clientToken}:${mentorId}`;
  const [data, setData] = useState<{ scope: string; eas: ModeEa[] }>({
    scope: "",
    eas: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selectedEa, setSelectedEa] = useState(0);
  const [selected, setSelected] = useState(0);
  let account = "";
  try {
    account = atob(clientToken || "").split(":")[0];
  } catch {
    /* no persisted anonymous selection */
  }
  const accountKey = `ea-cloud:client:${account}:visual-ea`;
  const eas = data.scope === scope ? data.eas : [];
  const ea = eas.find((item) => item.id === selectedEa) || eas[0];
  const modeKey = `ea-cloud:client:${account}:ea:${ea?.id}:visual-mode`;
  useEffect(() => {
    try {
      setSelectedEa(Number(localStorage.getItem(accountKey)) || 0);
    } catch {
      setSelectedEa(0);
    }
  }, [accountKey]);
  useEffect(() => {
    try {
      const value = Number(localStorage.getItem(modeKey));
      setSelected(
        Number.isInteger(value) && value >= 0 && value < 4 ? value : 0,
      );
    } catch {
      setSelected(0);
    }
  }, [modeKey]);
  useEffect(() => {
    if (!clientToken || !enabled) {
      setLoading(false);
      setError("Sign in to load EA artwork.");
      return;
    }
    let alive = true;
    let controller: AbortController | undefined;
    const load = async (initial = false) => {
      if (document.hidden && !initial) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        current.abort();
      }, 8000);
      try {
        const result = await fetch("/api/app/ea-mode-images", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${clientToken}` },
          signal: current.signal,
        });
        if (!result.ok) {
          if (alive && (result.status === 401 || result.status === 403))
            setData({ scope, eas: [] });
          const body = await result.json().catch(() => ({}));
          throw new Error(
            body.error || "Unable to load mode images. Please retry.",
          );
        }
        const response = await result.json();
        if (!alive || current.signal.aborted) return;
        if (!Array.isArray(response.eas))
          throw new Error("Invalid mode image response.");
        setData({ scope, eas: response.eas });
        setError("");
      } catch (err) {
        if (alive && (!current.signal.aborted || timedOut))
          setError(
            timedOut
              ? "Loading artwork timed out. Please retry."
              : (err as Error).message || "Unable to load mode images.",
          );
      } finally {
        clearTimeout(timeout);
        if (alive && controller === current) setLoading(false);
      }
    };
    setLoading(true);
    void load(true);
    const refresh = () => {
      void load();
    };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [clientToken, enabled, retry, scope]);
  const choose = (index: number) => {
    setSelected(index);
    try {
      localStorage.setItem(modeKey, String(index));
    } catch {
      /* session choice still works */
    }
  };
  const owner = `${scope}:${ea?.id || 0}`;
  const [decoded, setDecoded] = useState({ owner: "", url: robotBg });
  const [imageError, setImageError] = useState("");
  const cache = useMemo(
    () =>
      new Map<
        string,
        { promise: Promise<void>; failed: boolean; time: number }
      >(),
    [owner],
  );
  const candidates = [
    ...new Set(
      [ea?.images[selected], ea?.images[0], mentorImage, robotBg].filter(
        (url): url is string => !!url,
      ),
    ),
  ];
  const candidateKey = JSON.stringify(candidates);
  const revision = data;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = (url: string) => {
      const old = cache.get(url);
      if (old && (!old.failed || Date.now() - old.time < 15000))
        return old.promise;
      const item = {
        failed: false,
        time: Date.now(),
        promise: Promise.resolve(),
      };
      item.promise = new Promise<void>((resolve, reject) => {
        const image = new Image();
        let finished = false;
        const timer = window.setTimeout(() => finish(false), 4000);
        const finish = (ok: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          image.onload = null;
          image.onerror = null;
          item.failed = !ok;
          item.time = Date.now();
          ok ? resolve() : reject(new Error("Image unavailable"));
        };
        image.onload = () => {
          if (image.decode)
            image.decode().then(
              () => finish(true),
              () => finish(false),
            );
          else finish(true);
        };
        image.onerror = () => finish(false);
        image.src = url;
      });
      cache.set(url, item);
      return item.promise;
    };
    void (async () => {
      let failed = false;
      for (const url of candidates) {
        if (!alive) return;
        try {
          await load(url);
          if (!alive) return;
          setDecoded({ owner, url });
          setImageError(
            failed
              ? "Selected artwork could not load. Showing this EA's fallback image."
              : "",
          );
          return;
        } catch {
          failed = true;
        }
      }
      if (alive) {
        setDecoded((previous) =>
          previous.owner === owner ? previous : { owner, url: robotBg },
        );
        setImageError("Unable to load artwork. Please retry.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [owner, candidateKey, enabled, cache, revision]);
  return {
    eas,
    ea,
    selected,
    choose,
    selectEa: (id: number) => {
      setSelectedEa(id);
      try {
        localStorage.setItem(accountKey, String(id));
      } catch {
        /* session only */
      }
    },
    loading: loading || (enabled && decoded.owner !== owner),
    error: error || imageError,
    retry: () => {
      cache.clear();
      setRetry((value) => value + 1);
    },
    displayImage: enabled && decoded.owner === owner ? decoded.url : robotBg,
  };
}
export type VisualModes = ReturnType<typeof useVisualModes>;
