# Password visibility and confirmation

Password controls are frontend presentation only. Backend routes, request payloads, credentials, sessions, password requirements, database and generated API types are unchanged.

## Changes

- Shared `PasswordInput.tsx` / `.css`: initially masked input, independent state per field, Eye/EyeOff icons, explicit non-submit button, accessible label/pressed state/control association, 44px-wide target, input padding to protect password text, keyboard focus outline. Existing input props/value/autocomplete remain owned by the form.
- `Register.tsx`: Password visibility and Confirm Password with independent visibility; required/matching confirmation checked before the existing registration mutation. Error appears immediately underneath confirmation, with `aria-invalid` and `aria-describedby`. Confirmation is separate local state and never added to the submitted form object.
- `AccessScreen.tsx`: same controls for Get App and standalone EA app access; registration-only confirmation. Registration uses new-password autocomplete; sign-in retains current-password. Switching modes resets fields and visibility. Existing request URLs/bodies, duplicate-account response, timeout, access button, authentication callbacks and password requirements are preserved.
- `pages/superadmin/Login.tsx`: visibility control on its existing password input.
- `pages/app/Login.tsx`: existing visibility control retained; adds accessible button state/label, current-password autocomplete and a larger touch target.
- Mentor Sign In already has a working accessible visibility control and is unchanged.

No confirmation is added to sign-in forms. Backgrounds, logos, animations, headings, navigation and other features are unchanged. Extra form height is solely for the new confirmation field/error.

## Screenshots

- [Desktop Sign Up](signup-desktop.png)
- [Mobile Sign Up](signup-mobile.png)
- [Desktop Get App](get-app-1440.png)
- [Mobile Get App](get-app-390.png)

## Validation

Full workspace type checks and production build passed, including website, EA app and combined Pages output. Locally missing dependencies already declared on main were installed using the unchanged lockfile; no dependency files changed.

`scripts/tests/password-controls.browser.mjs` passed at 1440×1000, 390×844, 360×800 and 768×1024 using Chromium with touch/mobile emulation where applicable:

- Mentor registration, Get App registration and installed-app access registration: independent toggles, unchanged values, default masking, missing/mismatching confirmation prevents requests, exact mismatch message, matching confirmation reaches existing endpoints.
- Registration payload keys match the existing API and contain no confirmation field; Get App retains monthly plan.
- Mentor/client/superadmin and Get App sign-in: toggle works, no confirmation input, toggles do not submit, reopening resets visibility.
- Matching registration reaches the existing pending-approval screen through an isolated success fixture; existing API error messages still render for access forms.
- Eye targets stay inside input bounds, mobile targets are at least 44×44px on access forms, no horizontal overflow, no page errors.

All requests use isolated local fixtures, not production accounts. Physical iOS, Android, Windows or Mac testing was unavailable; desktop Linux Chromium emulation does not certify native browsers.

Existing mentor/signup test helpers/counts were updated for the additional confirmation input. Two legacy visual suites were also run, but still stop at pre-existing stale assertions: `premium-auth.browser.mjs` expects the old desktop “Sign in to EA Cloud” heading; `mentor-auth.browser.mjs` expects the old desktop nav-logo asset. Main already uses “EA Cloud Admin Portal” and the transparent cloud. Those product headings/assets are unchanged. The database-dependent signup-session suite was not run against a live PostgreSQL fixture.

No merge or production deployment performed. Repository-managed automatic PR previews may run.
