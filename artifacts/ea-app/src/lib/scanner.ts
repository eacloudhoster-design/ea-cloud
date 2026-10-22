import { chartImageKind, decodeChartImage } from "./scanner-image";
export { strategies } from "../../../../lib/api-zod/src/scanner-options";
export type { ScannerRecord, ChartReport, FundamentalReport, FundamentalRequest, Strategy } from "../../../../lib/api-zod/src/scanner";

export class ScannerRequestError extends Error {
  constructor(message: string, public code = "SCANNER_UNAVAILABLE", public category = "service", public retryable = true) { super(message); }
}
export function scannerErrorTitle(error: Error): string {
  const category = error instanceof ScannerRequestError ? error.category : "input";
  return category === "access" ? "Scanner access denied" : category === "ai" || category === "configuration" ? "AI analysis unavailable" : category === "storage" ? "Scan history unavailable" : "Scanner unavailable";
}
export async function scannerRequest<T>(path: string, token: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/app/scanner/${path}`, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
      headers: { ...init.headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ScannerRequestError("The scanner took too long or is unreachable. Please retry.");
  }
  let data;
  try { data = await response.json(); } catch { throw new ScannerRequestError("The scanner returned an unreadable response. Please retry."); }
  if (!response.ok) throw new ScannerRequestError(
    typeof data.error === "string" ? data.error : "Scanner unavailable. Please retry.",
    typeof data.code === "string" ? data.code : "SCANNER_UNAVAILABLE",
    typeof data.category === "string" ? data.category : response.status === 401 || response.status === 403 ? "access" : response.status === 400 ? "input" : "service",
    typeof data.retryable === "boolean" ? data.retryable : ![400, 401, 403].includes(response.status));
  return data as T;
}
// Bounded per-image preparation; no originals are stored or sent to third parties
// until the client explicitly presses Analyse chart.
export async function prepareChart(file: File): Promise<File> {
  if (file.size > 10 * 1024 * 1024 || !file.size) throw new Error("Choose an image under 10 MB.");
  const kind = chartImageKind(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!kind) throw new Error("Choose a valid PNG, JPEG, WebP or supported HEIC chart image.");
  const image = await decodeChartImage(file).catch(() => { throw new Error(kind === "heic" ? "This browser cannot decode HEIC. Export the photo as JPEG or PNG, or use a browser with HEIC support." : "This image could not be opened. Try another chart screenshot."); });
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) throw new Error("This image is too large. Crop the chart before uploading.");
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image preparation is unavailable in this browser.");
    ctx.fillStyle = "#101010"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not prepare chart.")), "image/jpeg", .88));
    if (blob.size > 2 * 1024 * 1024) throw new Error("The chart is still too large. Crop it and try again.");
    return new File([blob], "chart.jpg", { type: "image/jpeg" });
  } finally { if ("close" in image) image.close(); }
}
