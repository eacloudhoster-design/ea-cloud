// Explicit selection: never silently switch models, projects or paid providers.
export function resolveScannerModel(env: NodeJS.ProcessEnv = process.env) {
  const scanner = env.GEMINI_SCANNER_MODEL?.trim();
  const source = scanner ? "GEMINI_SCANNER_MODEL" : "GEMINI_MODEL";
  const raw = scanner || env.GEMINI_MODEL?.trim() || "";
  const model = raw.replace(/^models\//, "");
  return { model, source, valid: /^gemini-[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(model) };
}
export function scannerConfiguration() {
  if (!process.env.GEMINI_API_KEY?.trim()) return { configured: false, code: "AI_KEY_NOT_CONFIGURED", error: "AI analysis is not configured: set GEMINI_API_KEY on the API server. Contact support.", category: "configuration" as const, retryable: false };
  if (!resolveScannerModel().valid) return { configured: false, code: "AI_MODEL_NOT_CONFIGURED", error: "Set GEMINI_SCANNER_MODEL (or GEMINI_MODEL) to an available Gemini model ID on the API server, without quotes. Contact support.", category: "configuration" as const, retryable: false };
  return { configured: true };
}
