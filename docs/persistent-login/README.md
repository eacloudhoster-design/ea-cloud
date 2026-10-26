# Persistent browser authentication — review before deployment

## Behavior and trust boundary

The former Base64 id/role strings were not signed, expiring or revocable credentials. Browser login now issues a random 256-bit HttpOnly, Secure, host-only, SameSite=Lax cookie under /api. Only its SHA-256 digest is persisted in PostgreSQL. Responses and authenticated API traffic use no-store. Sessions last 30 days without renewal, renew after a day of activity, and have a 90-day absolute maximum. Expiry/security events can require reauthentication.

Portal and client cookies are separate. An authenticated client does not automatically obtain mentor/admin access, even with the same email. Existing account approval, licence and role rules still apply. Every authenticated request checks the current account, status and password-derived fingerprint. Password changes, account suspension/deletion, expired records and administrator deletion of session rows deny access. The same frontend/API origin is the supported browser deployment path.

The global API middleware is the credential boundary, mounted before all feature routers. Legacy feature handlers receive an internal identity header only after database-backed cookie verification. It does not trust browser-supplied identity headers. Returned compatibility identity hints contain only id/role and are not credentials; preference keys still map to the same client id. New login secrets are never returned to frontend JavaScript or persisted in localStorage. The existing independent scanner-admin password step-up remains necessary.

WebSockets also verify the cookie, account, origin and licence; legacy URL tokens cannot authenticate. Current-process sign-out closes the live connection. Other backend instances recheck open connections every 20 seconds; HTTP revocation is immediate through the shared database. Do not add a bypass accepting legacy tokens.

## UI and navigation

App and portal restoration ask the backend even when no localStorage token is present. Temporary failures keep credentials and offer retry instead of signing out. Authentication pages and protected portal layouts wait for verification. Browser back/forward restoration rechecks the session; redirect guards use history replacement to avoid sign-in/dashboard loops. Login, pending and trading UI designs remain intact.

Portal sidebars have Back to App links. App Settings has Admin Portal and explicit Sign Out actions using the existing typography/colours. These are the only added navigation actions. Sign Out requires a successful server revocation, clears both browser cookie types and the push-session cookie, clears cached identity/query state, and notifies other same-origin tabs where BroadcastChannel is available (focus/periodic checks provide a fallback). Scanner step-up records for the current portal account are also removed. A failed sign-out shows a retry message rather than claiming success.

## Required rollout work (not performed)

1. Apply `docs/migrations/20261026-browser-sessions.sql` to the intended database before releasing the API. It adds a table/indexes and does not rewrite existing users or trading data. It was tested twice against a disposable PostgreSQL engine; **no production migration was run**.
2. Keep HTTPS and the existing Pages same-origin `/api` proxy. Cookies are deliberately Secure, not downgraded for public HTTP. Configure `PUBLIC_WEBSITE_ORIGIN` and/or comma-separated exact `AUTH_ALLOWED_ORIGINS` on the backend for the actual public origins. Unsafe cross-origin browser requests are rejected. Do not use wildcard credential CORS or broad parent-domain cookies.
3. Release backend and both frontends together after approval. Old unsigned tokens require **one fresh password sign-in**; they cannot safely be upgraded without checking credentials. A staged backend-only release would reject old clients.
4. Browser/PWA storage partitions and unrelated deployment domains have separate cookies. Same-origin app/portal share the corresponding cookie jar; no attempt is made to bypass iOS/browser partitioning. Clearing site data, private browsing policies, browser eviction or expired credentials may require login. Physical iPhone/Android and installed-PWA restart tests still require owner/device verification.
5. Administrator revocation: delete matching `browser_sessions` rows by `kind` and `account_id`, or suspend the account/change its password through existing workflows. Do not log or export raw cookies. Periodically delete expired rows using both expiry timestamps; retention/operational scheduling remains an administrator responsibility.

## Validation

Passed: real portal form login; refresh; close/relaunch Chromium with the same browser profile; automatic portal restoration; Back to App; app-to-portal navigation with both separately authorised account cookies; browser Back; temporary 503 recovery without cookie removal or a login-form flash; desktop sign-out; mobile-touch app sign-out; protected history denied after logout; forged Base64 and WebSocket tokens rejected; client/mentor/superadmin and pending-account isolation; renewal; idle/absolute expiry; password changes; suspension; live WebSocket termination; existing credential and responsive mentor-auth tests; bootstrap unit tests; all three TypeScript checks and production builds.

The existing integration suite's CLI-bootstrap test requires a separate disposable PostgreSQL TCP endpoint, so it is explicitly skipped with the embedded PostgreSQL fixture. Its four bootstrap configuration/error-sanitisation unit tests pass. Browser evidence is Chromium desktop/touch emulation, not physical Safari/Chrome or actual installed-PWA lifecycle coverage.

Reproduce (downloaded PGlite is test-only; no project dependency added):

```
PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/tests/browser-session.test.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/tests/auth.integration.mjs scripts/tests/bootstrap.test.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/browser-session.browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/mentor-auth.browser.mjs
```

Existing password hashing and other non-session security issues remain separate review items; this change is not a blanket security certification. No merge, production deployment, production migration, real account creation or support email was performed.
