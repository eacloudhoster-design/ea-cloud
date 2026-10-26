# Persistent login and mentor registration

The mentor registration form now sits in a large black panel with a subtle red border, a cloud-only icon, an accessible close button, red submission button, and desktop/mobile layouts. All six fields, required rules, optional phone number, submission hook, endpoint, API errors, and pending approval flow remain. The registration route has no public header/footer. Desktop panels scroll in short viewports; mobile pages scroll vertically. Animations respect reduced motion.

The supplied geometric image has repeated Magnific watermarks. Following the request, it was neither included nor modified. The page currently has a plain black background. Once a licensed, unwatermarked file is supplied, add it to public assets and set `--mentor-register-background: url(...)` on `.mentor-register-page`; cover sizing and centering are ready. The Sony references informed layout only. Screenshots in `validation/20261026-signup-sessions/` show this explicitly unfinished background state.

## Authentication behavior

The existing password verification, user records, client licences and approval policies remain the source of truth. Previously, the API accepted unsigned base64 account/role strings. Login now creates a random 256-bit opaque credential and stores only its SHA-256 hash in PostgreSQL. The browser receives a host-only HttpOnly, SameSite=Lax cookie, Secure in production/HTTPS, with a 30-day maximum lifetime. Sessions have fixed expiry; users must authenticate again after expiry. There is no password or bearer secret in localStorage. Session replacement runs in a transaction so an unsuccessful login write does not revoke the existing session. Native API consumers may use the opaque bearer response in an appropriate secure credential store.

App and portal identities have separate cookies because their accounts and privileges differ. Navigating between them preserves both existing sessions without granting a client mentor/admin privileges. A portal account still needs its own authorized login if it has no valid portal session. Both portal sidebars include Back to App. The trading settings screen includes Sign Out; existing sign-out buttons remain.

Every API request validates the persisted session, expiry, current account status, password fingerprint and portal role. The existing app licence checks continue to run. Portal upload/download/MT5 helpers now use a public cookie marker instead of reading bearer credentials from localStorage. All route-local legacy identity parsers sit behind the central session boundary: external unsigned identities are stripped and cannot authenticate. WebSockets independently verify the same credential and recheck it every 20 seconds. Push setup also requires the verified session. A temporary verification failure shows loading/retry without deleting the cookie. Login pages restore valid sessions before displaying credentials.

Sign Out revokes both cookies' session rows, clears authentication/push cookies and frontend authentication state, and redirects to sign-in. Cross-tab notifications and focus/pageshow verification handle cached navigation. Private API responses use `Cache-Control: no-store`. Unsafe browser requests require a matching origin; cross-site requests are rejected. Backend roles come from the database, not browser state.

Pending mentor registration returns the existing response shape with an empty token; pending applicants cannot obtain a working portal session. This removes the insecure credential previously issued at registration without changing account creation or approval.

## Deployment requirements (not deployed)

1. Apply `docs/migrations/20261026-auth-sessions.sql` to the existing PostgreSQL database before starting the updated API. The Drizzle schema includes the same table/indexes. No existing account tables are changed.
2. Serve through HTTPS with production `NODE_ENV`, preserving Set-Cookie, Cookie, Origin and the existing proxy forwarding headers. The existing Cloudflare Pages API proxy already forwards these and disables API caching.
3. Keep website/app/API under the same public origin through the existing `/api` proxy. Unrelated domains do not share host-only cookies. Browser and installed-PWA storage isolation is respected; each isolated store may need an initial login. Third-party cookie workarounds were not introduced.
4. Existing unsigned tokens intentionally stop working; existing users need one fresh password login after rollout. Afterwards, normal refresh/reopen/navigation preserves sessions until expiry, logout or invalidation.
5. Administrators can revoke persisted sessions by setting `auth_sessions.revoked_at`; account suspension, password changes, role changes and licence revocation are checked on subsequent requests. Retention maintenance may periodically delete expired/revoked rows.

## Validation

All tests used a disposable local PostgreSQL instance; no production accounts or services were changed.

- Existing authentication integration suite: 4/4 passed, including mentor/superadmin login, wrong passwords, pending approval, both client login URLs, and idempotent administrator bootstrap.
- New persistent authentication integration suite: 6/6 passed. Persistent cookie attributes and identities, separate app/portal sessions, backend role denial, forged token rejection, dual logout and replay rejection, expiry, explicit revocation, password changes, suspended accounts, CSRF rejection, and revoked licences.
- Existing push-session and scanner-access tests: both passed.
- Chromium browser checks: 1440×1080 desktop, 390×844 mobile, 320×568 small mobile, 844×390 landscape; all six fields; required-field validation; duplicate-email error; real account creation and stored mentor/phone/pending state; Sign in link; close button without logout; portal login/refresh; Back to App and browser Back; persisted cookies after fully closing/relaunching Chromium; logout and protected-route denial. No page errors or horizontal overflow.
- Full workspace typecheck and production build passed, including website, trading app, API and mockup sandbox. In this environment the repository's build requires `PORT=5220 BASE_PATH=/`; pnpm dependency auto-reinstallation was disabled for the relocated workspace.
- Physical Safari/iOS, Android browsers, and installed iOS/Android PWA lifecycle tests were not performed. Chromium mobile viewports test layout, not those platform lifecycles. Production HTTPS/proxy behavior requires deployment-environment verification after approval.

Re-run the API suites with explicit loopback `DATABASE_URL` and `API_TEST_ORIGIN`. Run `scripts/tests/signup-session.browser.mjs` with the same database, `PUBLIC_ORIGIN` pointing to a loopback production preview, and Playwright available (or `PLAYWRIGHT_MODULE` set). The browser script writes screenshots/results under `work/signup-session` by default. Test profiles may contain disposable test cookies and must not be published.

## Modified files

- `artifacts/api-server/src/lib/browser-session.ts`
- `docs/migrations/20261026-auth-sessions.sql`
- `docs/persistent-login-and-signup.md`
- `docs/validation/20261026-signup-sessions/browser-results.json`
- `docs/validation/20261026-signup-sessions/desktop.png`
- `docs/validation/20261026-signup-sessions/mobile.png`
- `lib/db/src/schema/auth-sessions.ts`
- `scripts/tests/persistent-auth.integration.mjs`
- `scripts/tests/signup-session.browser.mjs`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/push-session.ts`
- `artifacts/api-server/src/middlewares/auth.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/client-app.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/ws.ts`
- `artifacts/ea-app/src/App.tsx`
- `artifacts/ea-app/src/pages/AccessScreen.tsx`
- `artifacts/ea-app/src/pages/SettingsTab.tsx`
- `artifacts/ea-cloud/src/App.tsx`
- `artifacts/ea-cloud/src/components/EaModeImageEditor.tsx`
- `artifacts/ea-cloud/src/components/Mt5ConnectInput.tsx`
- `artifacts/ea-cloud/src/components/layout/AdminSidebar.tsx`
- `artifacts/ea-cloud/src/components/layout/SuperAdminSidebar.tsx`
- `artifacts/ea-cloud/src/contexts/AuthContext.tsx`
- `artifacts/ea-cloud/src/contexts/ClientAuthContext.tsx`
- `artifacts/ea-cloud/src/main.tsx`
- `artifacts/ea-cloud/src/pages/MentorAuth.css`
- `artifacts/ea-cloud/src/pages/Register.tsx`
- `artifacts/ea-cloud/src/pages/admin/Login.tsx`
- `artifacts/ea-cloud/src/pages/admin/Mt5Connections.tsx`
- `artifacts/ea-cloud/src/pages/admin/Profile.tsx`
- `artifacts/ea-cloud/src/pages/admin/SetupMethod.tsx`
- `artifacts/ea-cloud/src/pages/superadmin/Login.tsx`
- `lib/db/src/schema/index.ts`
