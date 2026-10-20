// Bound both response headers and body parsing; keep credentials on transient failures.
export async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw Object.assign(new Error(
          response.status === 401 ? "Your session has expired. Please sign in again." : "The service is unavailable. Please retry."
        ), { status: response.status });
        try { return await response.json(); }
        catch { throw new Error("The service returned an invalid response. Please retry."); }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("The connection took too long. Check your connection and retry."));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer!); }
}
