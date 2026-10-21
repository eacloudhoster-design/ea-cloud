// Operator-only capability check; no database connection, subscriptions or credits.
// Default: metadata only. --image-probe explicitly sends a synthetic pixel to Gemini.
import { resolveScannerModel, scannerConfiguration } from "./lib/scanner-config";
const config = scannerConfiguration();
if (!config.configured) {
  console.error(JSON.stringify({ ok: false, code: config.code, category: config.category }));
  process.exitCode = 1;
} else {
  const { model } = resolveScannerModel();
  const headers = { "x-goog-api-key": process.env.GEMINI_API_KEY!.trim(), "Content-Type": "application/json" };
  let stage = "model_metadata", upstreamStatus: number | null = null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) }); upstreamStatus = response.status;
    if (!response.ok) throw new Error("model_metadata_rejected");
    const metadata = await response.json() as { supportedGenerationMethods?: unknown };
    if (!Array.isArray(metadata?.supportedGenerationMethods) || !metadata.supportedGenerationMethods.includes("generateContent")) throw new Error("generate_content_not_supported");
    if (process.argv.includes("--image-probe")) {
      stage = "image_probe";
      const probe = await fetch(`${url}:generateContent`, { method: "POST", headers, signal: AbortSignal.timeout(55_000), body: JSON.stringify({ contents: [{ role: "user", parts: [
        { text: "This is a synthetic API capability check, not a chart or trading request. Respond only with JSON {\"ok\":true}." },
        { inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=" } },
      ] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1024 } }) });
      upstreamStatus = probe.status; if (!probe.ok) throw new Error("image_probe_rejected");
      const data = await probe.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] }; const candidate = data?.candidates?.[0];
      const text = Array.isArray(candidate?.content?.parts) ? candidate.content.parts.filter((p: { text?: string; thought?: boolean }) => !p.thought && typeof p.text === "string").map((p: { text: string }) => p.text).join("") : "";
      if (candidate?.finishReason !== "STOP" || JSON.parse(text)?.ok !== true) throw new Error("image_probe_invalid_response");
    }
    console.log(JSON.stringify({ ok: true, generateContentSupported: true, imageJsonProbe: process.argv.includes("--image-probe") ? "passed" : "not_run", apiVersion: "v1beta" }));
  } catch {
    // No raw errors, model/env values, URLs, keys or response content are printed.
    console.error(JSON.stringify({ ok: false, stage, upstreamStatus, category: upstreamStatus === 401 || upstreamStatus === 403 ? "provider_access" : upstreamStatus === 404 ? "model_unavailable" : upstreamStatus === 429 ? "quota" : "provider_or_response" }));
    process.exitCode = 1;
  }
}
