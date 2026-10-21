// Allowlisted, operational fields only. Never serialize Error/message/cause,
// environment values, headers, prompts, image data or provider response bodies.
export function scannerFailureDiagnostic(error: { code?: string; category?: string; upstreamStatus?: number | null }) {
  const codes = new Set(["AI_KEY_NOT_CONFIGURED", "AI_MODEL_NOT_CONFIGURED", "AI_UNREACHABLE", "AI_PROVIDER_ACCESS_DENIED", "AI_MODEL_UNAVAILABLE", "AI_PROVIDER_QUOTA", "AI_PROVIDER_UNAVAILABLE", "AI_REQUEST_REJECTED", "AI_INVALID_RESPONSE", "AI_INCOMPLETE_REPORT", "AI_INVALID_REPORT", "AI_GROUNDING_UNAVAILABLE", "AI_SAFETY_BLOCKED"]);
  const categories = new Set(["ai", "configuration", "input", "access"]);
  return { event: "scanner_analysis_failed", code: codes.has(error.code ?? "") ? error.code : "SCANNER_REQUEST_FAILED",
    category: categories.has(error.category ?? "") ? error.category : "service",
    upstreamStatus: Number.isInteger(error.upstreamStatus) && error.upstreamStatus! >= 100 && error.upstreamStatus! <= 599 ? error.upstreamStatus : null,
    apiVersion: "v1beta" };
}
