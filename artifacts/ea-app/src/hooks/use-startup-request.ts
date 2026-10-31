import { useCallback, useEffect, useRef } from "react";
import { connectionRecovery } from "@/lib/connection-recovery";
import type { ApiRequestError } from "@/lib/request";
export function useStartupRequest<T>(
  key: string | null,
  phase: string,
  load: (signal: AbortSignal) => Promise<T>,
  success: (value: T) => void,
  failure: (error: ApiRequestError) => void,
) {
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
    });
    task.current = current;
    current.restart();
    return () => {
      current.dispose();
      if (task.current === current) task.current = null;
    };
  }, [key, phase]);
  return {
    retry: useCallback(() => task.current?.restart(), []),
    recheck: useCallback(() => task.current?.recheck(), []),
    cancel: useCallback(() => task.current?.cancel(), []),
  };
}
