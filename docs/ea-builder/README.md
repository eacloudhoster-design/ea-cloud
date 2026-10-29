# Mentor Setup Methods: reviewed integration infrastructure

## Status and explicit scope

This branch redesigns **Mentor Portal → Setup Methods** with CREATE EA and COPY TRADE options. It supplies a separately usable **capture-only integration toolkit**, NOT a finished SMC Blueprint trading EA. Trading generation is blocked server-side with HTTP 409 `ORIGINAL_STRATEGY_REQUIRED`; it creates no credential/robot row. No original strategy has been reconstructed or invented. No startup order, ForceSignal entry, MagicNumber change, or client trade execution is introduced.

The complete Quasimodo source was not found in checked-in files or available Git history searched (`git log --all -S Quasimodo`, Blueprint/Quasimodo commit-message searches, MQ5/MQH historical/file searches). The reference ends inside `CreateLabel(...)`; its strategy and `g_fireOnLoad` behavior cannot be verified. MetaEditor/MT5 is not installed here. Compilation, native MT5 chart behavior and real broker operation remain unverified. Supply the original complete MQ5 plus dependencies to unblock actual trading-template validation and generation.

## Repository audit

| Existing component | Reused/preserved behavior | Material limit found |
| --- | --- | --- |
| `routes/copier.ts` | Existing personalised MQ5 download stays at `/api/admin/copier/download`, unchanged | Uses mentor API credential; source is readable. Synchronous sends in trade callback; no durable source outbox; no source-event idempotency key; `DEAL_ENTRY_INOUT` ignored; position-only SL/TP transaction handling absent. Legacy MQL compilation has not been verified. |
| `routes/trade-signals.ts` | Actual live ingestion: `/api/signals/webhook`, authenticated by hashed mentor `X-API-Key` | New receipt inserted on each request; no source-event uniqueness. New capture tokens cannot authenticate as those keys. |
| `routes/mt5-validation.ts` and `mt5-accounts` schema | Existing challenge/register/heartbeat, whitelist and verified-account status remain available via existing account panel | A configured URL or source login string is not proof of account ownership. New capture sources are explicitly self-reported, not verified. |
| `lib/signal-worker.ts` | Durable existing mentor-ordered execution queue unchanged | Signal-level retry/idempotency does not deduplicate duplicate incoming source events. |
| `lib/copy-engine.ts` | Existing mentor relationship, approved subscriber selection, enabled-bot/MT5/settings checks, broker-symbol remap and client-ticket lookup untouched | Current CLOSE call omits partial-close volume even though VPS accepts it, so cannot safely map all raw deal events. Netting additions/reversals and stronger source-account/position identity require reconciliation. Licensing/client authorization must be reviewed before any new execution path. |
| `vps-mt5-service/main.py` | Existing order/modify/close execution, broker volume constraints and result acknowledgements untouched | Not called by the new toolkit; no broker test or latency guarantee made. |
| `Profile`, `EA Manager`, authentication | Existing profile names/EAs reused; actual cookie principal + approved DB owner authorizes builds | Freely editable EA Manager/name text never determines identity, credential ownership, routing, or permissions. |

The supplied legacy Replit URL and hardcoded CopyTradingID are not reused. The UUID is not an authentication credential or verified mentor identity. The production origin supplied by the user is `https://eacloudhoster.online`; Pages proxies `/api/*` to the existing Render backend. Route existence is verified in source; production HTTP reachability is not tested here.

## What is implemented

- Responsive black/red Setup Methods page, profile-prefilled EA/manager names, existing owned-EA selector, replace/remove image preview, validation, actual request/loading/error/download states, copyable WebRequest origin, downloadable existing copier and accurate guide. Old simulated successful connection log is removed; existing verified-account panel remains intact.
- Server-validated PNG/JPEG/uncompressed 24/32-bit BMP, 10MiB size limit, maximum 8192px per side/12MP before decode, JPEG memory limit, resize to maximum 1920px per side and opaque 24-bit bottom-up BI_RGB output with padded rows. Unsupported/malformed/truncated images fail without creating a robot. No mobile background changes. Package builds are serialized per API process in a bounded 30-second worker thread, keeping CPU image/ZIP processing off the existing API/trading event loop. The API build emits `ea-builder-worker.mjs` alongside `index.mjs`; deploy the complete dist directory.
- Display name separate from sanitized ASCII filename (path traversal, controls, Windows reserved names, Unicode fallback and length handled). Generated MQL string literals are escaped; arbitrary source-code/strategy uploads are not accepted. Manifest records the reference input defaults as a contract, never executable replacement conditions.
- ZIP with an explicitly named `_Observer.mq5`, `EACloudBroadcast.mqh`, optional background include/BMP and exact installation guide. Resources go under `MQL5/Images/EACloud/<robot UUID>/MT5_Background.bmp` before compiling; source/includes stay together under `MQL5/Experts/<safe name>/`. No empty bitmap when none is supplied. Background code uses a compiled image resource, bitmap label and chart-change resizing; excludes selection and removes owned objects/resources on detach. This implementation is text-reviewed, not MetaEditor-verified.
- Unique random robot UUID and 256-bit capture-only token. Store only its SHA-256 digest; never expose digest/token in list/history or logs. The plaintext token is delivered only inside the no-store ZIP. It is readable by the recipient, limited to capture/heartbeat, and owner-revocable. It is not an administrator/mentor API key. Do not share the ZIP/source.
- Actual transaction module observes confirmed BUY/SELL deals (IN/OUT/OUT_BY/INOUT), IDs/volume/price/SL/TP/time, account margin mode and explicit position changes. No order placement or trade execution API calls. It observes the account, not an unverified strategy's eligibility filter. A missing original strategy means no integrated trading EA can be distributed.
- Bounded 256-item terminal-file outbox, timer-only WebRequest, 2-second timeout, exponential backoff capped at 30 seconds and matching-event acknowledgements. Persist/replace failures and queue overflow are reported. Retained outbox can resume after restart; disk loss/crash/overflow still require history reconciliation. No unlimited/durable-exactly-once guarantee. A synchronous timer still blocks that EA's event loop while waiting: do not splice into a real strategy before timing tests.
- `/api/robots/heartbeat` and `/api/robots/events` authenticate `X-EA-Robot-Token`. Only approved mentor/owner credentials are accepted. First event binds the credential to its self-reported account/server. Later account changes are rejected. Typed strict event schema rejects invented execution/mentor fields and invalid IDs/numbers. Invalid or failed orders do not become executable signals.
- Transactional capture receipts with unique `(mentor, account, server, eventId)` index. Identical retries acknowledge without a second row; conflicting payloads return 409; revocation serializes against the credential row lock. Stable deal IDs also deduplicate equivalent observer deal events, but position snapshots across multiple observers may differ; run only one broadcaster per account unless separately reconciled.
- Owner-only robot list, event history, acknowledgement times and revocation. UI never labels configured URLs as Connected or captures as copied trades. Heartbeat/receipt responses explicitly include `execution:false`.

**The new path never inserts `trade_signals`, wakes the live worker, calls VPS execution, or routes to clients for execution.** Feeding raw partial closes/reversals into the existing path would be incorrect. Capture and package infrastructure are independently testable now; live distribution requires the missing verified strategy plus lifecycle/deduplication/authorization work and real demo-broker tests. The existing live copier/execution system remains unchanged; it is not represented as meeting every new requirement.

## API surface

- `GET /api/admin/ea-builder/config`: approved portal identity; source/blocker and known routes.
- `POST /api/admin/ea-builder/package`: multipart `eaId`, `name`, `managerName`, `purpose` (`trading` or `integration-toolkit`), optional `background`. Trading is blocked. Toolkit builds require an owned EA. Generates archive before credential insertion; response is no-store.
- `GET /api/admin/ea-builder/robots`: own metadata (up to 100); no credentials.
- `GET /api/admin/ea-builder/robots/:id/events`: own latest 20 capture receipts; `execution:false`.
- `DELETE /api/admin/ea-builder/robots/:id`: revoke own capture credential; does not change existing account/API credentials or trades.
- `POST /api/robots/heartbeat`, `POST /api/robots/events`: restricted capture credential only, with existing rate limits; no browser identity hint authentication.

New schema/migration: `robot_builds`, `robot_events`. No updates/deletions of existing account, session, trade or licensing data. New metadata foreign keys cascade only when the operator uses an existing EA/account deletion flow, preserving that flow instead of blocking it; associated new capture records are then removed. The migration is retryable and is **not** added to the startup migration runner. Capture data retention is currently manual; define an approved retention policy before prolonged capture on a limited database plan.

## Tests and verification

- `node scripts/tests/ea-builder.test.mjs`: image formats/headers/stride, malicious/oversized/decompression-dimension inputs, filename/source escaping, archive contents/resource paths, truthful strategy manifest/guide, no invented order functions/startup trades, timer-only network placement, strict event contract.
- `PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/tests/ea-builder-api.test.mjs`: actual cookie-session middleware/DB, migration retry, owner permission, blocked trading/no phantom registration, malformed image rejection, private ZIP, metadata secrecy, legacy copier download, capture auth/binding/replay/conflict, raw partial/reversal/SLTP records, event tenant isolation and revocation. Disposable PostgreSQL only.
- `scripts/tests/ea-builder.browser.mjs` with local `APP_ORIGIN` and `PLAYWRIGHT_MODULE`: 360/390/1280px, profile prefill, owned EA selection, form validation, strategy-blocking response, preview/remove, toolkit/legacy/guide downloads, truthful status and no horizontal overflow. API responses are fixtures.
- Existing persistent browser-session regression suite, libraries/backend/frontend TypeScript, API and combined Pages production builds; confirm existing copier/ingestion/worker/engine/VPS files have no diff.
- No actual MT5/MetaEditor compilation, strategy/backtest, broker account, live copying, native iOS/Android PWA or production deployment verified.

## Activation: requires separate explicit approval

Do not merge/deploy/restart or run production SQL automatically. Review the new migration and verify a restorable database backup first. Previous session risks concerning backup/credential recovery must be resolved by the operator; no production secret is read or changed here.

1. Review this draft and the source/lifecycle blockers. This release can activate only the capture-toolkit foundation, never a completed trading-EA system.
2. With explicit database approval, open the existing provider SQL editor (the configured Neon database in this session), select the correct database, and run the reviewed contents of `docs/migrations/20261030-robot-builds.sql`. This uses no paid Render Shell and exposes no connection URL. Do not change the browser-session startup runner or reset/recreate any database. A backup/recovery point must be verified first.
3. With deployment approval, build/redeploy Render API using its existing commands and frozen pnpm lockfile. No new environment values or service are required. Backend build: `pnpm --filter @workspace/api-server build`. Preserve the existing browser-session migration/start command. Do not restart Windows MT5/VPS services for this capture-only feature.
4. Deploy the same reviewed frontend commit through existing Cloudflare Pages (`pnpm run build:pages`, output `artifacts/ea-cloud/dist`). Do not change R2, BACKEND_ORIGIN or custom-domain configuration.
5. Verify approved mentor ownership, blocker on CREATE MY EA, image conversion/archive/resources, private downloads, per-robot revocation and heartbeat on a disposable demo-only MT5 installation. Compile with actual MetaEditor F7. Test outbox loss/restart, malformed/replayed/conflicting events and limits. Check real acknowledgements and recent history; do not confuse them with source proof/client execution.
6. Separately obtain the full working SMC Blueprint EA and dependencies. Verify all trading inputs/conditions and `g_fireOnLoad`; integrate hooks once, validate partial/netting/hedging mapping and broker constraints, provision a correctly authorized executable route with source-event/client-execution idempotency and acknowledgements, then demo-test end to end before requesting live trading approval. Until then leave the blocking response and execution separation intact.

Rollback: revert frontend/API feature commits, revoke unused capture credentials before reverting if approved, and retain new tables/files for investigation. Do not drop existing tables or rotate unrelated keys. Existing legacy copier and execution routes were not modified.

## Changed-file inventory

- `artifacts/api-server/build.mjs`
- `artifacts/api-server/package.json`
- `artifacts/api-server/src/ea-builder-worker.ts`
- `artifacts/api-server/src/lib/ea-builder/contracts.ts`
- `artifacts/api-server/src/lib/ea-builder/image-types.d.ts`
- `artifacts/api-server/src/lib/ea-builder/image.ts`
- `artifacts/api-server/src/lib/ea-builder/mql.ts`
- `artifacts/api-server/src/lib/ea-builder/package.ts`
- `artifacts/api-server/src/lib/ea-builder/worker.ts`
- `artifacts/api-server/src/lib/logger.ts`
- `artifacts/api-server/src/routes/ea-builder.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/ea-cloud/src/pages/admin/SetupMethod.css`
- `artifacts/ea-cloud/src/pages/admin/SetupMethod.tsx`
- `docs/ea-builder/README.md`
- `docs/migrations/20261030-robot-builds.sql`
- `lib/db/src/schema/index.ts`
- `lib/db/src/schema/robot-builds.ts`
- `pnpm-lock.yaml`
- `scripts/tests/ea-builder-api.test.mjs`
- `scripts/tests/ea-builder.browser.mjs`
- `scripts/tests/ea-builder.test.mjs`
