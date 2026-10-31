import type { FailureCategory } from "./startup-diagnostics";
export class ApiRequestError extends Error {
  code: string;
  category: FailureCategory;
  retryable: boolean;
  status?: number;
  retryAfterMs: number;
  requestId?: string;
  upstreamStatus?: number;
  constructor(
    message: string,
    code: string,
    category: FailureCategory,
    retryable: boolean,
    status?: number,
    retryAfterMs = 0,
    requestId?: string,
    upstreamStatus?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
    Object.assign(this, {
      code,
      category,
      retryable,
      status,
      retryAfterMs,
      requestId,
      upstreamStatus,
    });
    this.code = code;
    this.category = category;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
const known: Record<string, [FailureCategory, string]> = {
  API_BACKEND_NOT_CONFIGURED: [
    "configuration",
    "The API backend is not configured correctly. Please contact support.",
  ],
  API_UPSTREAM_UNREACHABLE: [
    "backend",
    "The API backend cannot be reached. EA Cloud will retry automatically.",
  ],
  API_UPSTREAM_UNAVAILABLE: [
    "backend",
    "The API backend is temporarily unavailable. EA Cloud will retry automatically.",
  ],
  API_UPSTREAM_HTML: [
    "configuration",
    "The API returned a webpage instead of app data. Please check the API deployment.",
  ],
  SESSION_STORAGE_SCHEMA_UNAVAILABLE: [
    "configuration",
    "The session database schema is unavailable. Please contact support; your login has not been erased.",
  ],
  SESSION_STORAGE_UNAVAILABLE: [
    "backend",
    "Session verification is temporarily unavailable. EA Cloud will retry automatically.",
  ],
  SESSION_CHECK_UNAVAILABLE: [
    "backend",
    "Session verification is temporarily unavailable. EA Cloud will retry automatically.",
  ],
  SESSION_BACKEND_FAILURE: [
    "backend",
    "The service could not complete this startup request. EA Cloud will retry automatically.",
  ],
};
export function protocolError(message: string) {
  return new ApiRequestError(
    message,
    "API_INVALID_RESPONSE",
    "protocol",
    true,
    200,
    30000,
  );
}
// One bounded request, including response body. Only the startup recovery controller retries GETs.
export async function requestJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  const cancelled = () => new DOMException("Request cancelled", "AbortError");
  if (init.signal?.aborted) throw cancelled();
  init.signal?.addEventListener("abort", abort, { once: true });
  let rejectAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      (async () => {
        let response: Response;
        try {
          response = await fetch(url, {
            ...init,
            credentials: init.credentials || "same-origin",
            signal: controller.signal,
            cache: "no-store",
          });
        } catch {
          if (controller.signal.aborted) throw cancelled();
          throw new ApiRequestError(
            "The network connection failed. Reconnect to resume EA Cloud.",
            "API_NETWORK_FAILED",
            "network",
            true,
          );
        }
        if (!response.ok) {
          let payload: any;
          try {
            payload = await response.json();
          } catch {
            /* Status remains authoritative. */
          }
          const state = response.status;
          const definition =
            typeof payload?.code === "string" ? known[payload.code] : undefined;
          const requestId =
            response.headers?.get("cf-ray") ||
            response.headers?.get("x-request-id");
          const retry = response.headers?.get("retry-after");
          const seconds = retry ? Number(retry) : NaN;
          const retryAfterMs =
            Math.min(
              60000,
              Math.max(
                0,
                Number.isFinite(seconds)
                  ? seconds * 1000
                  : retry
                    ? Date.parse(retry) - Date.now()
                    : 0,
              ),
            ) || 0;
          const auth = state === 401,
            forbidden = state === 403;
          throw new ApiRequestError(
            auth
              ? "Your session has expired. Please sign in again."
              : forbidden
                ? "Access was denied. Please check your account permissions."
                : definition?.[1] ||
                  (state === 404
                    ? "The app and API versions do not match. Please contact support."
                    : state === 429
                      ? "The service is receiving too many requests. EA Cloud will retry shortly."
                      : "The service is temporarily unavailable. EA Cloud will retry automatically."),
            auth
              ? "AUTH_REQUIRED"
              : forbidden
                ? "ACCESS_DENIED"
                : definition
                  ? payload.code
                  : `HTTP_${state}`,
            auth
              ? "authentication"
              : forbidden
                ? "authorization"
                : definition?.[0] || (state === 429 ? "rate_limit" : "backend"),
            [408, 425, 429, 500, 502, 503, 504].includes(state),
            state,
            Math.max(
              retryAfterMs,
              definition?.[0] === "configuration" ? 30000 : 0,
            ),
            requestId && /^[a-zA-Z0-9_-]{1,80}$/.test(requestId)
              ? requestId
              : undefined,
            Number.isInteger(payload?.upstreamStatus) &&
              payload.upstreamStatus >= 400 &&
              payload.upstreamStatus <= 599
              ? payload.upstreamStatus
              : undefined,
          );
        }
        try {
          return await response.json();
        } catch {
          if (controller.signal.aborted) throw cancelled();
          throw protocolError(
            "The service returned an invalid response. Please retry.",
          );
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ApiRequestError(
              "The connection took too long. EA Cloud will retry automatically.",
              "API_TIMEOUT",
              "timeout",
              true,
            ),
          );
          controller.abort();
        }, timeoutMs);
        // Also settle callers even if a browser/fetch fixture ignores cancellation.
        rejectAbort = () => reject(cancelled());
        init.signal?.addEventListener("abort", rejectAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
    if (rejectAbort) init.signal?.removeEventListener("abort", rejectAbort);
  }
}
