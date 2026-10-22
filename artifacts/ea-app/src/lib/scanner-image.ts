// Inspect bytes, not the filename or user-supplied MIME. Never decode SVG/HTML.
export function chartImageKind(header: Uint8Array): "jpeg" | "png" | "webp" | "heic" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...header.slice(start, end));
  if (header[0] === 255 && header[1] === 216 && header[2] === 255) return "jpeg";
  if ([137,80,78,71,13,10,26,10].every((v,i) => header[i] === v)) return "png";
  if (ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP") return "webp";
  // HEIF container brands; native decode must still succeed before conversion.
  if (ascii(4,8) === "ftyp" && ["heic","heix","hevc","hevx","mif1","msf1"].some(brand => ascii(8,32).includes(brand))) return "heic";
  return null;
}
export async function decodeChartImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* Safari may support HEIC only through img. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.decoding = "async"; image.src = url;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([image.decode(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Image decode timed out.")), 15000);
    })]); } finally { if (timer) clearTimeout(timer); }
    return image;
  } finally { URL.revokeObjectURL(url); }
}
