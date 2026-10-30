# Client startup failure and recovery

## Confirmed code path

The installed PWA loads `/ea-app/`, verifies the persistent HttpOnly session with
`GET /api/app/me`, then loads mentor branding with `GET /api/app/dashboard`.
`artifacts/ea-app/src/lib/request.ts` previously emitted the same "The service is
unavailable. Please retry." error for every non-401 HTTP failure. The error view
in `App.tsx` rendered the black screen/red Retry control after that failure.
This included 403 access denials, so the wording alone did not establish an API
outage. A single transient failure stopped startup; neither restored connectivity
nor returning to the foreground retried the failed initialization automatically.

The specific production response/status and Render exception remain unverified.
The earlier missing EA-builder tables are not queried by these two client
startup handlers, so they must not be assumed to explain this client failure.

## Repair

- Classify HTTP denials, retryable infrastructure errors, network failures,
  malformed responses and bounded timeouts separately. Include request context
  and HTTP status in startup error text when available.
- Retry only the two idempotent startup GET requests, at most three attempts
  with short backoff and a 20-second headers/body timeout per attempt. No login,
  logout, trading or other mutation is replayed automatically.
- Preserve cookies and access guards during failures. No offline access is
  granted. A definitive 401 follows existing sign-in behavior; dashboard 401
  now returns to sign-in instead of repeatedly requesting an expired session's
  dashboard. 403 is not retried as an outage.
- Cancel stale startup requests. After bounded attempts fail, keep the existing
  Retry control; retry recoverable startup failures on online/foreground events.
- Log only endpoint, HTTP status, category and attempt. No raw response body,
  token, cookie, account record or secret appears in the startup diagnostics.

## PWA caching findings

The current push-only worker has no fetch/cache handler and cannot serve cached
HTML/API responses. Registration already uses `updateViaCache: "none"`; install
uses skipWaiting and activation claims clients. API reads use `no-store`, HTML
shell metadata already revalidates and JS/CSS filenames are fingerprinted. Add an
explicit `no-cache` response policy for `/ea-app/push-sw.js`; do not clear cookies,
IndexedDB, local preferences or service-worker registrations to recover startup.
There is no evidence here that an outdated asset caused the production incident.
A real iOS device remains necessary to confirm native standalone resume/update.

## Production checks and deployment

No deployment, production SQL, credentials or environment variables were changed.
After approval, deploy the normal complete Cloudflare Pages build. This repair
needs no Render redeployment, database migration or service restart. Fully close
and reopen the installed PWA to load the new document; no reinstall or clearing
website data is required. Existing valid session cookies must remain intact.

If startup still fails, inspect Render logs for the actual failed
`GET /api/app/me` or `GET /api/app/dashboard` and its nearby `AppGetMe error`,
`AppDashboard error` or session-verification error. `/api/healthz` alone proves
neither session/database availability nor mentor-dashboard readiness. Check
Pages BACKEND_ORIGIN and Render's deployed commit privately if routes mismatch;
never send credential values. Restore backend/database connectivity rather than
weakening authentication. No production recovery is claimed before device testing.
