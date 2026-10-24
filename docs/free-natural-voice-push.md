# Free local voice and Web Push (PR #70)

Push-only follow-up: see [web-push-completion.md](web-push-completion.md) for current secure enrollment, diagnostics, delivery retries and approved migration steps. The Kokoro voice sections below are unchanged.

This supersedes the Gemini runtime and asset-generation instructions in `natural-only-voice.md`. Nothing is merged or deployed automatically. Existing Render Gemini variables are left unchanged because the scanner and compatibility APIs still use them; the announcement client no longer calls Gemini or any speech API.

## Voice and recordings

The selected engine is **Kokoro 82M v1.0**, with the American English female **`af_heart`** voice, speed 1.0. It replaces Aoede consistently, rather than mixing two identities. The offline generator and on-device worker use the same int8 ONNX checkpoint and identical af_heart voice vectors (SHA-256 checked). Each output is 24 kHz mono PCM, normalized to peak 0.85. No pitch effects or robotic audio fallback are used.

There are **25 genuine generated recordings**, about 2.5 MB, in `artifacts/ea-app/public/natural-voice/`. The original 12 common phrases are retained, with the five exact robot/connection stages, six connection/trading phrases, and two public welcome recordings added. The complete wording lives in `lib/api-zod/src/common-voice-phrases.json`. The active greeting still reads the actual mentor-configured name; the two bundled welcomes are exact-text cache hits only, never substituted for another bot name.

Recordings are addressed by voice identity and SHA-256 of exact text. All common clips are preloaded. PR #70's centralized queue, cancellation, deduplication, one-player policy, Web Audio permission handling, bounded memory and account-scoped IndexedDB audio cache remain. Financial report audio is memory-only; safe preloaded bot/broker/symbol labels may persist. No announcement text goes to a third-party API. There are no new announcement banners or controls.

Dynamic mentor names, broker names, financial amounts and signal prices use the same Kokoro voice in a lazy Web Worker. It loads **self-hosted** model chunks (92,361,271 bytes total), the 522,240-byte voice vector and about 13 MB of ONNX WASM. Every file is below Cloudflare Pages' 25 MiB per-asset limit. Model and voice hashes are verified before inference. Browser HTTP cache reuses downloaded assets; generated safe clips are persisted in IndexedDB. Storage may be evicted by iOS. There is no continuously running TTS server, provider quota, inference API fee or new hosting service.

This is not a guarantee of unlimited fast dynamic speech on every iPhone. Cold download/model initialization consumes data, memory, CPU and battery; it took about **16–18 seconds** for the first real worker generation in desktop Chromium here. Cached common clips bypass inference. Unsupported WASM/SIMD, low memory, interrupted downloads, oversized phoneme input or a timeout cause silence, never device synthesis. Long financial text is rejected rather than truncated. Existing stale-job limits still apply, so an obsolete market announcement can be discarded while a slow device loads the model. A physical iPhone must be tested before release. No R0 backend can promise unlimited dynamic inference independently of device/hosting resource limits.

## Reproduce recordings

This is an offline maintenance command, not a build/startup dependency:

```sh
python3 -m venv /tmp/ea-kokoro
/tmp/ea-kokoro/bin/pip install kokoro-onnx==0.4.9 soundfile
# Download from the documented upstream release into local, uncommitted model paths:
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
# kokoro-v1.0.int8.onnx and voices-v1.0.bin
/tmp/ea-kokoro/bin/python scripts/generate-kokoro-assets.py \
  --model /your/local/kokoro-v1.0.int8.onnx --voices /your/local/voices-v1.0.bin
```

Expected model SHA-256: `6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb`.
Expected af_heart vector SHA-256: `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b`.

The generator rejects another checkpoint/voice identity, skips valid completed files and updates the manifest after each recording. Optional `--phrases /local/public-phrases.json` adds approved public mentor greetings as a JSON string array; never put account balances, credentials or private report text into public assets. Include that extra array again on later runs to retain its manifest entries. No Gemini key is needed.

Licences are bundled under `natural-voice/licenses`: Kokoro model Apache-2.0, kokoro-onnx MIT, ONNX Runtime MIT, phonemizer wrapper Apache-2.0 and eSpeak NG GPL-3.0 notices. eSpeak is used only to derive phonemes, never as an audible speech engine. Preserve these notices and upstream source availability when redistributing; see `natural-voice/THIRD_PARTY.md`.

## Truthful robot states and existing panel

The existing Start button persists `copyingEnabled` through the existing authenticated endpoint; this is robot/copy-worker enablement, not an MT5 connection receipt. The existing panel opens immediately on Start and hides the draggable circle using its existing visibility rule. Closing restores the circle and saved geometry. The panel design, account grid, logs and controls are preserved.

* Before confirmation, the panel shows `Connecting to EA Cloud service...`; it does not announce success.
* After the Start save and a fresh snapshot confirming the copy-engine is healthy and the robot enabled, audio queues `Robot started.` then `Connecting to EA Cloud service.`
* Only a **fresh snapshot observed after that request**, with `connected === true` and robot enabled, adds `Connected to trade server.`
* Only a connected snapshot also confirming engine health and trade permission adds `Ready to trade.`
* Stop cancels the startup sequence. `Robot stopped.` is spoken only after the backend confirms the saved disabled state. Errors produce the existing failure announcement.

The snapshot endpoint already uses the existing MT5 bridge; absent/non-operational MT5 infrastructure cannot produce connected/ready stages. The UI does not fabricate those states. A saved Start or Stop preference does not close open positions or claim broker execution.

## Standards-based Web Push

The existing backend now stores device subscriptions and transition events in PostgreSQL, uses the free `web-push` implementation, and sends encrypted standards-based push to browser push services. No new paid account/service is required. The push-only service worker does **not** intercept/cache HTML, APIs or navigation, so it cannot revive stale app configuration.

The existing **Settings bell** enables/disables push for this device. No button was added and its styling is unchanged. Tap it in the installed iPhone PWA to request the OS permission prompt. iOS 16.4+ requires a Home Screen-installed web app and a user gesture; normal Safari is not equivalent. Denied permission must be changed in iOS Settings. Without configured VAPID or permission, push remains inactive. Audio permissions and notification permission are independent.

Subscriptions require the existing authoritative authenticated/licensed session. Ownership cannot be transferred by another account; unsubscribe is also ownership-scoped. Endpoints are restricted to known HTTPS push providers to avoid arbitrary outbound URLs. Keys are validated and never returned to another client. At most eight subscriptions are stored per account.

Only actual persisted Start/Stop transitions create events. Started events wait for confirmed engine health and are dropped if the bot has since stopped. Repeated identical writes do not create another event; failed/unauthorized writes create none. Multiple API replicas atomically claim events at most once, and the service worker persists delivery IDs to suppress duplicates. Expired (404/410) endpoints are removed. Other delivery failures are logged without subscription secrets. Ambiguous sends are **not retried**: this favors no duplicates over guaranteed delivery. A crash between preference save and event insertion, or after claim before send, can lose a notification. Notifications also depend on iOS Focus settings, connectivity and push-service delivery. There is no false delivery guarantee.

Title is `EA Cloud`, with exactly `Robot started.` or `Robot stopped.`, the existing app icon, and a click target restricted to `/ea-app/`. These are OS notifications, not in-app banners. They describe a successful configuration transition, not a verified broker connection. Backend licence access is checked again before delivery. Subscriptions remain enabled until the device bell unsubscribes or the endpoint expires.

## Manual setup after review, before release

1. Apply the **additive** `docs/migrations/20261024-web-push.sql` to the existing PostgreSQL database through your authorized migration process. It adds only `push_subscriptions`, `push_events` and their indexes. Do not reset the database or run a destructive schema push. This migration was tested against isolated PostgreSQL; production is not accessible here and was not modified.
2. Generate VAPID keys once, privately, from the repo root:

   ```sh
   node scripts/generate-web-push-keys.mjs --subject mailto:your-support-email@example.com
   ```

   It saves `work/web-push.env` with mode 0600, excluded from Git. Put `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` into the **existing** Render API service privately. Never paste the private key into chat/Git/frontend variables. Keep the pair stable; changing it requires device resubscription. No existing Gemini settings need modification.
3. After audio/iPhone review and explicit approval, deploy the API and Pages frontend from the same PR revision. Keep the bundled model parts, voice vector, runtime loader/WASM, clips, manifest, worker and licences in the Pages output. Do not omit large `.bin` files from deployment. Existing app/PWA routes and startup animation remain unchanged.
4. Open the installed PWA, tap the existing Settings bell, allow notifications, then test successful Start/Stop while foregrounded, backgrounded and locked. Test failure and duplicate commands too. No merge/deployment was performed by this task.

## Verification and remaining gates

Automated verification includes genuine WAV format/signal checks, model/voice hashes, all 25 clips decoded through browser Web Audio, a real browser ONNX generation, IndexedDB persistence/limits, queue/state tests, the actual app event flow, PostgreSQL ownership/authentication/licence/transition tests, and service-worker dispatch via Chromium's notification API. Chromium push dispatch is simulated at the browser boundary; it is not a live APNs delivery test.

The first real generation's audio preview is saved under `work/voice-preview/`. Playback decoding and waveform checks pass, but subjective naturalness/pronunciation approval remains with the user. No physical iPhone or production push subscription was available. Lock Screen delivery, iPhone cold-start performance, interruptions and audible consistency require physical-device approval before merging/deployment.
