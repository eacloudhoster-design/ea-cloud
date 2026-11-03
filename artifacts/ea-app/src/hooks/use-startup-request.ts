import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectionRecovery,
  type RecoveryProgress,
} from "@/lib/connection-recovery";
import type { ApiRequestError } from "@/lib/request";
export function useStartupRequest<T>(
  key: string | null,
  phase: string,
  load: (signal: AbortSignal) => Promise<T>,
  success: (value: T) => void,
  failure: (error: ApiRequestError) => void,
) {
  const [progress, setProgress] = useState<RecoveryProgress>({
    state: "idle",
    elapsedMs: 0,
    attempt: 0,
  });
  const latest = useRef({ load, success, failure });
  latest.current = { load, success, failure };
  const task = useRef<ReturnType<typeof connectionRecovery<T>> | null>(null);
  useEffect(() => {
    if (key === null) return;
    const current = connectionRecovery<T>({
      phase,
      load: (s) => latest.current.load(s),
      success: (v) => latest.current.success(v),
      failure: (e) => latest.current.failure(e),
      progress: setProgress,
      maxWindowMs: Number(import.meta.env.VITE_STARTUP_RECOVERY_WINDOW_MS),
    });
    task.current = current;
    if (document.hidden || navigator.onLine === false) current.pause();
    else current.restart();
    return () => {
      current.dispose();
      if (task.current === current) task.current = null;
    };
  }, [key, phase]);
  return {
    progress,
    retry: useCallback(() => {
      if (document.hidden || navigator.onLine === false) task.current?.pause();
      else task.current?.restart();
    }, []),
    recheck: useCallback(() => task.current?.recheck(), []),
    cancel: useCallback(() => task.current?.cancel(), []),
    pause: useCallback(() => task.current?.pause(), []),
    resume: useCallback(() => task.current?.resume(), []),
  };
}
