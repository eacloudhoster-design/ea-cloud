# Mentor registration and persistent login integration

PR #89 originally overlapped the persistent-login implementation merged through PR #88. The merge resolution preserves the authentication system already on main, its `browser_sessions` table, scanner-admin step-up, session renewal, immediate WebSocket logout, role checks, and existing app/portal navigation. The duplicate `auth_sessions` schema/migration and its incompatible tests have been removed. No second session system is introduced.

The registration redesign retains all six fields, required rules, optional phone number, submission hook, API errors and pending approval screen. The route has no public header/footer. The black panel has a cloud-only icon, accessible close button, red Create Account button, responsive columns, viewport scrolling and reduced-motion support. Portal upload/download and MT5 helpers use a public cookie marker rather than reading old bearer credentials from localStorage; the backend authenticates only the HttpOnly cookie.

A routing regression was also corrected: `/api/client/*` MT5 routes now select the client session, as `/api/app/*` does. Portal cookies alone cannot authenticate these client endpoints. A regression test checks both outcomes.

## Background and screenshots

The supplied geometric image has repeated Magnific watermarks. Following the request, it was neither included nor modified. The page currently has a plain black background. Once a licensed, unwatermarked asset is supplied, add it to public assets and set `--mentor-register-background: url(...)` on `.mentor-register-page`; cover sizing and centering are ready. The Sony references informed layout only.

Desktop and mobile screenshots are in `validation/20261026-signup-sessions/`. The responsive registration tests now check the new panel and cloud icon instead of comparing to obsolete geometry snapshots from the previous design. They also preserve the sign-in form contract and public-header scope checks.

## Rollout and session behavior

Use the existing `docs/migrations/20261026-browser-sessions.sql` migration and deployment instructions in `persistent-login/README.md`. Session cookies are Secure, HttpOnly, SameSite=Lax and scoped to `/api`. They renew with activity after a day, expire after 30 days of inactivity, and have a 90-day absolute maximum. Old unsigned tokens require one fresh sign-in. The same-origin API proxy and exact public-origin configuration remain necessary. Browser/PWA storage isolation is respected; physical iOS/Android installed-PWA tests remain outstanding.

No production migration or production merge has been performed by this change. The repository's existing Cloudflare integration automatically generated a PR branch preview when the branch was pushed; preview deployment does not verify the production backend/database migration.

## Validation

After conflict resolution, the full workspace typecheck and production build passed. The embedded PostgreSQL session/role/renewal/revocation/WebSocket, credential, bootstrap-unit, push-session and scanner-access suites passed (13 tests, with one CLI bootstrap test skipped in that fixture). The real disposable PostgreSQL authentication suite passed all four tests, including CLI bootstrap. Both browser suites passed: responsive registration/sign-in at five sizes, and login/refresh/restart/app/portal/back/outage/logout/mobile checks. Real account creation, duplicate-email errors, field persistence and approval state also passed against the disposable database.

## Modified files relative to main

- `artifacts/api-server/src/lib/browser-session.ts`
- `artifacts/ea-cloud/src/App.tsx`
- `artifacts/ea-cloud/src/components/EaModeImageEditor.tsx`
- `artifacts/ea-cloud/src/components/Mt5ConnectInput.tsx`
- `artifacts/ea-cloud/src/pages/MentorAuth.css`
- `artifacts/ea-cloud/src/pages/Register.tsx`
- `artifacts/ea-cloud/src/pages/admin/Mt5Connections.tsx`
- `artifacts/ea-cloud/src/pages/admin/Profile.tsx`
- `artifacts/ea-cloud/src/pages/admin/SetupMethod.tsx`
- `docs/persistent-login-and-signup.md`
- `docs/validation/20261026-signup-sessions/browser-results.json`
- `docs/validation/20261026-signup-sessions/desktop.png`
- `docs/validation/20261026-signup-sessions/mobile.png`
- `scripts/tests/browser-session.test.mjs`
- `scripts/tests/helpers/browser-session-fixture.mjs`
- `scripts/tests/mentor-auth.browser.mjs`
- `scripts/tests/signup-session.browser.mjs`
