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
export type RecoveryProgress = {
  state:
    | "idle"
    | "connecting"
    | "waiting"
    | "slow"
    | "paused"
    | "ready"
    | "exhausted"
    | "failed";
  elapsedMs: number;
  attempt: number;
};
export function recoveryWindow(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 30000 && n <= 300000
    ? Math.round(n)
    : 120000;
}
// A boundary probe accommodates transit time between opening the app and the
// first request waking Render. It starts halfway through this bounded grace,
// leaving the other half for its response. It never starts another retry cycle.
export const FINAL_PROBE_MS = 10000;
/** Single-flight, cancellable, GET-only caller. Never used for commands/mutations. */
export function connectionRecovery<T>(options: {
  phase: string;
  load: (signal: AbortSignal) => Promise<T>;
  success: (value: T) => void;
  failure: (error: ApiRequestError) => void;
  progress?: (value: RecoveryProgress) => void;
  maxWindowMs?: number;
}) {
  const windowMs = recoveryWindow(options.maxWindowMs);
  const probeAfterMs = windowMs + FINAL_PROBE_MS / 2;
  let active: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0,
    attempt = 0,
    disposed = false,
    started: number | undefined;
  let state: RecoveryProgress["state"] = "idle";
  const progress = (next: RecoveryProgress["state"]) => {
    state = next;
    options.progress?.({
      state,
      attempt,
      elapsedMs: started === undefined ? 0 : Math.max(0, Date.now() - started),
    });
  };
  const clear = () => {
    generation++;
    active?.abort();
    active = null;
    clearTimeout(timer);
    clearTimeout(deadline);
    clearTimeout(slowTimer);
    timer = deadline = slowTimer = undefined;
  };
  const exhaust = () => {
    clear();
    progress("exhausted");
    const failure = new ApiRequestError(
      "EA Cloud could not connect within the recovery window. Please retry.",
      "STARTUP_RECOVERY_EXHAUSTED",
      "timeout",
      false,
    );
    startupDiagnostic({
      event: "startup_recovery_exhausted",
      phase: options.phase,
      attempt,
      code: failure.code,
      category: failure.category,
      elapsedMs: Date.now() - started!,
      windowMs,
    });
    options.failure(failure);
  };
  const begin = () => {
    started = Date.now();
    attempt = 0;
    startupDiagnostic({
      event: "startup_recovery_started",
      phase: options.phase,
      windowMs,
    });
    deadline = setTimeout(exhaust, windowMs + FINAL_PROBE_MS);
    slowTimer = setTimeout(() => {
      if (active || timer) progress("slow");
    }, 15000);
  };
  const run = async () => {
    if (disposed || active || ["paused", "exhausted", "failed"].includes(state))
      return;
    clearTimeout(timer);
    timer = undefined;
    if (started === undefined) begin();
    const finalProbe = Date.now() - started! >= probeAfterMs;
    const current = ++generation,
      controller = new AbortController();
    active = controller;
    attempt++;
    progress(Date.now() - started! >= 15000 ? "slow" : "connecting");
    startupDiagnostic({
      event: "startup_request_started",
      phase: options.phase,
      attempt,
    });
    try {
      const value = await options.load(controller.signal);
      if (disposed || current !== generation) return;
      active = null;
      clearTimeout(deadline);
      clearTimeout(slowTimer);
      deadline = slowTimer = undefined;
      progress("ready");
      started = undefined;
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
              false,
            );
      const delayMs = Math.min(
        recoveryDelay(attempt, failure.retryAfterMs),
        Math.max(0, started! + probeAfterMs - Date.now()),
      );
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
      if (!failure.retryable) {
        clear();
        progress("failed");
        options.failure(failure);
      } else if (finalProbe || Date.now() >= started! + probeAfterMs) exhaust();
      else {
        // A transient error changes connection progress, not authentication or
        // the terminal error screen. Foreground/focus events respect this timer.
        progress(Date.now() - started! >= 15000 ? "slow" : "waiting");
        timer = setTimeout(
          failure.retryAfterMs >
            Math.max(0, started! + probeAfterMs - Date.now())
            ? exhaust
            : () => void run(),
          delayMs,
        );
      }
    }
  };
  return {
    restart() {
      if (!disposed) {
        clear();
        started = undefined;
        state = "idle";
        void run();
      }
    },
    recheck() {
      if (
        !disposed &&
        !active &&
        !timer &&
        !["exhausted", "failed", "paused"].includes(state)
      )
        void run();
    },
    pause() {
      if (!disposed) {
        clear();
        progress("paused");
        startupDiagnostic({
          event: "startup_recovery_paused",
          phase: options.phase,
          attempt,
        });
      }
    },
    resume() {
      if (!disposed && state === "paused") {
        started = undefined;
        state = "idle";
        void run();
      }
    },
    cancel() {
      clear();
      started = undefined;
      progress("idle");
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
