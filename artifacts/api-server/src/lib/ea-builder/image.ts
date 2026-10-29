import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import bmp from "bmp-js";

/** Decode only bounded, signature-verified PNG/JPEG/uncompressed 24/32-bit BMP.
 * Output is an ordinary opaque bottom-up 24-bit BI_RGB Windows bitmap. */
export function chartBitmap(input: Buffer): Buffer {
  if (input.length < 16 || input.length > 10 * 1024 * 1024)
    throw new Error("Image must be a valid PNG, JPEG or BMP up to 10MB.");
  let width = 0,
    height = 0,
    kind = "";
  if (
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    if (input.length < 33 || input.toString("ascii", 12, 16) !== "IHDR")
      throw new Error("Invalid PNG header.");
    kind = "png";
    width = input.readUInt32BE(16);
    height = input.readUInt32BE(20);
  } else if (input[0] === 255 && input[1] === 216) {
    kind = "jpeg";
    let offset = 2;
    while (offset + 4 < input.length) {
      if (input[offset] !== 255) throw new Error("Invalid JPEG marker.");
      while (input[offset] === 255) offset++;
      const marker = input[offset++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = input.readUInt16BE(offset);
      if (length < 2 || offset + length > input.length)
        throw new Error("Invalid JPEG segment.");
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = input.readUInt16BE(offset + 3);
        width = input.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (input.toString("ascii", 0, 2) === "BM") {
    kind = "bmp";
    if (
      input.length < 54 ||
      input.readUInt32LE(14) !== 40 ||
      input.readUInt16LE(26) !== 1 ||
      ![24, 32].includes(input.readUInt16LE(28)) ||
      input.readUInt32LE(30) !== 0
    )
      throw new Error("Use an uncompressed 24-bit or 32-bit BMP.");
    width = input.readInt32LE(18);
    height = Math.abs(input.readInt32LE(22));
    const stride = Math.ceil((width * input.readUInt16LE(28)) / 32) * 4,
      offset = input.readUInt32LE(10);
    if (offset < 54 || offset + stride * height > input.length)
      throw new Error("Truncated BMP.");
  } else throw new Error("Image contents must be PNG, JPEG or BMP.");
  if (
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 12000000
  )
    throw new Error(
      "Image dimensions must be within 8192px and 12 megapixels.",
    );
  let decoded: { width: number; height: number; data: Buffer | Uint8Array };
  if (kind === "png") decoded = PNG.sync.read(input, { checkCRC: true });
  else if (kind === "jpeg")
    decoded = jpeg.decode(input, {
      useTArray: true,
      maxResolutionInMP: 12,
      maxMemoryUsageInMB: 128,
      formatAsRGBA: true,
    });
  else {
    const raw = bmp.decode(input);
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = raw.data[i + 3]!;
      rgba[i + 1] = raw.data[i + 2]!;
      rgba[i + 2] = raw.data[i + 1]!;
      rgba[i + 3] = 255;
    }
    decoded = { width: raw.width, height: raw.height, data: rgba };
  }
  if (
    decoded.width !== width ||
    decoded.height !== height ||
    decoded.data.length !== width * height * 4
  )
    throw new Error("Invalid decoded image dimensions.");
  const ratio = Math.min(1, 1920 / width, 1920 / height),
    w = Math.max(1, Math.round(width * ratio)),
    h = Math.max(1, Math.round(height * ratio)),
    stride = Math.ceil((w * 3) / 4) * 4;
  const out = Buffer.alloc(54 + stride * h);
  out.write("BM");
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18);
  out.writeInt32LE(h, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(stride * h, 34);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p =
          (Math.min(height - 1, Math.floor(y / ratio)) * width +
            Math.min(width - 1, Math.floor(x / ratio))) *
          4,
        alpha = decoded.data[p + 3]! / 255,
        q = 54 + (h - y - 1) * stride + x * 3;
      out[q] = Math.round(decoded.data[p + 2]! * alpha);
      out[q + 1] = Math.round(decoded.data[p + 1]! * alpha);
      out[q + 2] = Math.round(decoded.data[p]! * alpha);
    }
  return out;
}
