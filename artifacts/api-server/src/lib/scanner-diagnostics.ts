// Allowlisted, operational fields only. Never serialize Error/message/cause,
// environment values, headers, prompts, image data or provider response bodies.
export function scannerFailureDiagnostic(error: { code?: string; category?: string; upstreamStatus?: number | null; reportValidation?: unknown }) {
  const codes = new Set(["AI_DIRECTION_UNAVAILABLE", "AI_KEY_NOT_CONFIGURED", "AI_MODEL_NOT_CONFIGURED", "AI_UNREACHABLE", "AI_PROVIDER_ACCESS_DENIED", "AI_MODEL_UNAVAILABLE", "AI_PROVIDER_QUOTA", "AI_PROVIDER_UNAVAILABLE", "AI_REQUEST_REJECTED", "AI_INVALID_RESPONSE", "AI_INCOMPLETE_REPORT", "AI_INVALID_REPORT", "AI_GROUNDING_UNAVAILABLE", "AI_SAFETY_BLOCKED"]);
  const categories = new Set(["ai", "configuration", "input", "access"]);
  return { event: "scanner_analysis_failed", code: codes.has(error.code ?? "") ? error.code : "SCANNER_REQUEST_FAILED",
    category: categories.has(error.category ?? "") ? error.category : "service",
    upstreamStatus: Number.isInteger(error.upstreamStatus) && error.upstreamStatus! >= 100 && error.upstreamStatus! <= 599 ? error.upstreamStatus : null,
    apiVersion: "v1beta", ...(sanitizeReportValidation(error.reportValidation) ? { reportValidation: sanitizeReportValidation(error.reportValidation) } : {}) };
}

export interface ReportFailureDetails { stage: "json" | "schema" | "envelope"; issues: { path: string; code: string; receivedType: string }[] }
const reportFields = new Set(["signal", "reasoning", "symbol", "timeframe", "entry", "stopLoss", "takeProfit", "limitations", "confidence", "confidenceReason", "chartClarity", "marketStatus", "analysis", "marketStructure", "trendDirection", "liquiditySweeps", "supportResistance", "entryReasoning", "risksInvalidation", "evidenceTags", "schemaVersion", "riskRewardRatio", "executionStatus", "nonExecutableReasons"]);
const issueCodes = new Set(["invalid_type", "invalid_enum_value", "unrecognized_keys", "too_small", "too_big", "custom", "not_finite", "invalid_union", "invalid_literal"]);
const receivedTypes = new Set(["missing", "null", "number", "string", "boolean", "array", "object", "unknown"]);
export function reportValidationDetails(stage: ReportFailureDetails["stage"], issues: readonly { path: (string | number)[]; code: string }[] = [], raw?: unknown): ReportFailureDetails {
  return { stage, issues: issues.slice(0,12).map(issue => {
    const known = issue.path.every(part => typeof part === "number" || reportFields.has(part));
    let value: unknown = raw;
    if (known) for (const part of issue.path) value = value !== null && typeof value === "object" && Object.hasOwn(value, part) ? (value as Record<string | number, unknown>)[part] : undefined;
    const receivedType = !known ? "unknown" : value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    return { path: known ? issue.path.map(part => typeof part === "number" ? "[]" : part).join(".") || "$" : "$unknown", code: issueCodes.has(issue.code) ? issue.code : "invalid_value", receivedType: receivedTypes.has(receivedType) ? receivedType : "unknown" };
  }) };
}
function sanitizeReportValidation(value: unknown): ReportFailureDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const details = value as ReportFailureDetails;
  if (!["json", "schema", "envelope"].includes(details.stage) || !Array.isArray(details.issues)) return undefined;
  return { stage: details.stage, issues: details.issues.slice(0,12).map(issue => ({
    path: typeof issue?.path === "string" && (issue.path === "$" || issue.path.split(".").every(part => part === "[]" || reportFields.has(part))) ? issue.path : "$unknown",
    code: issueCodes.has(issue?.code) ? issue.code : "invalid_value", receivedType: receivedTypes.has(issue?.receivedType) ? issue.receivedType : "unknown",
  })) };
}
