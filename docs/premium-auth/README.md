# Premium mentor sign-in and sign-up pages

The Admin Portal sign-in now uses a full-screen split layout: the existing EA Cloud cloud-only icon over the supplied black/red geometric artwork on the left, and a minimal sign-in form directly on the dark right section. Mobile stacks the cloud above the form and permits vertical scrolling. The existing icon asset is reused unchanged. The later [animation follow-up](../auth-neon/README.md) removes the CSS matte crop, animates accurately positioned eye SVGs and traces the background neon strips. The original transparent cloud asset is missing, so clean logo integration remains blocked; the existing RGB matte is not disguised as transparency. Decorative effects respect reduced motion. The password visibility toggle and close control have accessible names and 44px touch targets.

The mentor registration panel from PR #89 now has the actual new background. Its six fields, required/optional rules, submission, API errors and approval screen remain. The background's proportions are maintained using cover sizing.

## Scope and functionality

Only authentication page visuals, the shared branding asset reference, tests and documentation change. Authentication handlers, API endpoints, account permissions, password rules, cookies, session restoration, logout, database schema/migrations, dashboard, trading app and superadmin login are unchanged. The login handler still submits the existing mentor role and original email/password state. Pending and newly approved notices retain their existing wording. Loading still disables submission. Create one opens `/register`; Sign in returns to `/admin/login`; Help / Support uses the existing `helpLinks` mail destination. Close sign in navigates home without a logout request. Registration close retains its existing navigation behavior.

`ea-cloud-auth-background.png` is the newly supplied unwatermarked image, copied without alteration from `ChatGPT Image Oct 26, 2026, 09_44_20 PM.png` in the upload. SHA-256: `8fae87e300f525e02f0a00f03406d3447bcb397be9dafcf663a71b476ec875f1`. The older watermarked image is not used.

## Screenshots

| Page | Desktop | Mobile |
| --- | --- | --- |
| Sign in | [Desktop](signin-desktop.png) | [Mobile](signin-mobile.png) |
| Sign up | [Desktop](signup-desktop.png) | [Mobile](signup-mobile.png) |

Screenshots use reduced motion and empty forms. These are rendered application pages, not design mockups.

## Validation

- Full workspace typecheck and production build passed.
- `premium-auth.browser.mjs`: 1440×1000, 1920×1080, 820×1000, 390×844, 320×568 and 844×390; split/stacked layout, no horizontal overflow, required rules, password reveal/hide without changing the value or submitting, unchanged login request payload, disabled loading button, invalid credentials, pending approval, approved notice, registration/sign-in/support/close destinations, and reduced-motion behavior. A 390×480 viewport verifies that password and LOGIN remain reachable after scrolling.
- `mentor-auth.browser.mjs`: both forms at five desktop/tablet/mobile/landscape sizes, submission contracts, validation, correct cloud icon, and public header scope.
- Existing `browser-session.browser.mjs`: real password login, refresh, full browser process restart, app/portal navigation, browser Back, temporary outage recovery, logout and mobile-touch logout passed using the existing disposable PostgreSQL fixture.
- Existing session/authentication/bootstrap-unit/push/scanner-access suites: 13 tests passed; one CLI bootstrap case is skipped by that embedded fixture. It is separately exercised by the real local PostgreSQL authentication suite.
- Real registration checks use a disposable local PostgreSQL database, including duplicate email, saved mentor/phone fields, pending approval and real login. No production accounts are used.

Chromium touch/viewport emulation is not physical iPhone/Android or installed-PWA testing. The CSS animations use opacity and transforms; no animation JavaScript loop is added. No production deployment or merge is performed. The repository's pre-existing Cloudflare integration may automatically build a PR branch preview on push.

## Changed files

- `artifacts/ea-cloud/public/ea-cloud-auth-background.png`
- `docs/premium-auth/README.md`
- `docs/premium-auth/results.json`
- `docs/premium-auth/signin-desktop.png`
- `docs/premium-auth/signin-mobile.png`
- `docs/premium-auth/signup-desktop.png`
- `docs/premium-auth/signup-mobile.png`
- `scripts/tests/premium-auth.browser.mjs`
- `artifacts/ea-cloud/src/lib/branding.ts`
- `artifacts/ea-cloud/src/pages/MentorAuth.css`
- `artifacts/ea-cloud/src/pages/Register.tsx`
- `artifacts/ea-cloud/src/pages/admin/Login.tsx`
- `docs/persistent-login-and-signup.md`
- `scripts/tests/mentor-auth.browser.mjs`
