# Natural-only announcement reliability

**Superseded for current PR #70:** see [free-natural-voice-push.md](free-natural-voice-push.md). Announcements now use bundled/on-device Kokoro, with no Gemini speech API dependency. The Gemini instructions below describe the earlier implementation only.

This supersedes the browser-speech fallback and streaming-client descriptions in `voice-assistant.md`. No application screen or announcement trigger was redesigned. The client plays validated, complete natural-voice WAV recordings only. Browser/system synthesis and the unused legacy voice queue were removed. Unavailable uncached speech stays silent; no banner or notification is introduced.

## Confirmed production cause and protocol corrections

The supplied Render log identifies `VOICE_PROVIDER`, upstream HTTP **429** at `/api/app/assistant/speech`. This is Google's quota/rate-limit response, not the application's per-client Express limiter. The former implementation discarded Google's error details, so that log cannot establish whether the exhausted limit was requests/minute, tokens/minute, requests/day, or a zero model allowance. Do not infer the customer's actual quota from the synthetic test fixture.

Previous launches prewarmed roughly ten announcements repeatedly. Client audio and per-client server caches were memory-only, so reopening the PWA, restarting Render or using another account could generate the same common phrases again. Provider failures also invoked device synthesis, causing the unwanted robotic voice.

Separately, comparison with Google's [Interactions REST reference](https://ai.google.dev/api/interactions-api) found incompatible request/response assumptions: the REST request uses `generation_config.structured_speech_config`, unary audio is read from `steps[].content`, and the terminal streaming event is `interaction.completed`. These contracts are corrected and tested independently of the confirmed 429 cause. Complete validated audio avoids speaking a partial trading price after a failed stream. The compatibility stream endpoint remains for older clients; new clients request WAV.

## Voice identity and caching

Existing server variables are unchanged: `GEMINI_API_KEY`, `GEMINI_VOICE_MODEL` and `GEMINI_VOICE_NAME`. Defaults remain `gemini-3.8-flash-tts` and **Aoede**. No alternate provider or subscription is introduced. A hash of model, voice, delivery instructions, protocol and format identifies every recording. An authenticated `GET /api/app/assistant/voice-config` supplies this public identity without exposing credentials. A stale client identity is rejected with HTTP 409 instead of mixing voices.

* Decoded browser memory: at most 32 clips / 16 MB.
* Persistent browser IndexedDB: exact account + voice profile + text hash, at most 96 clips / 32 MB, 14-day clip expiry. Cached profile fallback expires after 24 hours. Existing databases upgrade in place to version 2. Storage failure/private browsing does not break the application.
* Only explicitly preloaded common phrases and safe bot/symbol/broker labels persist on the device. Financial reports, balances and changing trade prices remain memory-only. Their exact values are preserved in narration.
* Public fixed phrases can be bundled with the frontend and reused across clients by the API. Private dynamic text is never put in public assets. Server memory reuse remains bounded (64 clips / 16 MB / 24 hours).
* Optional `VOICE_AUDIO_CACHE_DIR` uses a writable directory **only if existing persistent storage is already available**. No disk, paid service or environment change is provisioned. Default Render ephemeral storage alone cannot survive redeployment. Bundled assets and browser IndexedDB work without this option.

The server coalesces identical in-flight generation across callers (public fixed phrases only across accounts); cancelling one caller does not cancel another caller's recording. Client requests are also deduplicated. Transient errors get at most one short retry, while 429 honors `Retry-After` and suppresses generation during cooldown. The server applies a shared per-process cooldown (at least one minute, at least an hour for zero/daily quota). Cached audio is checked **before** cooldown and remains available. Multiple API instances do not share memory cooldown; no distributed cache dependency was added.

Existing queue priority, event replacement, lifecycle cleanup and gesture activation remain. Obsolete announcements are dropped, not played minutes later. Interrupted partial announcements are not replayed automatically. OS-closed AudioContexts are recreated during an existing user gesture. Automatic startup audio before iOS grants permission is not guaranteed. There is no microphone or conversation feature.

## Generate reusable recordings once

No genuine recordings could be generated in this development environment: it has no Gemini credential or access to the Render project's quota console. No fake or synthetic test audio is shipped as an announcement. First-time uncached speech still requires working provider quota.

From the repository root, in an authorized backend environment with the **existing** Gemini variables available:

```sh
node scripts/natural-voice-assets.mjs --probe
node scripts/natural-voice-assets.mjs --generate-assets
```

The probe makes one real provider request and saves `work/natural-voice-probe.wav` for listening. The generator creates the 12 fixed common clips under `artifacts/ea-app/public/natural-voice/`, with a manifest containing only public identity and text hashes. It is manual, never a build/startup task. It stops on quota failure, writes its manifest after each successful clip, and resumes without regenerating completed clips. Wait for the actual quota reset before resuming; do not loop the command. Listen to the probe and generated clips before committing these real assets. No API key belongs in Git or frontend settings.

Commit generated public assets on the development branch and rebuild the frontend to serve them from the same origin. Deploy the same repository revision to the API so it can read the bundled common clips too. An API deployment that excludes frontend source must include that public directory or point optional `VOICE_ASSETS_DIR` at its included copy. A profile/settings change deliberately invalidates old recordings; regenerate assets for the new identity.

## Determine quota and capacity

New `assistant_failed` logs retain only safe quota metric, limit identifier, numeric value, model and retry delay. They exclude Google descriptions, project identifiers, keys and announcement text. `upstreamStatus: 429` plus `quota.violations` identifies the provider limit; `VOICE_QUOTA_COOLDOWN` means the API intentionally suppressed another upstream attempt. Google's response might omit violation details; then inspect the project's [active rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) in AI Studio/Google Cloud.

The supplied 429 proves current demand exceeded an available limit at that time. It does **not** establish the project's numerical allowance or sustained capacity. Model availability also depends on that project's access. Cached common playback consumes no Gemini quota, but new mentor/broker names and unique financial reports do. Capacity must cover peak *uncached* requests and input/output tokens across all users and other workloads sharing the project. A zero allowance cannot be repaired through retries or caching; use an already permitted supported model or obtain an approved quota change. No billing change is made by this patch.

## Release and verification

Do not merge or deploy automatically. After review and real-provider/audio approval, deploy the API first (new authenticated profile endpoint and response identity), then the Pages frontend from the same revision. Preserve existing Render variables. No PostgreSQL schema migration, account change or trading integration change is needed. IndexedDB upgrades locally; clearing browser data removes cached clips.

Automated checks cover REST audio contracts, malformed/incomplete audio, sanitized quota limits/cooldowns, cross-client dedup/cancellation, persistent server common clips, legacy configured natural TTS, browser account/profile isolation, cached 429 playback, stale jobs and interruptions, exact price narration, and absence of system speech. Real IndexedDB tests cover reopen/reload, expiry and concurrent pruning. The production UI browser test exercises actual existing announcement events and verifies navigation bounds.

Browser/provider fixtures are synthetic regression data, not evidence of audible quality, actual project quota or a successful live Google call. A physical iPhone PWA must still be checked for initial permission, background/reopen, OS interruptions and audible Aoede pronunciation. Production quota and live generation must be checked with the probe or a sanitized post-deployment log. Chromium emulation does not substitute for those checks.
