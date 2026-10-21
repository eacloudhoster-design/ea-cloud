export interface Mt5AccountHint { login: string; server: string }
export interface Mt5PreviewResult {
  status: "unverified";
  reason: "verification-unavailable";
}

/** Integration boundary. This adapter deliberately accepts NO password/token,
 * performs NO network/storage writes, and can never report a connected account.
 * Replace with a separately reviewed, authenticated verification adapter later.
 */
export async function previewMt5Connection(_account: Mt5AccountHint, signal: AbortSignal): Promise<Mt5PreviewResult> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Preview cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 3200);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
  });
  return { status: "unverified", reason: "verification-unavailable" };
}
