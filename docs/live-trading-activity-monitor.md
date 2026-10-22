# Live Trading Activity Monitor

## Actual integration

The existing app mounts one persistent monitor beside its navigation. The circular bottom-right trigger uses the linked mentor's uploaded robot artwork (existing bundled robot fallback, never the EA Cloud logo), appears above mobile navigation and opens a crimson glass activity panel. The panel uses the existing EA name, account currency, conditional engine/robot badges, P&L colour, scrollable chronological events and “Powered by EA Cloud”. No home/scanner/navigation layout is redesigned.

Only manual trigger clicks or explicit scanner Execute/Confirm actions open it. Mentor/connection/background updates refresh data without opening it. Closing the monitor changes its local open state only; it does not abort scanner confirmation, stop copying, disconnect MT5 or unmount the live subscription. Refreshing does not close it. Signing out clears its state.

The authenticated existing WebSocket transport sends invalidation hints; the monitor never trusts those frames as account/trade data. It reauthorizes every REST read. A five-second authorized history poll provides fallback when WebSockets are unavailable (including hosts without WS proxying), with visibility pausing, bounded timeouts and teardown on session change. In-flight invalidations are coalesced. Account snapshots refresh about every 20 seconds, with 15-second server caching to avoid repeatedly logging into the shared terminal; values/status expire on the client. This is periodic live account sampling, not streaming every tick. Recent snapshots show their currency; unknown/stale amounts are dashes, never zero/sample values.

Engine green requires a running queue worker with a recent successful DB poll, copying enabled, a freshly verified connected MT5 account and account trade permission. A running/stored UI toggle alone cannot produce green. Robot waiting/stopped and disconnected/unconfirmed states remain distinct. Worker instrumentation only observes the existing poll; it does not change queue ordering, strategy, sizing, retry or order placement.

## Backend sources and persistence

- New `/api/app/activity` GET returns only approved authenticated client's last 100 durable monitor events, chronologically, with fallback to that same client's existing copy-execution records. No raw VPS response, credential or other client's execution is returned. Query/body client IDs cannot override the resolved account.
- `/api/app/activity/snapshot` GET uses existing encrypted per-client account credentials via the existing TLS/token read-only bridge. It returns verified account balance/equity/floating profit/currency, trade permission and exact configured-symbol availability. It checks current mentor pair names with the client's selected broker spelling and includes the latest owned scanner symbol. It never guesses that XAUUSD/GOLD/XAUUSDm are interchangeable. Symbols are capped at 20.
- `/api/app/activity/scanner-review` POST accepts only an owned scan UUID and persists the actual user review action and stored signal values. It cannot place an order or grant scanner access.
- Copy engine's existing `pushUpdate` now records best-effort observations asynchronously after existing execution writes/broadcasts. Signal prices, mentor name, requested volume, action/kind and ticket/retcode are taken from actual server records. Monitoring failures never alter engine decisions or order results. Existing copy records backfill the view if new event observation is unavailable; no production history is rewritten.
- Existing scanner confirmation records actual owned execution requests and the short backend rejection reason. A future sender can emit per-position events only through the existing strict, matching, ticket-backed broker receipt. Current scanner sender is absent: no success is fabricated.
- Connection, worker, robot-toggle and symbol-state observations are persisted when their fingerprint changes. Account balances are sampled directly, not logged on every poll. Password/token-style error fields are redacted. No raw broker bodies or private chart images are stored by this feature.

Existing copy success without both a ticket and accepted retcode is displayed as requiring reconciliation. OPEN/CLOSE/MODIFY broker acceptance is not falsely described as a verified opened/fully closed position. The existing execution feed cannot independently prove final position state or exact partial-close fills. A full per-position reconciliation feed, authoritative filled quantities and broker rejection reasons for a future scanner sender remain dependencies. Request/confirmation and existing copy results are operational integrations; those missing position facts are not simulated.

## Required database migration — NOT applied here

Apply the additive SQL **once before deploying** the new API:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/20261022-trading-activity.sql
```

It creates only `trading_activity` and its client/time index. It does not reset/backfill/overwrite users, licences, scanner reports, credits, trading records or settings. Do not use schema reset or force-push commands. Verify the new table/index on your PostgreSQL deployment after applying it. This workspace has no PostgreSQL/Render credentials: the production migration has **not** been applied or verified. If missing, history returns an explicit unavailable response; observation writes fail safely without stopping trading.

The table stores recent history durably across refresh/restart; reads are bounded to 100 events. No automatic deletion policy is introduced, so administrators should plan a retention/archive policy for long-running deployments.

## Deployment

1. Review/apply the additive PostgreSQL migration above.
2. Deploy the updated Windows MT5 service with `scanner_api.py` and the existing `main.py` registration. The new authenticated read-only `/scanner/activity-snapshot` verifies login/server identity under the existing MT5 lock, reads account_info/terminal_info and checks exact symbol_info. It never calls order_send.
3. Set/retain a matching `SCANNER_MT5_VPS_TOKEN` (at least 32 characters) on Windows and Render; `SCANNER_MT5_VPS_URL` on Render must point to that service through trusted HTTPS. These reuse the current read-only scanner bridge, not another execution engine. Keep existing encrypted account credentials and encryption key.
4. Deploy the Render API and combined Cloudflare Pages frontend. Preserve all existing auth/database/Gemini/licence settings. No paid services or new execution provider are added. The existing `/api/ws` must be proxied for immediate invalidations; polling continues if it is not.
5. On a real approved client, verify actual account values/currency, exact configured broker symbols and the worker/toggle states. Open/close manually; check scanner review/confirmation auto-opens, a mentor event does not, and closing the monitor leaves copying/confirmation alone. Verify saved activity after refresh and isolation using a second real account. Exercise real copy OPEN/MODIFY/CLOSE and failures before treating those live outcomes as verified.

Nothing was merged, deployed or applied to production by this task. Real scanner trading remains unavailable until its durable sender, verified sessions, final broker/margin validation, idempotency ledger and reconciliation exist. Configuring the read-only bridge does not enable orders.

## Verification scope

New isolated tests exercise actual activity REST router authentication, approval, client/history isolation, owned scanner review, account/currency/symbol snapshots, no false ticketless success and engine health derived from a recent successful poll. Actual React SSR verifies the signed-in robot trigger starts closed/waiting, uses mentor artwork and renders nothing signed out. Python tests call the actual authenticated snapshot endpoint with an isolated MT5 adapter, asserting identity/currency/exact symbols and no order sends. Existing scanner confirmation and execution tests remain.

These use fixture accounts/MT5 responses, not production trades. Interactive manual/automatic opening, closing during a live request, measured mobile/desktop rendering and real broker/account validation remain **staging acceptance work**. The workspace's Chromium startup is blocked (setsockopt Operation not permitted / SIGTRAP), and it has no Gemini/PostgreSQL/Render secrets or authenticated production client. No visual inspection, live broker execution or production readiness is claimed.

## Files

New: `TradingActivityMonitor.tsx/.css`, client `lib/activity-monitor.ts`, API `routes/trading-activity.ts` and `lib/trading-activity.ts`, shared activity types, DB schema/migration, activity API/SSR tests and this deployment report.

Integration-only edits: `App.tsx` mounts the widget; `ScannerTradeAction.tsx` dispatches explicit user opens; `scanner-trading.ts` observes real requests/results; `copy-engine.ts` observes existing pushes; `signal-worker.ts` exposes read-only health; `scanner-mt5.ts` permits the new read-only path; API/DB index files register routes/schema; receipt schema allows an optional broker rejection reason; Python service adds read-only snapshot plus tests. Existing isolated scanner route tests inject the observer so their fixtures remain independent of monitor storage. No existing scanner styling, navigation, order parameters or trade-sizing rules changed.

Validation completed in this workspace: 95 Node tests, 4 MT5-service Python tests, shared/API/mobile/portal TypeScript checks, API production build and combined Pages build/output verification passed. Existing build warnings remain. No live database migration, Windows deployment, real account/position test or browser visual acceptance was performed.
