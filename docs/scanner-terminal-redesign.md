# Mentor-branded scanner terminal

## Implementation

The existing ChartScannerModal, result component, trade settings and history remain in place. The scanner now uses the linked mentor's existing robotName/EA-name context in its header, and the existing mentor-uploaded image in both header and scan orb. No SMC name is hardcoded. The current database has **no distinct EA-logo column**: backgroundImageUrl is the sole mentor branding upload and already serves as Home's avatar. This change reuses that source and preserves the background. Missing or broken images show a neutral scan emblem, never a platform logo. If a separate logo upload is desired later it needs its own explicit product/data contract; none is fabricated here.

Visible provider badges and generic scanner title are removed. Google Gemini remains named in the pre-upload disclosure and privacy footer because charts are sent to that provider. Backend credentials remain server-side.

The glass/crimson/black treatment, luminous borders, compact status pill, directional BUY/SELL color, price cards and emerald action retain the existing navigation and mentor background. XAUUSD uses the gold icon; FX, crypto and recognized indices use compact corresponding indicators. The main reasoning is limited to 80 displayed words, with structure and entry excerpts; the full original report, confidence basis, risks and limitations remain expandable. New prompts target a 40–80 word summary and concise sections without changing the validated field contract.

History now includes symbol/direction, timeframe, entry, confidence and timestamp. Opening a saved report explicitly marks it historical and disables preflight/review through that view. It displays original stored prices without rewriting records. A fresh chart must be scanned before considering live trading.

Trade review adds symbol/direction, chart/proposed levels, R:R, quantities, account-verification status and an explicit monetary-risk unavailable state. It does not invent an account number, account-currency risk or connected state: the current preflight contract exposes broker-check status, not a verified account display identity or tick-value risk calculation. Those require additional real bridge data. Final submission remains disabled. Existing market/limit classification, quote/risk/broker checks, explicit confirmation boundary and zero-order execute endpoint are preserved.

## Upload behavior

The client detects JPEG, PNG, WebP and HEIF/HEIC signatures from bounded header bytes, rejects SVG/HTML and invalid signatures, limits original size to 10 MB and decoded images to 40 megapixels, applies browser EXIF orientation and converts to a metadata-free JPEG of at most 1600 pixels on the longest edge / 2 MB. Native ImageBitmap is preferred; HTMLImageElement decoding is used when necessary with a 15-second timeout and revoked object URLs. Decoded bitmaps are closed. No external conversion service or paid dependency is added.

HEIC is supported **where the browser has a native HEIC decoder** (including applicable Safari versions). Unsupported browsers receive a specific JPEG/PNG export instruction, not a fake successful conversion. A universal bundled HEIC codec is not included. The backend still accepts only validated PNG/JPEG/WebP; HEIC never reaches Gemini unconverted.

The prompt recognizes MT5 desktop/mobile, TradingView desktop/mobile and other recognizable candlestick layouts. It does not assume one chart layout. Existing visible-scale, numerical, direction and precision validation from the chart-level fix remains unchanged. See scanner-chart-levels.md for normalized/persisted diagnostics. No schema migration, database writes outside the existing authorized scan flow, credit-policy change, entitlement change or licence change is included.

## Preview and tests

Generate a self-contained working review file from the actual components:

```sh
node scripts/preview-scanner-terminal.mjs
```

Open `work/scanner-terminal-preview/index.html` in a browser. Its toolbar switches ready, BUY, SELL, historical and confirmation views. It uses an existing repository background and conspicuously marked illustrative data. Strategy controls, settings and expandable details use the real components; production analysis/order network calls are disabled in this harness only. No production auth or scanner validation is bypassed. The harness is not imported by the app. Build Pages first to include the latest compiled global styles in the artifact.

New tests cover mentor names/images/fallbacks, disclosure preservation, image signatures/spoof rejection/size/orientation/conversion, original historical price rendering, expandable analysis, and confirmation with honest unavailable account/risk states. Existing integration tests still trace prices through the provider adapter, normalization, saved JSON, history and actual frontend. Existing market/limit, stale quote, disconnected/session, invalid levels and credit rollback tests remain.

Limitations: Chromium launch is blocked by the current workspace, so no fresh browser screenshot or measured mobile layout test is claimed. The preview includes responsive 360px rules and can be reviewed at mobile widths, but requires browser approval. There are no configured Gemini/PostgreSQL/Render secrets or authenticated client session here; real representative MT5/TradingView image interpretation, browser-native HEIC on target devices and real quote/execution verification remain staging acceptance work. Test fixtures are not live market signals.

## Deployment

After review, deploy the combined Cloudflare Pages frontend and Render API (platform-agnostic/concise prompt). Existing Gemini/model, authentication, database and subscription environment settings remain unchanged. No new environment variables, migrations, resets or paid services. Existing null history remains unchanged. PR #16's evidence-backed chart-level correction is a prerequisite (already merged when this branch was published).

Live MT5 remains a separate integration: deploy/configure the existing authenticated HTTPS quote bridge with exact saved account/server/symbol and dedicated SCANNER_MT5_VPS_URL/TOKEN, then implement verified session data and a durable idempotent sender/reconciliation flow before enabling actual submission. Account display identity and tick-value/account-currency risk calculation are also not yet in the preflight response. This redesign neither enables live trading nor claims an executed order. Nothing has been merged or deployed by this task.

Validation completed: 88 Node tests and 3 Python bridge tests passed; shared-library/API/mobile/portal TypeScript checks passed; API production and combined Pages builds passed. The self-contained preview bundle builds and its JavaScript parses. Existing build chunk-size/sourcemap warnings remain. Browser screenshots, measured responsive layout, native target-device HEIC and real Gemini/MT5 calls remain unverified as described above.
