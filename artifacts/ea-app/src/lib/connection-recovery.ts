import { ApiRequestError } from "./request";
import { startupDiagnostic } from "./startup-diagnostics";
export function recoveryDelay(
  attempt: number,
  minimum = 0,
  random = Math.random(),
) {
  return Math.min(
    60000,
    Math.max(
      minimum,
      Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5)) *
        (1 + random * 0.15),
    ),
  );
}
/** Single-flight, cancellable, GET-only caller. Never used for commands/mutations. */
export function connectionRecovery<T>(options: {
  phase: string;
  load: (signal: AbortSignal) => Promise<T>;
  success: (value: T) => void;
  failure: (error: ApiRequestError) => void;
}) {
  let active: AbortController | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0,
    attempt = 0,
    disposed = false;
  const cancel = () => {
    generation++;
    active?.abort();
    active = null;
    clearTimeout(timer);
    timer = undefined;
  };
  const run = async () => {
    if (disposed || active) return;
    clearTimeout(timer);
    timer = undefined;
    const current = ++generation,
      controller = new AbortController();
    active = controller;
    attempt++;
    startupDiagnostic({
      event: "startup_request_started",
      phase: options.phase,
      attempt,
    });
    try {
      const value = await options.load(controller.signal);
      if (disposed || current !== generation) return;
      active = null;
      attempt = 0;
      options.success(value);
      startupDiagnostic({
        event: "startup_request_recovered",
        phase: options.phase,
      });
    } catch (error) {
      if (disposed || current !== generation || controller.signal.aborted)
        return;
      active = null;
      const failure =
        error instanceof ApiRequestError
          ? error
          : new ApiRequestError(
              "The app received unexpected startup data. Please retry.",
              "STARTUP_DATA_INVALID",
              "protocol",
              true,
              undefined,
              30000,
            );
      const delayMs = recoveryDelay(attempt, failure.retryAfterMs);
      startupDiagnostic({
        event: "startup_request_failed",
        phase: options.phase,
        attempt,
        code: failure.code,
        category: failure.category,
        status: failure.status,
        upstreamStatus: failure.upstreamStatus,
        requestId: failure.requestId,
        delayMs: failure.retryable ? delayMs : undefined,
      });
      if (failure.retryable) timer = setTimeout(() => void run(), delayMs);
      options.failure(failure);
    }
  };
  return {
    restart() {
      if (disposed) return;
      cancel();
      attempt = 0;
      void run();
    },
    recheck() {
      if (!disposed && !active) void run();
    },
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
