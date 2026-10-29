import { Worker } from "node:worker_threads";
export class ImageInputError extends Error {}
/** One bounded worker per process; CPU image/ZIP work never runs on the API event loop. */
export function buildToolkit(
  options: {
    id: string;
    token: string;
    origin: string;
    name: string;
    manager: string;
  },
  image?: Buffer,
): Promise<{ filename: string; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./ea-builder-worker.mjs", import.meta.url),
      { workerData: { options, image } },
    );
    let completed = false;
    const timeout = setTimeout(() => {
      completed = true;
      void worker.terminate();
      reject(Error("Package worker timed out."));
    }, 30000);
    worker.once("message", (data) => {
      completed = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (data.ok)
        resolve({ filename: data.filename, bytes: Buffer.from(data.bytes) });
      else
        reject(
          data.kind === "image"
            ? new ImageInputError(data.message)
            : Error("Package generation failed."),
        );
    });
    worker.once("error", () => {
      completed = true;
      clearTimeout(timeout);
      reject(Error("Package worker unavailable."));
    });
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      if (!completed) reject(Error("Package worker exited before completion."));
    });
  });
}
