/// <reference lib="webworker" />
import { InferenceSession, Tensor, env } from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
const root = "/ea-app/natural-voice/model/";
env.wasm.numThreads = 1;
env.wasm.wasmPaths = {
  mjs: root + "ort-wasm-simd-threaded.mjs",
  wasm: root + "ort-wasm-simd-threaded.wasm",
};
const digest = async (data: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
let model: Promise<{
  session: InferenceSession;
  voice: Float32Array;
  vocab: Record<string, number>;
}> | null = null;
async function load() {
  const response = await fetch(root + "manifest.json", {
    cache: "force-cache",
  });
  if (!response.ok) throw Error("Missing model manifest");
  const info = await response.json();
  if (
    info.model !== "Kokoro-82M-v1.0" ||
    info.voice !== "af_heart" ||
    info.bytes !== 92361271 ||
    info.sha256 !==
      "6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb"
  )
    throw Error("Model identity mismatch");
  const parts: Uint8Array[] = [];
  for (const part of info.parts) {
    if (
      !/^kokoro-v1-int8-[0-4]\.bin$/.test(part.file) ||
      part.bytes > 20_000_000
    )
      throw Error("Invalid model chunk");
    const response = await fetch(root + part.file, { cache: "force-cache" });
    if (!response.ok) throw Error("Model unavailable");
    const data = await response.arrayBuffer();
    if (data.byteLength !== part.bytes || (await digest(data)) !== part.sha256)
      throw Error("Corrupt model chunk");
    parts.push(new Uint8Array(data));
  }
  const combined = new Uint8Array(info.bytes);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  if (offset !== info.bytes || (await digest(combined.buffer)) !== info.sha256)
    throw Error("Corrupt model");
  const voiceResponse = await fetch(root + "af_heart.bin", {
    cache: "force-cache",
  });
  if (!voiceResponse.ok) throw Error("Voice unavailable");
  const voice = await voiceResponse.arrayBuffer();
  if (
    (await digest(voice)) !==
    "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"
  )
    throw Error("Voice identity mismatch");
  return {
    session: await InferenceSession.create(combined, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    }),
    voice: new Float32Array(voice),
    vocab: info.vocab,
  };
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;
  queue = queue.then(async () => {
    try {
      if (typeof text !== "string" || !text.trim() || text.length > 500)
        throw Error("Invalid text");
      model ??= load();
      const { session, voice, vocab } = await model;
      const phones = (await phonemize(text, "en-us"))
        .join(" ")
        .replace(/\u0329/g, "\u030d")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");
      const tokens = Array.from(phones)
        .filter((p) => vocab[p] !== undefined)
        .map((p) => vocab[p]);
      // Reject overlength instead of truncating a financial amount or trade level.
      if (!tokens.length || tokens.length > 510)
        throw Error("Speech context too long");
      const style = voice.slice(tokens.length * 256, (tokens.length + 1) * 256);
      if (style.length !== 256) throw Error("Missing voice style");
      const result = await session.run({
        tokens: new Tensor(
          "int64",
          BigInt64Array.from([0, ...tokens, 0], BigInt),
          [1, tokens.length + 2],
        ),
        style: new Tensor("float32", style, [1, 256]),
        speed: new Tensor("float32", new Float32Array([1]), [1]),
      });
      const audio = result.audio.data as Float32Array;
      if (!audio.length || audio.length > 2_000_000)
        throw Error("Invalid audio");
      let peak = 0;
      for (const x of audio) {
        if (!Number.isFinite(x)) throw Error("Invalid samples");
        peak = Math.max(peak, Math.abs(x));
      }
      if (peak < 0.001) throw Error("Silent audio");
      const wav = new ArrayBuffer(44 + audio.length * 2),
        v = new DataView(wav),
        put = (at: number, s: string) => {
          for (let i = 0; i < s.length; i++)
            v.setUint8(at + i, s.charCodeAt(i));
        };
      put(0, "RIFF");
      v.setUint32(4, 36 + audio.length * 2, true);
      put(8, "WAVEfmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, 24000, true);
      v.setUint32(28, 48000, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      put(36, "data");
      v.setUint32(40, audio.length * 2, true);
      for (let i = 0; i < audio.length; i++)
        v.setInt16(
          44 + i * 2,
          Math.round(
            Math.max(-1, Math.min(1, (audio[i] * 0.85) / peak)) * 32767,
          ),
          true,
        );
      self.postMessage({ id, wav }, [wav]);
    } catch {
      model = null;
      self.postMessage({ id, error: "LOCAL_VOICE_UNAVAILABLE" });
    }
  });
};
