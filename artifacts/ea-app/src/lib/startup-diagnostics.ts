export type FailureCategory =
  | "network"
  | "timeout"
  | "authentication"
  | "authorization"
  | "configuration"
  | "backend"
  | "protocol"
  | "rate_limit"
  | "frontend";
export type StartupDiagnostic = {
  event: string;
  phase: string;
  code?: string;
  category?: FailureCategory;
  status?: number;
  upstreamStatus?: number;
  attempt?: number;
  delayMs?: number;
  requestId?: string;
};
const recent: StartupDiagnostic[] = [];
/** Fixed metadata only: never error messages, credentials, response bodies or query strings. */
export function startupDiagnostic(item: StartupDiagnostic) {
  recent.push(item);
  if (recent.length > 30) recent.shift();
  try {
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "__eaStartupDiagnostics", {
        configurable: true,
        get: () => recent.map((row) => ({ ...row })),
      });
      window.dispatchEvent(
        new CustomEvent("ea:startup-diagnostic", { detail: item }),
      );
    }
    if (item.event.endsWith("failed")) console.warn("[EA Cloud startup]", item);
  } catch {
    /* Observability must never prevent startup or recovery. */
  }
}
