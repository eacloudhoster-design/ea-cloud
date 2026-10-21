export { strategies } from "../../../../lib/api-zod/src/scanner-options";
export type { ScannerRecord, ChartReport, FundamentalReport, FundamentalRequest, Strategy } from "../../../../lib/api-zod/src/scanner";

export async function scannerRequest<T>(path: string, token: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/app/scanner/${path}`, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
      headers: { ...init.headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("The scanner took too long or is unreachable. Please retry.");
  }
  let data;
  try { data = await response.json(); } catch { throw new Error("The scanner returned an unreadable response. Please retry."); }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Scanner unavailable. Please retry.");
  return data as T;
}
// Bounded per-image preparation; no originals are stored or sent to third parties
// until the client explicitly presses Analyse chart.
export async function prepareChart(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image. Convert HEIC photos to JPEG first.");
  if (file.size > 10 * 1024 * 1024 || !file.size) throw new Error("Choose an image under 10 MB.");
  const image = await createImageBitmap(file).catch(() => { throw new Error("This image could not be opened. Try another chart screenshot."); });
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
  } finally { image.close(); }
}
