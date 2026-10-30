export class ClientRequestError extends Error {
  readonly endpoint: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(
    message: string,
    endpoint: string,
    code: string,
    retryable: boolean,
    status?: number,
  ) {
    super(message);
    this.name = "ClientRequestError";
    this.endpoint = endpoint;
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}
const endpointOf = (url: string) => url.split("?")[0];
// Bound headers AND body parsing; do not remove credentials during outages.
export async function requestJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<any> {
  const controller = new AbortController(),
    endpoint = endpointOf(url);
  const abort = () => controller.abort();
  if (init.signal?.aborted)
    throw new DOMException("Request cancelled", "AbortError");
  init.signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        let response: Response;
        try {
          response = await fetch(url, {
            ...init,
            signal: controller.signal,
            cache: "no-store",
          });
        } catch (error) {
          if (controller.signal.aborted)
            throw new DOMException("Request cancelled", "AbortError");
          throw new ClientRequestError(
            "Unable to connect. Check your connection and retry.",
            endpoint,
            "NETWORK_ERROR",
            true,
          );
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const code =
            typeof body?.code === "string" &&
            /^[A-Z0-9_]{1,80}$/.test(body.code)
              ? body.code
              : "HTTP_ERROR";
          const retryable = [408, 429, 500, 502, 503, 504].includes(
            response.status,
          );
          const message =
            response.status === 401
              ? "Your session has expired. Please sign in again."
              : response.status === 403
                ? "Your account does not have access. Please contact support."
                : response.status === 404
                  ? "The requested service is not available. Please contact support."
                  : retryable
                    ? `The service is temporarily unavailable (HTTP ${response.status}). Please retry.`
                    : `The request failed (HTTP ${response.status}). Please contact support.`;
          throw new ClientRequestError(
            message,
            endpoint,
            code,
            retryable,
            response.status,
          );
        }
        try {
          return await response.json();
        } catch {
          throw new ClientRequestError(
            "The service returned an invalid response. Please retry.",
            endpoint,
            "INVALID_RESPONSE",
            true,
            response.status,
          );
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ClientRequestError(
              "The connection took too long. Check your connection and retry.",
              endpoint,
              "REQUEST_TIMEOUT",
              true,
            ),
          );
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
