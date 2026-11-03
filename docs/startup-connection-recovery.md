# Client startup failure investigation and repair

## Evidence and limits

Review baseline: `086310a` on main. This task does not prove that this exact revision is currently deployed to Pages and Render.

The reported wording, **“The service is unavailable. Please retry.”**, is emitted by the baseline `artifacts/ea-app/src/lib/request.ts` for **every non-401 HTTP failure**. During initialization the callers are `/api/app/me` and `/api/app/dashboard`. Both failures can enter the existing black error view with its red Retry button. The text alone cannot distinguish their paths, status, database failure, proxy configuration or Render availability.

Confirmed defects in that baseline:

1. Session and mentor startup reads are single attempts with a 20-second timeout and no automatic backoff/recovery. A temporary 500/502/503 leaves the application in the error view until a successful manual action.
2. Persisted `pageshow` and cross-tab restoration call blocking session validation. It sets `authStage=loading` even for an already verified app, disabling its hooks and replacing the interface; a temporary outage then strands the returning user on the error view.
3. HTTP status/cause distinctions and useful correlation metadata are lost in the generic message. Session database errors deliberately return 503 without deleting cookies, but the caller does not identify them.
4. There is no React startup error boundary to distinguish rendering failures and offer a controlled initialization restart.

**Correction of an earlier workspace finding:** an older local branch still looked up `appClientToken` on Retry, although the cookie migration removes that key. Current main already uses `validateToken("")`; it does **not** have that obsolete Retry implementation. This repair retains cookie-only verification and makes Retry restart the new cancellable request controller. It does not claim to fix the old key regression on current main.

Production observations are unavailable. The owner reported no Render logs. Read-only probes to public Pages health, Render health, anonymous session and build metadata were blocked by this workspace's outbound proxy with `CONNECT tunnel failed, response 403` and HTTP `000`. That is a tool-network denial, **not an observed 403 from EA Cloud**. No production credentials are available here. Therefore sleeping/restarting/crashing Render, an absent session migration, database downtime, an incorrect BACKEND_ORIGIN and a Pages/API deployment mismatch remain hypotheses until actual production responses/logs distinguish them.

## Startup trace

- The HTML first-paint artwork and `StartupSplash` mount; their layout, CSS, timing, cloud outline and independent eyes are unchanged.
- The browser asks `/api/app/me` using its persistent HttpOnly cookie. Legacy localStorage identity strings are not credentials and are not restored as a workaround.
- Cloudflare's existing same-origin `/api/*` function validates BACKEND_ORIGIN and forwards the cookie/request to the existing API. No API base URL or environment value was changed.
- `browserSessionMiddleware` hashes/verifies the cookie against `browser_sessions`, checks its account/password hash/expiry and injects the internal identity only after verification. `/app/me` rechecks authoritative account/licence access. Missing cookies/expired/revoked access return 401, while unavailable verification stays a service error.
- Approved, licensed users load `/api/app/dashboard` through the same authoritative application-session middleware. The mentor configuration is required on a fresh launch; no cached private dashboard or fake authorization is shown when it cannot be verified.
- `useVisualModes` loads the existing artwork with its existing 8-second API abort and bounded image fallbacks. Optional image failures do not replace the two authenticated startup checks.
- Startup readiness reveals the unchanged animation/UI. Subsequent session checks retain an already verified mounted app during temporary failures; real 401 still removes protected content. All feature requests and trade submission remain independently checked on the server.
- `/api/healthz` is not a startup prerequisite. Node already listens before startup maintenance. A public health 200 establishes process reachability, not database/cookie-session readiness.

The push-only service worker has **no fetch handler**, so it does not cache/intercept startup HTML or API requests. Repository Pages headers revalidate installation HTML/manifest and use no-store on API responses; deployed headers could not be checked. There is no evidence requiring deleting the installed PWA, clearing cookies, changing passwords or disabling authentication.

## Repair

- A single-flight recovery owner retries **only the session and mentor GET reads**, with bounded 30-second header/body deadlines and approximately 1/2/4/8/16/30-second exponential backoff plus jitter. Retry-After is respected within a bounded 60-second retry delay.
- The existing Retry button cancels the stale attempt/backoff and immediately starts that failed stage again. Late responses from a cancelled generation cannot overwrite newer state.
- Online/focus/visibility/BFCache restoration wakes recovery. Hidden/pagehide initialization requests are cancelled; returning resumes verification. Verified Home, navigation, images, bot state and preferences are not remounted merely because a background recheck encounters an outage.
- Mentor refresh after a lifecycle return follows fresh session verification. A changed identity resets branding; dashboard identity mismatches are rejected. Authentication/account/licence failures still fail closed.
- 401 is not automatically retried; a new password/login action remains user driven. HTTP 403 is identified separately from an expired login. No startup controller handles login/logout/MT5/trade mutation requests. The Pages proxy never replays a mutation.
- Frontend diagnostics retain only 30 in-memory fixed metadata events: phase, code, category, HTTP/upstream status, attempt, delay and safe request ID. `window.__eaStartupDiagnostics` is available for inspection after an approved release. Query strings, bodies, account emails, cookies, tokens, passwords and chart images are not recorded. Logging failures do not block startup.
- API logs use `app_startup_backend_failed`, with `session`/`identity`/`licence`/`branding` phase and allowlisted driver codes. Examples: `42P01`/`42703` → schema; `ECONNRESET`/`57P01` → connection; `28P01` → database credentials. No raw SQL, parameters or provider errors are logged by these new paths.
- Pages logs use `api_proxy_failed`. Missing/invalid origin, unreachable upstream and a successful HTML/SPA fallback have distinct codes. Render-style HTML 503 is a backend outage with its upstream status retained, rather than being mislabeled as a successful SPA/deployment mismatch.
- A React error boundary and safe window/promise/asset diagnostics distinguish frontend crashes. Its fallback reuses the existing error-view styling; Retry remounts initialization. The normal render hierarchy uses a Fragment, with no added layout box. Startup animation/layout/styles are unchanged.

## Verification actually performed

- App and API TypeScript checks, API production build and combined Pages production build pass. Existing Pages large-bundle warnings remain.
- **22 focused tests pass**, including genuine cookie/session/licence handler integration in disposable PostgreSQL, header/body timeouts, cancellation, stale response rejection, backoff, authentication denial, sanitization and Pages proxy behavior.
- The actual built app passes startup browser fault injection for a cold visitor, returning cookie user, session 503, dashboard 502, offline/online, local backend listener stop/restart, a real missing session table/restoration in the disposable database, the 30-second deadline, manual Retry without a stored token, PWA lifecycle return and genuine session expiry. Protected UI is absent until verified, prior Home DOM/geometry remains during temporary rechecks, and no auth/trade mutations are automatically submitted. Existing push cleanup is allowed.
- A browser component test proves the actual render error boundary reports the frontend category and Retry remounts a recovered child.
- The existing browser login/refresh/browser-process-restart/app/portal/back/outage/logout/mobile regression passes. Existing test-generated documentation screenshots were restored; no unrelated image changes are included.
- Broader Node run: **198 tests, 196 pass and two existing fixture failures**. `ea-mode-images.test.mjs` mocks @workspace/db without the `pool` export already imported by browser-session on main. `ios-background.test.mjs` expects only three cache-header routes although main already includes nine (build metadata and site icons). Both tests and the relevant underlying main configuration were unchanged by this repair. No security checks or production code were weakened to make these unrelated tests green. The subsequently added proxy HTML-503 regression is covered in the 22 focused passing tests.

No real production outage cause, Render process state, provider log, deployed environment value or physical iPhone installed-PWA behavior was verified. Chromium lifecycle/touch emulation and local fault injection are not physical iOS or live Render tests.

## Remaining read-only production diagnosis

On a computer with Node.js, run `node scripts/check-client-startup.mjs` from this branch. It uses only public health/anonymous-session/build endpoints, prints safe status/timing/code/Pages commit and needs no API key or cookies. It may wake a sleeping Free service, but does not deploy or write configuration. Do not infer database readiness from health alone. Compare the Pages build commit with Render's live commit in its dashboard.

After approved publication, reopen the installed app and inspect sanitized Render/Pages event codes and startup diagnostics. A `SESSION_STORAGE_SCHEMA_UNAVAILABLE` event calls for a **read-only** check of the existing `20261026-browser-sessions.sql` migration/table/columns in Neon. Apply/repair that existing migration only with separate approval. `API_BACKEND_NOT_CONFIGURED` calls for checking the existing Pages BACKEND_ORIGIN privately. Do not share connection strings, cookie values or keys. Do not rotate SESSION_SECRET or reset passwords.

## Files and release

Frontend: `App.tsx`, `main.tsx`, `lib/request.ts`, new `lib/connection-recovery.ts`, `lib/startup-diagnostics.ts`, `hooks/use-startup-request.ts`, `components/StartupErrorBoundary.tsx`.

Backend: `lib/browser-session.ts`, `middlewares/app-session.ts`, `routes/client-app.ts`, new `lib/session-diagnostics.ts`. Changes are diagnostic/error classification; credential issuance, validation, revocation, passwords, account data and licence rules are retained.

Pages: `functions/api/[[path]].js` (safe error codes/logging only; no origin, body, cookie, upgrade, streaming or retry-policy changes).

Checks/docs: `scripts/check-client-startup.mjs`, new startup recovery/boundary/session diagnostic tests, expanded existing mobile-loading/Pages tests and this document.

After review/approval, deploy both **Render API** and **Cloudflare Pages (frontend plus API function)** from compatible revisions. No new environment variable, schema change, migration or paid service is introduced by this repair. Existing missing production configuration/schema, if found, requires its own explicit approval to repair. Nothing has been merged, deployed, applied to production or used to reset an account by this task.
