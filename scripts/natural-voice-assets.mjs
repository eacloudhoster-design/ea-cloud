// Run manually with the existing server-side GEMINI_* environment. Never run in a browser.
import { build } from "../artifacts/api-server/node_modules/esbuild/lib/main.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const bundled = await build({
  entryPoints: ["artifacts/api-server/src/lib/assistant-voice.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { synthesize, voiceProfile } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const phrasesBundle = await build({
  entryPoints: ["lib/api-zod/src/voice-announcements.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { commonNaturalAnnouncements } = await import(
  "data:text/javascript;base64," +
    Buffer.from(phrasesBundle.outputFiles[0].text).toString("base64")
);
try {
  const profile = voiceProfile();
  if (!profile.configured)
    throw Error("GEMINI_API_KEY is not configured in this process.");
  if (process.argv.includes("--probe")) {
    const audio = await synthesize(
      1,
      "EA Cloud natural voice check.",
      AbortSignal.timeout(30000),
    );
    await mkdir("work", { recursive: true });
    await writeFile("work/natural-voice-probe.wav", audio, { mode: 0o600 });
    console.log(
      JSON.stringify({
        event: "voice_probe_ok",
        model: profile.model,
        voice: profile.voice,
        bytes: audio.length,
        file: "work/natural-voice-probe.wav",
      }),
    );
  } else if (process.argv.includes("--generate-assets")) {
    const root = resolve("artifacts/ea-app/public/natural-voice");
    await mkdir(join(root, profile.id), { recursive: true });
    const manifest = {
      version: 1,
      profile: { ...profile, configured: false },
      clips: {},
    };
    for (const text of commonNaturalAnnouncements) {
      const hash = createHash("sha256").update(text).digest("hex"),
        filename = `${profile.id}/${hash}.wav`,
        file = join(root, filename);
      let audio;
      try {
        audio = await readFile(file);
        if (
          audio.length < 44 ||
          audio.toString("ascii", 0, 4) !== "RIFF" ||
          audio.toString("ascii", 8, 12) !== "WAVE"
        )
          audio = null;
      } catch {}
      if (!audio) {
        audio = await synthesize(1, text, AbortSignal.timeout(30000));
        await writeFile(file, audio);
      }
      manifest.clips[hash] = filename;
      await writeFile(
        join(root, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );
      console.log(
        JSON.stringify({
          event: "voice_asset_ready",
          profile: profile.id,
          hash,
          bytes: audio.length,
        }),
      );
    }
  } else
    throw Error(
      "Choose --probe or --generate-assets. No provider request was made.",
    );
} catch (error) {
  console.error(
    JSON.stringify({
      event: "voice_operation_failed",
      code: error.code || "VOICE_CONFIGURATION",
      upstreamStatus: error.upstreamStatus,
      quota: error.quota,
    }),
  );
  process.exitCode = 1;
}
