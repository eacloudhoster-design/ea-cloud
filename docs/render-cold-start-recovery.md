# Render Free cold-start recovery

## Evidence and remaining failure in PR #128

The owner confirmed that the installed PWA showed a service-unavailable screen while Render was waking, that the service later started, and that `/api/readyz` returned `{"status":"ok"}` without a manual deployment. This establishes cold-start latency as a contributor. No incident-time HTTP capture was supplied, so the exact upstream status in that production incident is not claimed.

Inspection of merged `108df78` / PR #128 found:

- `connectionRecovery` scheduled transient retries **and called its failure callback after every attempt**. The session callback immediately set `authStage="error"`; the branding callback immediately set `loadError`. The UI therefore presented a red Retry/error screen even while automatic recovery was still active. It was not evidence that the retry loop had stopped.
- `requestJson` retried 500/502/503/504, but not Cloudflare-origin 520/521/522/523/524/530 errors. Those failures could terminate automatic recovery immediately.
- No overall recovery deadline existed. Conversely, repeated focus, online and polling `recheck()` calls could clear a scheduled backoff and start early requests. A persisted `pageshow` unconditionally restarted initialization.
- Startup correctly used HttpOnly cookies and server-side `/api/app/me` validation. The backend's new database readiness endpoint is diagnostic, not authentication; a 200 from readiness must never grant private access.
- The Pages proxy forwards the original request once and does not retry commands. It returns sanitized errors for unreachable Render and HTML 5xx responses. Client requests already bound both headers and response bodies to 30 seconds during initialization. Cloudflare's platform timeout can arrive sooner, or the client can time out first; both must be recoverable. No extra proxy retry loop is needed.

## Implemented behavior

- Existing single-flight controller retained and extended with explicit connecting/waiting/slow/paused/ready/failed/exhausted states.
- Transient errors update progress and safe diagnostics, not the terminal error callback. The connection screen shows **Connecting to EA Cloud**, then **Still connecting** after 15 seconds. Internal response text is never displayed. Terminal errors are cleared only at explicit Retry/resume boundaries, rather than by a passive progress effect that could overwrite a newer error.
- Each initialization phase has a default **120-second retry scheduling window**, using existing 1/2/4/8/16/30-second backoff and small jitter. Each request still has its existing 30-second bound. One final check may run inside the boundary grace, at 125 seconds, when no request is already active, allowing for the delay between client initialization and the first request actually reaching Render; an outer deadline cancels everything after **at most 130 seconds** (120 + a ten-second boundary grace, shared between transit allowance and the final response). This lets a backend that becomes available at exactly 120 seconds recover. There is no further automatic cycle on a cold/error screen after exhaustion.
- Optional Cloudflare **build-time** variable `VITE_STARTUP_RECOVERY_WINDOW_MS` configures the per-phase scheduling window from 30000 to 300000 milliseconds. Invalid/missing values use 120000. Total ceiling is that value plus ten seconds. No environment change is required and no Render variable was modified. Session and mentor configuration are separate, sequential phases; this is not a single total deadline for all artwork/loading work.
- An exhausted window shows Retry. Retry cancels the old generation and starts a fresh bounded cycle. Focus/online spam cannot restart an exhausted cold-start cycle or bypass an active backoff. Retry-After is respected within the bounded cycle; if it extends beyond the final check, the cycle exhausts rather than probing early.
- Offline, pagehide and hidden-document states abort stale work and stop retry timers. Online/visible/pageshow resumes one fresh cycle only if paused. Concurrent lifecycle events share the same request. Background time does not consume a new foreground recovery window. Genuine lifecycle reopen is different from repeatedly focusing an already visible error screen.
- While mentor configuration is initializing, lifecycle checks resume that phase instead of starting another session retry loop. Existing authenticated Home remains mounted during outages. Its pre-existing 20-second foreground security validation is preserved, including checking again after an exhausted background validation; no new periodic keep-alive traffic is introduced.
- All HTTP 5xx and existing 408/425/429 transport failures can retry, except known permanent configuration errors. Database readiness/session-storage errors have a distinct safe `database` diagnostic category. Confirmed 401 still removes private access; 403/configuration errors remain terminal. Passwords, cookies, session tokens and database credentials are unchanged.
- Startup animation artwork, cloud outline, eye effects, duration, CSS, dimensions and normal handoff are unchanged. Connection text occupies a separate bottom-safe-area slot without moving the mark or Home. Bounded fallbacks handle stalled image decode and a missing animationend event so an otherwise recovered app cannot remain trapped behind the startup layer. No unrelated interface styles changed.

The UI cannot conclusively distinguish a sleeping Render instance from an unreachable/restarting backend based on a generic gateway error. It uses honest connection language; sanitized diagnostics distinguish network/timeout/upstream status, database, configuration and authentication. It does not claim Render is waking without evidence.

## Files

Application:

- `artifacts/ea-app/src/lib/connection-recovery.ts`
- `artifacts/ea-app/src/hooks/use-startup-request.ts`
- `artifacts/ea-app/src/lib/request.ts`
- `artifacts/ea-app/src/lib/startup-diagnostics.ts`
- `artifacts/ea-app/src/App.tsx`
- `artifacts/ea-app/src/components/StartupConnectionStatus.tsx` (new connection-only copy)
- `artifacts/ea-app/src/components/StartupSplash.tsx` (status slot and nonvisual safety bounds)

Regression tests:

- `scripts/tests/cold-start-recovery.test.mjs`
- `scripts/tests/startup-recovery.test.mjs`
- `scripts/tests/mobile-loading.test.mjs`
- `scripts/tests/startup-recovery.browser.mjs`
- `scripts/tests/startup-recovery-presentation.browser.mjs`
- `scripts/tests/startup-animation.browser.mjs` (terminal-error fixture uses 403; transient 503 belongs to the cold-start suite)

This document is the only other file. No backend, proxy, database, trading engine, scanner execution, account, service-worker or manifest code was changed.

## Verification

The deterministic controller tests simulate delayed responses, outages at 30/60/90/120 seconds, held requests, expired authentication, permanent configuration errors, offline/background cancellation, concurrent rechecks, exhausted windows and fresh Retry. The pg-pool, lifecycle, readiness, WebSocket and Pages proxy tests from PR #128 also run unchanged.

The browser suite uses the **real production client build**, real cookie/session/licence route handlers and disposable PGlite. Its virtual browser clock accelerates 30/60/90/120-second HTTP 522 outages. Assertions check visible connection text, no premature Retry, bounded request counts, unchanged cookies, eventual Home, and no automatic authentication/trade mutations. Existing scenarios check actual local HTTP listener restart, missing-session-schema recovery, 30-second hung requests, offline/online, BFCache-like reopening, true session expiry and unchanged verified Home/navigation geometry. A permanently unavailable backend exhausts, ignores focus spam, then recovers through Retry with the same cookie.

A separate real component browser check suppresses image decoding and animationend, confirms the startup mark stays centered at 390x844, and verifies the recovered interface is revealed by the safety bounds.

Screenshots/results are generated under ignored/untracked `work/startup-recovery/`, not committed. Test fixture credentials and local cookie values are never production credentials.

## Rollout and limits

No merge or deployment has been performed. After approval, deploy the standard **Cloudflare Pages combined build** from this PR's merge commit. The Render API from PR #128 needs no change for this frontend-only repair. Optional recovery configuration belongs to Pages build variables and requires a rebuild. No migration, password reset, paid plan, push-key change or PWA reinstall is required.

The existing push-only service worker has no fetch handler and does not cache startup/API responses; request no-store and existing Pages HTML/cache settings remain intact. Reopen the installed PWA to load the newly deployed assets, then confirm the expected Pages build commit.

Physical installed iPhone/WebKit testing and a real Render Free sleep/wake cycle remain required. Chromium emulation, a virtual clock and disposable local PostgreSQL are not a production soak test. Production hosts remain blocked by this workspace's network policy, so no new live production status or specific Render cold-start duration is claimed. During acceptance, leave Render to sleep naturally, reopen the app, observe connection status and automatic Home recovery, then correlate safe browser diagnostics with Render Events and `/api/readyz`. Do not add keep-alive pings or automatically restart Render.

Local verification results: **43 focused tests passed**, **20 scanner/MT5 safety tests passed**, and **all 13 production-build startup browser scenarios passed**. The presentation guard test passed. Existing standalone, terminal authorization failure and reduced-motion animation scenarios passed with normal presentation durations of approximately 4.8–5.2 seconds. App/API TypeScript checks, API production build and combined Pages production build passed; existing Vite bundle-size/sourcemap warnings remain. No physical iPhone or live production wake test was performed.
