# Recurring backend outage: evidence and repair

## What is established

No incident-time Render/Neon logs, production metrics or authorized production database connection were available. Read-only probes of Render and Pages health were blocked by this workspace network proxy (`CONNECT tunnel failed, response 403`, HTTP 000); that is not a production HTTP 403 or evidence of backend downtime. A manual deployment restoring service is evidence of recovery after replacing a process, not proof of sleep, OOM, PostgreSQL exhaustion or a frontend cache problem. This PR does not claim the particular production incident has been diagnosed conclusively.

There are three reproduced source-level defects:

1. `lib/db/src/index.ts` constructed a default pg Pool without an `error` listener. The installed pg-pool removes a failed idle client and emits `error`. Without a listener Node terminates. The regression test first demonstrates this fatal behavior in a child process, then disconnects a real pg driver's idle TCP connection and verifies eviction/reconnection with the fix.
2. The installed Drizzle node-postgres adapter (`node-postgres/session.js`, transaction) checks out a client and awaits `BEGIN` **before** its release `try/finally`. A failed BEGIN leaks the checkout. The regression reproduces total=1/idle=0 after a failed BEGIN using the actual adapter and driver. Repeating this against a ten-connection pool can exhaust it. The new outer owner always releases the client, including BEGIN failure, and destroys failed transaction connections. Twelve consecutive BEGIN failures, failed COMMIT/ROLLBACK, application rejection, success and nested savepoints are tested with a one-connection pool. No transaction or trade is replayed.
3. WebSocket close/error cleanup was installed only after asynchronous session/licence verification. Disconnecting during verification could leave a closed socket and cookie in the global connection map. Cleanup now attaches before verification, and a non-open socket is never registered. The test disconnects during delayed authentication and checks the actual map is empty and server listeners are removed on close.

The pg wire tests run against a disposable loopback protocol peer, **not** Neon. They exercise the installed pg and Drizzle implementations, including actual TCP failure and server error messages. They do not simulate all PostgreSQL server semantics or prove Neon availability.

## Changes

- Shared pool: same maximum ten connections, explicit ten-second connection/checkout and idle limits, TCP keepalive. Client query deadline at 65 seconds, with no additional startup GUCs that could be rejected by a transaction pooler. This is a per-query bound; it is not a guarantee that an entire multi-query transaction ends in 65 seconds. Failed transaction connections are discarded; active analyses/credit transactions retain atomic rollback and existing authorization.
- No idle-in-transaction timeout: scanner transactions intentionally hold entitlement locks while awaiting the already-bounded Gemini call. This fix does not prematurely kill those transactions merely because they await the provider.
- Sanitized `database_idle_connection_failed` logging: driver code and total/idle/waiting counts only. Never log the original error, which can contain `err.client` and credentials.
- New read-only `/api/readyz`: single-flight `SELECT 1`, no-store, generic 503 `DATABASE_NOT_READY` on failure; sanitized code/category and counts logged. Existing `/api/healthz` stays liveness-only. Do **not** switch Render's health path to readiness as an automatic workaround: a Neon interruption should not cause restart loops. Readiness is subject to the existing middleware and rate limit; probes should omit cookies.
- Every 60 seconds `backend_lifecycle_sample` logs uptime, RSS/heap/external/array-buffer bytes, event-loop maximum delay, pool counts and the existing signal-worker health. No private request data or account identifiers.
- Fatal exception monitoring logs an event without swallowing the exception or preventing normal fatal termination. No automatic restart code is added.
- SIGTERM/SIGINT stop new worker polls and diagnostics, close WebSockets, drain HTTP then the pool. A 25-second bound only applies after an external shutdown signal. Unknown in-flight trade outcomes continue to use the existing startup reconciliation, not automatic order replay. A pending startup reconciliation cannot restart the worker during shutdown.
- Includes the previously pushed `d6fbf30` startup repair, which is not on main: authenticated startup GETs retry with bounded exponential backoff, the Retry button restarts initialization, lifecycle reconnects are single-flight, an already verified interface survives transient outages, real authentication rejection fails closed, and sanitized frontend/proxy/session diagnostics distinguish failure categories. See `startup-connection-recovery.md`.

## Other paths inspected

- Signal worker has a non-overlapping tick guard, durable signal leases and per-client execution bookkeeping; push worker also has a single-flight guard, leases and bounded outbound requests. MT5 HTTP requests are bounded. Toolkit generation already has a route concurrency guard, a worker-thread deadline and termination. No confirmed unlimited job/thread creation was found.
- Voice memory cache already has a 16 MB/64-record bound, expiry sweep and pending-request deletion. No measured memory leak beyond the WebSocket race is asserted; production memory trends are still required.
- Drizzle's ordinary queries use pool-managed release. Its transaction BEGIN edge was the confirmed checkout leak. Scanner transactions may deliberately occupy clients during Gemini calls; pool saturation must be correlated with traffic before changing pool size or entitlement locking.
- Startup performs its existing additive browser-session migration on a separate connection, with connection/lock/statement limits. Missing schema is distinguished by existing startup diagnostics. No migrations or passwords were changed here.
- Cloudflare uses the same-origin API proxy; backend origin errors, upstream HTML and transport errors have separate codes in the included startup repair. No configured production variable values were available for verification.
- The only app service worker, `push-sw.js`, has no fetch handler and does not intercept/cache app navigation or APIs. Build output has distinct website/client bundles. No evidence supports clearing cookies or resetting sessions as a fix.

## Verification and limits

Run the focused suite:

```sh
node --test scripts/tests/database-pool-recovery.test.mjs scripts/tests/backend-lifecycle.test.mjs scripts/tests/backend-readiness.test.mjs scripts/tests/websocket-startup-cleanup.test.mjs scripts/tests/session-diagnostics.test.mjs scripts/tests/startup-recovery.test.mjs scripts/tests/mobile-loading.test.mjs scripts/tests/pages.test.mjs
```

Run workspace declarations, API/app TypeScript checks, API build and `scripts/build-pages.mjs`. The existing startup browser regression uses the actual built app and cookie/session/licence handlers against disposable PGlite; covers cold/returning starts, backend listener restart, missing session schema restoration, slow/hung requests, offline/online and BFCache/PWA-like reopening. Chromium mobile emulation is not a physical iPhone/WebKit standalone test.

## Production review and next incident

No production settings, schema, sessions, keys or deployments were changed. No new environment variables or database migration is required. After approval, deploy **both Render API and the Cloudflare Pages combined build** because the PR includes the missing frontend/proxy startup repair.

1. Confirm both services deploy the reviewed merge commit; run `node scripts/check-client-startup.mjs` locally. Health and readiness should return 200; anonymous `/api/app/me` must return 401, not a successful private response. Readiness 404 before deployment just means that endpoint is not installed.
2. Leave the app idle past Render's Free-plan sleep interval, then reopen. Capture request timing/status without cookies. Free-plan wake-up latency is a hosting limitation; client retries accommodate it but cannot keep a sleeping process running.
3. At a recurrence, compare health vs readiness and session paths. Health=200/readiness=503 suggests database connectivity/pressure; no health response needs Render Events/build/runtime status. Inspect `database_idle_connection_failed`, `backend_database_not_ready`, `app_startup_backend_failed`, `backend_fatal_exception`, and lifecycle samples around that time.
4. Compare RSS trend to Render's memory limit and check Events for OOM exits/restarts. Compare pool waiting/idle/total to Neon connection/compute metrics; distinguish suspended compute from connection limits or credentials. Use Neon console privately for `pg_stat_activity` if needed, never paste query text, connection URLs or credentials into reports.
5. Match browser diagnostics `window.__eaStartupDiagnostics` to proxy/session error codes. Check real 401 separately from temporary 502/503. Do not log cookies, announcement content, screenshots, passwords or database URLs.
6. Verify on a physical installed iPhone PWA: cold/returning launch, network interruption, background/reopen and automatic recovery, without layout changes or session loss. Production longevity and actual iOS behavior remain unverified until this rollout is approved and observed.

Local results: 34 focused recovery/proxy tests passed; 20 scanner/MT5 safety regression tests passed; all eight real built-app startup browser scenarios passed. Workspace declaration build, API/app TypeScript checks, API production build and combined Pages production build passed. Existing Vite bundle-size/sourcemap warnings remain. No physical iPhone, production soak test or production metrics verification was available.
