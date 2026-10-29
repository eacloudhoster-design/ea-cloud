import { parentPort, workerData } from "node:worker_threads";
import { chartBitmap } from "./lib/ea-builder/image";
import { toolkitPackage } from "./lib/ea-builder/package";
if (!parentPort) throw Error("Package worker requires a parent.");
try {
  let bitmap: Buffer | undefined;
  if (workerData.image) {
    try {
      bitmap = chartBitmap(Buffer.from(workerData.image));
    } catch (err) {
      parentPort.postMessage({
        ok: false,
        kind: "image",
        message: (err as Error).message,
      });
      process.exit(0);
    }
  }
  const archive = toolkitPackage({ ...workerData.options, bitmap });
  parentPort.postMessage({
    ok: true,
    filename: archive.filename,
    bytes: archive.bytes,
  });
} catch {
  parentPort.postMessage({
    ok: false,
    kind: "internal",
    message: "Package generation failed.",
  });
}
