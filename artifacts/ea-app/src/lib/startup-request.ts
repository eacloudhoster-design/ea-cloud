import { ClientRequestError, requestJson } from "./request.ts";
export const recoverableStartupFailure = (error: unknown) =>
  error instanceof ClientRequestError && error.retryable;
function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timer = setTimeout(finish, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
/** Only idempotent startup reads may retry. Never replay login/logout/trading writes. */
export async function requestStartupJson(
  url: string,
  init: RequestInit = {},
  policy = { attempts: 3, timeoutMs: 20000, delayMs: 1000 },
) {
  if (
    !["/api/app/me", "/api/app/dashboard"].includes(url) ||
    (init.method || "GET").toUpperCase() !== "GET"
  )
    throw Error("Startup retry is restricted to session and dashboard reads");
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    if (init.signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    try {
      return await requestJson(url, init, policy.timeoutMs);
    } catch (error) {
      if (init.signal?.aborted || (error as Error)?.name === "AbortError")
        throw error;
      // Deliberately omit tokens, account data, cookies, response bodies and raw errors.
      console.warn("[EA Cloud startup]", {
        endpoint: url,
        status:
          error instanceof ClientRequestError ? (error.status ?? null) : null,
        code: error instanceof ClientRequestError ? error.code : "UNKNOWN",
        attempt,
        retryable: recoverableStartupFailure(error),
      });
      if (!recoverableStartupFailure(error) || attempt === policy.attempts)
        throw error;
      await pause(policy.delayMs * attempt, init.signal || undefined);
    }
  }
  throw Error("Startup retry policy exhausted");
}

export function startupFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ClientRequestError) {
    const label =
      error.endpoint === "/api/app/me" ? "Session check" : "Mentor details";
    return `${label}: ${error.message}`;
  }
  return error instanceof Error ? error.message : fallback;
}
