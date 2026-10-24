# EA Cloud voice assistant

## Implemented feature

The client has one application-wide, opt-in voice service and one playback queue. Settings → Voice Assistant provides On/Off, neural/device voice, volume, speed, automatic announcements, trading notifications, chart narration, spoken account values, optional device fallback, microphone, typed questions, preview, replay and Stop. Compact controls are visible throughout the client only while voice is enabled. Existing screens, portrait/background modes, navigation and safe-area CSS remain intact.

Voice is **off by default**. Preferences persist per client in `ea-cloud:client:<id>:voice`. The microphone never starts automatically: each press requests a single question, displays permission/listening status, uses non-continuous recognition, and stops/aborts after at most 20 seconds or on Stop, disable, session change, hide/page exit. Where recognition is unavailable/denied, typed questions work. Browser recognition may use the browser/vendor's speech service.

### Event integration

- Welcome uses the current mentor bot name and waits for a permitted interaction. It occurs once per page session, not ordinary tab navigation.
- Start/Stop retain their original PATCH queue and optimistic UI. Speech waits for saved control results, then checks fresh account/engine state. A saved preference alone is explicitly described as unverified; a failed or mismatched write never produces a success announcement.
- MT5 uses the real broker/server entered. The existing credential-free connection preview is still not live authentication; speech says it is an unverified check and never claims that preview connected an account. No password/login/token is included in its speech event.
- Actual connected/disconnected observations, account values and optional verified position counts come from the existing trusted TLS `activity-snapshot` bridge. An unreachable bridge means unknown, not a confirmed disconnect, zero balance or zero positions. Restored connections can announce actual account values only if the user opted into spoken account data.
- Scanner narration reads the actual saved chart/fundamental report, including finite existing levels and its stated reasoning. It explicitly calls chart levels reference observations, not executed trades. Missing values are not invented. The current report's replay fetches that exact owned ID and rechecks scanner access; latest-analysis questions use the latest owned permitted record. Narration does not create a scan or consume scanner credits.
- Normal/Beast/Aggressive/Ultimate announcements wait for the shared image state's committed selection. A 450ms debounce speaks only the settled mode during rapid switches. A missing mode image is described as fallback artwork rather than claiming its missing image activated. Image switching and trading/risk settings are unchanged.
- Trade announcements use the client's own execution records, require success, ticket and broker return code 10009, and notice pending→confirmed transitions. Accepted-but-pending, failed and partial/ambiguous results are not described as completed positions. Close receipts are described as confirmed close orders, without claiming the entire position or a profit. Old history is not replayed automatically.

The refresh timer schedules actual read-only status checks; it does not generate simulated activity. Priority, duplicate suppression, bounded queues/caches, next-chunk prefetch after playback begins, cancellation and reduced OS playback assumptions prevent overlapping streams and excessive chatter. User Stop/disable interrupts immediately, including pending audio requests. Hiding the app cancels microphone/audio and requires a new interaction before playback resumes.

### Two-way scope

Questions about balance, floating P&L, open positions, bot status, committed visual mode and saved analysis use fresh authoritative data. Common intents resolve locally on the server; other natural phrasings use Gemini only to classify an allowlisted read-only intent. Account figures/reports are not included in that classifier prompt; numeric/email fragments in unknown question text are masked. Responses are formatted from actual facts rather than an LLM inventing account values.

The assistant deliberately does not execute trades, start/stop bots, alter risk/settings, make payments or generate new trading advice from voice commands. It directs users to existing controls and explicit confirmation flows. “Stop speaking” interrupts the assistant itself. Unsupported topics are explained rather than answered with fabricated information.

## Technology and privacy

Primary speech: Gemini 2.5 Flash Preview TTS, REST `v1beta/models/...:generateContent`, prebuilt Aoede voice, calm professional delivery. Provider PCM is validated and wrapped as mono 16-bit WAV with the returned sample rate. No new SDK or runtime dependency is added. The existing server-side Gemini key is reused; no key is shipped to the frontend.

Device speech uses SpeechSynthesis only when explicitly selected or fallback is enabled. It prefers an available female English voice and exposes device voice selection; quality/gender/availability depend on installed browser voices and are not guaranteed. It avoids our Google TTS calls, but device/browser services may themselves be remote.

Neural synthesis necessarily sends the spoken transcript to Google. Account figures stay text-only until the separate spoken-account-values option is enabled. Chart narration sends its spoken analysis text, not the private chart image. The UI discloses this before opt-in. Google's listed free-tier data-use policy may allow submitted text to improve its products; confirm the project's terms before enabling customer cloud narration. Microphone recognition has its own browser/vendor permission and processing behavior.

Audio is not saved to PostgreSQL or disk. Server cache is scoped per client/model/voice/transcript hash, bounded to 16MB/64 entries, reusable for five minutes and swept every 30 seconds. Browser object-URL audio cache is per session, bounded to approximately 8.5MB/12 entries, with five-minute reuse TTL and cleanup on session disposal. No raw audio, transcripts, keys, chart images or provider response bodies are logged. Failure logs include only assistant event/category and upstream status. HTTPS/authenticated API paths, persisted account/licence checks, rate limits and existing scanner permissions remain enforced. This feature uses the existing client-session auth architecture; it does not replace it.

## Configuration and cost

Required on the API service:

```text
GEMINI_API_KEY=<existing server-side key>
```

Optional explicit settings (these are the code defaults):

```text
GEMINI_VOICE_MODEL=gemini-2.5-flash-preview-tts
GEMINI_VOICE_NAME=Aoede
GEMINI_ASSISTANT_MODEL=gemini-2.5-flash
```

These do not change scanner model settings. The key/project must actually have access and quota for the chosen TTS/text models. Preview-model availability and regional quotas can change. Configuration/provider failures appear as voice errors; there is no silent switch to a different paid cloud provider. Device fallback is opt-in.

Google currently lists a free tier for 2.5 Flash Preview TTS, subject to project/model quotas. Listed paid prices are $0.50 per million input text tokens and $10 per million output audio tokens; at the documented 25 audio tokens/second, output is approximately $0.015 per spoken minute, plus input. Classification can incur text-model charges for non-local questions. Rates are not a promise of free/unlimited usage; set Google project budgets/quotas appropriate to customer usage.

Official references:

- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts
- https://ai.google.dev/gemini-api/docs/speech-generation
- https://ai.google.dev/gemini-api/docs/pricing

## Backend and deployment

New authenticated client routes:

- POST `/api/app/assistant/speech`: short transcript → neural WAV; abort/timeouts, input validation, private cache.
- POST `/api/app/assistant/intent`: short question → read-only intent; no trading actions.
- GET `/api/app/assistant/facts`: own live account/control data, permitted latest scan and own execution receipts.
- GET `/api/app/assistant/report/:id`: exact owned report, with scanner-entitlement validation.

All require an approved client with an active linked hosting licence. Report reads additionally require scanner access. The voice service never decrements scanner credits. There are no database/schema migrations and no new paid service subscription is required by the code.

After approval, deploy the API build and combined Pages frontend build. Keep existing database/MT5/R2 configuration. Neural Preview voice is a safe first manual test before account speech. The existing external MT5 bridge must be genuinely operational to provide live account values; its `activity-snapshot` response needs verified connected/tradeAllowed flags, account balance/equity/profit/currency, and optional nonnegative integer `positionsCount`. Missing counts remain unavailable. No external MT5 adapter or real order execution is fabricated here.

No merge/deployment has been performed. No Home Screen reinstall is required by these JavaScript/voice changes, although refreshing the installed app may be needed to load the approved deployment. Existing iOS fullscreen behavior is unchanged.

## Verification

Automated checks use isolated data and mocked speech/provider/hardware; no paid API calls or production database/storage access were performed.

- Client/API TypeScript, production Pages build and API build.
- `PGLITE_MODULE=/tmp/ea-mode-pglite/package/dist/index.js node --test scripts/tests/assistant.test.mjs`: factual formatting, null/stale account data, decimal prices, no fabricated levels/executions, provider PCM/WAV request and response validation, per-client audio cache, model/key/quota failures, gesture/priority/dedupe/interrupt/mute/off behavior, microphone/speech exclusion, device voice choice, cancellation/session cleanup, and actual isolated PostgreSQL/Drizzle/Express account/licence/report isolation with unchanged scanner credits. PGlite test engine setup is documented in `docs/ea-mode-images.md`.
- `APP_ORIGIN=http://127.0.0.1:5217 node scripts/tests/voice-assistant.browser.mjs`: two mentor names, opt-in/default-off, first gesture and playback-block retry, account-speech privacy, read-only questions, microphone denial/success and unsupported-recognition typed fallback, confirmed/failed Start/Stop, pending→confirmed execution, dynamic broker/server with honest MT5 result, actual fixture scanner narration/replay, settled mode announcements, preferences/reopening, immediate disable and unchanged navigation bounds. Neural HTTP/audio and microphone APIs are mocked; this is not audible quality or physical hardware verification.
- Full Node suite: 123 tests, 120 passed, two optional PostgreSQL tests skipped without PGLITE_MODULE, and one known pre-existing activity-monitor wording assertion failed (`Awaiting status`). Both optional PostgreSQL integrations were explicitly run and passed; the existing four-mode upload/image-switching browser regression also passed.
- The new assistant test file has five passing groups; the browser flow passed for both mentor names, including reopening and unsupported recognition.

Evidence is in `work/voice-tests/`, including browser results and screenshots. Remaining manual tests: real Aoede quality/pronunciation and provider access/latency/quota on the deployed project, real MT5 account/position/execution data when the external bridge exists, real microphone permissions/audio interruptions, and installed iPhone/iOS 26.5 plus Android/desktop behavior. No uninterrupted background operation is promised when the OS suspends the app.

## Changed-file map

Backend: `lib/assistant-voice.ts`, `routes/assistant.ts`, `routes/index.ts` under `artifacts/api-server/src`.

Client: `lib/assistant-events.ts`, `lib/assistant-text.ts`, `lib/voice-queue.ts`, `hooks/use-voice-assistant.ts`, `components/VoiceAssistant.tsx/.css`; App/AppContext integration; events in use-bot-status, use-visual-modes, MetaTraderTab and ChartScannerModal; Settings accordion entry. Existing trading algorithms and configuration writers are unchanged.

Tests: `scripts/tests/assistant.test.mjs` and `scripts/tests/voice-assistant.browser.mjs`. No package/dependency files changed.
