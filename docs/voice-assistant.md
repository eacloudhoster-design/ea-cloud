# Current implementation

See [natural-only-voice.md](natural-only-voice.md) for the current natural-only announcement path, persistent caching, quota diagnostics and deployment steps. Descriptions of browser speech fallback or client streaming below are historical and superseded.

# Neural announcement upgrade (current behaviour)

This section supersedes the historical native-only implementation notes below. The existing announcement hook, queue, priorities, triggers and truthful event formatters remain in place; only audio generation/playback and preloading change. No listening, conversation, intent request or trading action is introduced.

## Provider choice and configuration

The robotic sound came from the active `SpeechSynthesisUtterance` path, whose quality depends on installed device voices. An existing authenticated Gemini speech backend was unused by announcements. Reusing it avoids a new provider account/key or subscription. Google's dedicated TTS model is separate from the scanner model; an image-capable Gemini key/model does not establish speech access.

Evaluated against current official documentation:

- [OpenAI speech](https://developers.openai.com/api/docs/guides/text-to-speech): Marin, Coral and Shimmer are candidates for an audition, with style control on GPT-4o mini TTS, but require a separate OpenAI API key and usage billing. No OpenAI integration or charges were added.
- [ElevenLabs API](https://elevenlabs.io/pricing/api): natural voices and low-latency options, but another account, voice selection and commercial usage plan/limits. No ElevenLabs service was added.
- [Gemini TTS](https://ai.google.dev/gemini-api/docs/speech-generation): reuse the existing server-side provider/key. Select the current higher-fidelity `gemini-3.8-flash-tts` with Aoede. Delivery instructions request warm, clear, natural adult feminine speech, ordinary pace/pitch, subtle confidence and no metallic effects. This is an infrastructure/quality choice, not an audible comparison proving it matches ChatGPT Voice Mode. A listening test remains necessary.

Render API settings:

```text
GEMINI_API_KEY=<existing server-side key with TTS model access>
GEMINI_VOICE_MODEL=gemini-3.8-flash-tts
GEMINI_VOICE_NAME=Aoede
```

The two voice settings also have those defaults. For lower-cost, latency-oriented operation, the same adapter also supports `gemini-3.8-flash-lite-tts`; audition before changing it. Explicitly update an old configured preview model to select the new path. Do not change `GEMINI_SCANNER_MODEL` or scanner settings. Gemini 3.8 uses the Interactions REST endpoint with verbatim transcript and separate speech-style metadata; `store:false` avoids stored interaction state. Raw PCM output is explicitly requested and validated before wrapping in WAV, preventing double WAV headers. Legacy configured TTS models retain their previous generateContent adapter for compatibility; their continued availability is not guaranteed.

[Google's pricing](https://ai.google.dev/gemini-api/docs/pricing) lists a limited free tier; project/region/model access and quota must be checked. Paid-tier generation incurs usage charges. No billing or production account settings were changed, and no live paid generation was attempted here. Preloading can generate up to ten short clips per app session, even if not all are later played. Server cache reuse reduces repeated generation but restarts/eviction still incur misses. Free-tier provider data handling differs from paid-tier handling; consult the linked terms before sending private account narration.

## Playback, caching and lifecycle

The existing service now accepts the authenticated session token and uses the existing `/api/app/assistant/speech` endpoint. API keys remain server-side; existing session/licence middleware, input validation and rate limits remain. No scanner credits or subscription records are touched. The endpoint returns private/no-store audio, and existing sanitized failure logs contain error code/upstream status, not transcript or credentials.

Once authenticated mentor branding is ready, a session-scoped Web Audio transport preloads welcome during the existing startup transition without playing it until that transition reports completion. It also preloads four modes, the dynamic bot's activation/deactivation and common scan/status phrases sequentially. The same transcript shares one in-flight request and cached decoded audio. Cache limits are 32 clips/16MB decoded client audio and 64 clips/16MB server WAV, with a 24-hour server TTL. Both are memory-only, client/account-scoped, and cleared/evicted; there is no browser persistent speech cache or new database. Cache keys include model, voice and delivery instructions. Reload/reopening may require another request; server cache survives only within a running API process.

The original single priority queue retains group replacement, deduplication, expiry and cancellation. Abort/generation checks prevent an obsolete response from speaking. Each clip plays at its generated natural rate without pitch effects. Long passages are split using existing text chunking rather than altering trading values. Existing symbol/price formatters are unchanged, and the exact transcript is supplied to speech generation. A generative provider can still mispronounce or omit digits: no acoustic round-trip verification is claimed.

A cached decoded clip avoids generation/network/decode work, targeting prompt playback after permission. Unit fixtures verify dispatch under 300ms; this is not measured physical speaker latency. A cold clip can take seconds, with bounded request timeouts and native speech fallback on provider/configuration failure. Further misses back off for 30 seconds after failure. The fallback has device-dependent quality; an unavailable neural provider does not silently remove announcement triggers.

Common phrases use the existing complete-WAV response for preloading. Cold dynamic speech requests `stream:true` on the same authenticated endpoint. The Gemini 3.8 adapter parses fragmented SSE audio events, emits validated PCM chunks before completion and caches only a completed stream. The client schedules 24kHz PCM chunks sequentially in its existing audio player and stores the completed decoded clip for reuse. Cancellation stops all scheduled sources. A broken stream is not cached; if any audio already played, the whole transcript is not replayed as a native fallback. Legacy configured models retain buffered WAV playback. Tests prove first-chunk playback before EOF and preserve signed PCM sample values; real upstream latency is unmeasured.

Existing pointer/touch/key gestures synchronously resume the AudioContext. A blocked welcome remains queued until audio is permitted; no silent-audio bypass or guarantee of automatic iOS startup audio is made. Backgrounding stops playback and drops stale event speech, while retaining an unheard welcome. Session teardown aborts requests, closes audio and clears client clips. Ordinary foregrounding does not guarantee iOS resumes audio without another gesture. Settings includes the required disclosure: “Announcements use an AI-generated voice.”

## Verification and deployment

Client/API TypeScript and both production builds pass. Direct focused runs: 18 passed, one optional PostgreSQL integration skipped across 19 tests. The full runner reports 34 passing test files and the one known activity-monitor failure. Focused tests cover decoded-cache reuse, no overlap, dynamic mentor/prices, blocked welcome/gesture retry, background/dispose, stale response cancellation, native fallback/backoff, modern/legacy provider requests, invalid audio and upstream errors, fragmented streaming and first-chunk playback before EOF. Existing native formatter/trigger tests continue to pass. The browser regression script supports `NEURAL_VOICE_TEST=1` for mocked neural playback and its default device-fallback path; these are synthetic audio, not voice-quality tests.

In this turn Chromium could not launch (`setsockopt: Operation not permitted`); local/network permissions were not granted, and no live provider key was available. Thus neither browser event flow nor physical iOS audio/interruptions were verified. Existing optional PostgreSQL route integration requires PGlite and was skipped; no production database was accessed. The full unit runner still has the existing unrelated activity-monitor wording failure.

Deploy the API server **and** combined Pages frontend after approval. No schema migration, paid subscription, new dependency, PWA metadata change or reinstall is required. Before release, audition the actual configured voice in a permitted environment, then verify startup after splash/gesture, dynamic bot Start/Stop, all four modes, real MT5 result categories, scanner prices, rapid replacement, background/reopen and phone audio interruption. Check cached playback and cold generation separately; do not claim human-like quality or the 300ms audible target until measured.

Changed files: client `App.tsx` warm-up readiness wiring; API `lib/assistant-voice.ts` and `routes/assistant.ts`; client `lib/announcement-audio.ts`, `lib/voice-announcement-service.ts`, `hooks/use-voice-announcements.ts` and the disclosure in `pages/SettingsTab.tsx`; tests `assistant.test.mjs`, `neural-provider.test.mjs`, `neural-announcements.test.mjs`, `voice-assistant.browser.mjs`; this document. All original event handlers and announcement formatters remain.

---

## Historical native-only implementation

# Automatic voice announcements

The conversational client has been replaced by automatic, native English speech. There is no assistant activation, microphone, question field, provider setting or in-app disable switch. Old saved opt-in/off preferences no longer govern announcements. System volume, device voice availability and browser restrictions still apply.

## Event integration

- Welcome reads the loaded mentor bot name from the existing branding state, once per authenticated app launch. Navigation does not repeat it. The announcement now waits for StartupSplash to report its completed fade; loading duration and layout are unchanged. A restored back/forward-cache page and ordinary foregrounding do not duplicate an already delivered welcome. An unheard autoplay-blocked welcome survives backgrounding until the first permitted existing gesture. Empty names fall back to EA Cloud Pro.
- Start/Stop speaks after the existing serialized `trading-controls` PATCH succeeds and its returned `copyingEnabled` matches the requested value. Failed/mismatched writes speak failure. “Activated/deactivated” describes the saved app control, not proof of live MT5 engine connectivity or an executed trade. No extra facts request delays this announcement.
- Only existing Normal, Beast, Aggressive and Ultimate modes are announced, after their selected image state commits. A 100ms coalescing period replaces rapid outdated mode announcements. Mode selection remains cosmetic; risk/strategy are unchanged.
- Symbol announcements require a successful PATCH response containing the actual matching saved symbol mapping. Failed or malformed responses do not announce success.
- Chart/fundamental scanning starts and completes from the existing scanner request and saved response. BUY/SELL directional bias is distinguished from executable opportunities; an unverified directional report never becomes an executed trade. Complete valid chart-reference setups now read the actual entry, SL and TP with grouped decimal prices; explicitly supplied multiple TP targets are supported. Invalid, partial, inverted or out-of-scale levels retain the existing directional notification without fabricated prices. Every full setup is labelled chart reference, not live verified or executed. No prices, confidence or recommendations are generated by speech. Gemini chart analysis is unchanged and no second model request is made for narration.
- Confirmed executions/failures use the existing authenticated real-time execution feed. `success` alone is insufficient: execution requires a ticket and broker return code 10009, with the appropriate OPEN/CLOSE operation. Pending signals, 10008 accepted orders and partial/ambiguous responses are not called executed. New failed records produce a generic safe error. Initial REST history is never replayed as new activity; stale events are ignored. Verified activity-monitor REST errors also announce, excluding execution errors already handled by the execution feed.

The current engine does **not** expose distinct confirmed order-submission, SL/TP modification or broker-trigger-reason events. A queued signal is not a submitted order, and mentor signal SL/TP prices are not proof that client stops were installed. These announcements deliberately remain silent until authoritative events exist. No close is guessed to be a stop-loss/take-profit trigger. This update adds no simulated trading events, new trading strategy or order submission.


### MT5 voice states

Existing `mt5-start` events now announce the real broker/server immediately (or “Connecting to MT5 account” when labels are unavailable). Existing `mt5-unverified` previews announce that live authentication is unavailable, never connected successfully. The typed `mt5-result` announcement contract distinguishes backend-unreachable, authentication-failed and explicitly verified success outcomes. It is ready for a real adapter; the current preview does **not** emit these real outcomes. A preview timer/caught preview error is not mislabelled as a backend or credential failure. No endpoints or MT5 authentication architecture were changed. Formatter and synthetic browser-event tests cover failure categories; no actual MT5 authentication was performed.

## Native service and iOS

`VoiceAnnouncementService` uses cached English voice selection, preferring Enhanced/Natural/Neural English voices and available female voices, and `SpeechSynthesisUtterance` at rate 1.04 with neutral pitch. Quality and gender depend on installed device voices. `voiceschanged` updates the cache without delaying announcements. There is no cloud-audio fetch, generated audio blob or Gemini speech/classification request in the active client.

Announcements call native `speak` synchronously, with three priorities: HIGH (3) bot results, confirmed executions and critical errors; MEDIUM (2) modes/symbols/scanner results; LOW (1) welcome. Higher priority interrupts lower speech; related outdated modes/bot messages are replaced, event identifiers are deduplicated in a bounded session cache, pending jobs are bounded and expire. There is one player and one utterance at a time. Session teardown cancels playback and removes listeners. Background/page-hide clears stale event speech while preserving an unheard welcome; it does not promise background operation.

The initial welcome attempts automatically wherever allowed. If the browser rejects speech, the pending welcome retries inside the earliest existing pointer/touch/key interaction; no new activation button, silent-audio workaround or OS bypass is used. Silent WebKit stalls are bounded, with gesture retry. Restored Home Screen pages resume through `pageshow`; a true reload creates a new session/welcome. Native `speak` dispatch can be immediate, but the requested 100–300ms **audible** target cannot be guaranteed on all devices/voices. Real account/broker acquisition and successful saves must finish before their associated announcement; speech itself adds no backend round trip.

## Files and compatibility

- Added `artifacts/ea-app/src/lib/voice-announcement-service.ts`, `voice-announcement-text.ts` and `hooks/use-voice-announcements.ts`.
- Rewired App and removed the old client `VoiceAssistant.tsx/.css`, `use-voice-assistant.ts`, context voice handle, Settings accordion and scanner replay controls.
- Extended existing `assistant-events.ts`; connected Home symbol-save, `use-trade-executions.ts` WebSocket updates and `TradingActivityMonitor.tsx` verified errors. Existing bot/scanner events and committed image-mode state are reused.
- Added `scripts/tests/voice-announcements.test.mjs`; replaced the old conversational browser flow in `scripts/tests/voice-assistant.browser.mjs` with automatic-announcement coverage.
- Existing backend authenticated assistant endpoints and legacy queue/helper tests are retained for compatibility but are unused by the app's announcements. There are no backend edits in this change. Scanner/auth/licence/credit APIs are unchanged.

## Verification and deployment

Client TypeScript and the production combined Pages build pass. Seven focused announcement test groups cover synchronous native dispatch, priority/interruption, cached English voice, queued group replacement, no network, blocked-speech retry, duplicate suppression, disposal/background behavior and truthful scanner/execution formatting. The actual production-build browser flow passes for two mentor names, blocked welcome and earliest existing gesture, no microphone/chat/cloud calls, successful/failed Start, Stop, persisted symbol responses, real scanner fixture response, real WebSocket pending→confirmed/failure updates, deduplication, rapid modes, reload and unchanged navigation bounds.

Full Node suite: 130 tests, 127 passed, two optional database tests skipped without PGlite, and the same pre-existing activity-monitor wording assertion failure (`Awaiting status`). Both optional PostgreSQL integrations were then explicitly run with PGlite: all six existing assistant/provider/ownership and mode-persistence test groups passed. The isolated setup is described in `docs/ea-mode-images.md`. Browser fixtures mock device speech, API and hardware; measured JS dispatch is not a measured physical speaker latency. Evidence/screenshots are in `work/announcement-tests/` locally.

Deploy the combined Pages frontend (`pnpm run build:pages`) after approval. No API redeployment, database migration, account configuration, new environment variable, dependency or paid service is required for this change. Existing Gemini scanner settings must remain unchanged. Previously configured voice-model variables may remain but are not used for announcements. Some native voices can use vendor processing; no universal offline guarantee is made.

Physical iPhone/iOS 26.5 installed-PWA cold launch, gesture unlock, speaker latency, voice quality, interruptions and true OS suspension/reopening still need manual testing, as do actual broker events against the operational bridge. No manifest/status-bar/service-worker changes were made and no Home Screen reinstall is required by this change. No production data was modified, and nothing was merged/deployed.

## Voice improvement change scope

This follow-up modifies only App startup-completion plumbing, StartupSplash's optional completion callback (no animation timing/styles), the existing announcement hook/service/text/event types, announcement tests and this document. Standard bot/mode/symbol/trade/error announcements remain. Only the four actual visual modes exist; no Auto mode or deactivation state was invented. A legacy complete chart report supports one TP; future explicit numeric or `{price}` takeProfits can be read without inferring targets or changing the analyzer/schema. Native quality remains device-dependent and has not been audibly verified on a physical iPhone. No premium provider configuration, voice API key, migration or additional cost was introduced.
