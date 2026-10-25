# Mentor authentication: mobile header and cloud-only logos

Scope: public Sign In (`/admin/login`, the route linked from the homepage account menu) and Create Mentor Account (`/register`). The attached scroll-animation brief was not applied because the current written request explicitly limits changes to authentication UI and preserves existing animations/navigation elsewhere.

## Cause and fix

`/register` inherits `Navbar` from the shared public layout. `Navbar` now returns no header or menu portal in its existing mobile mode on `/register` or `/admin/login`; all hooks remain unconditional. Other routes and desktop registration keep their existing header. The Sign In route was already a standalone headerless page in this branch, so no new header was added or desktop layout changed there.

The registration page's existing 80px top padding reserved space below the fixed header. A page-scoped CSS rule reduces only mobile registration top padding to 24px (or a larger safe-area inset) so there is no leftover header gap. Desktop spacing and the footer stay unchanged.

Both forms now reuse the existing `ea-cloud-nav-logo.png` cloud-only crop. The original source JPEG and other branding remain untouched. Images use contain sizing with 2px inner padding inside their original 80px/96px circular boxes; the existing rings, glows, positions, animation declarations, form headings, inputs, buttons, validation and submit handlers are unchanged. This is an actual text-free asset, not a rectangle covering lettering.

## Screenshots

| Page | Desktop | Mobile |
| --- | --- | --- |
| Create Mentor Account | [Desktop](register-desktop.png) | [Mobile](register-mobile.png) |
| Sign In | [Desktop](signin-desktop.png) | [Mobile](signin-mobile.png) |

## Verification

- Frontend TypeScript and production build pass; existing Vite source-map and chunk-size notices remain.
- Chromium at 1440×1000, 820×1000, touch 390×844, touch 320×568 and touch landscape 844×390: no mobile authentication header/portal, same cloud-only asset in both circular logos, original circle dimensions, proportional image and no horizontal overflow.
- Required-field validation still blocks empty submissions. Isolated API fixtures verify registration body and pending-approval success state, login body/mentor role and invalid-credentials feedback. No real user account was created or live credentials used.
- Desktop auth geometry and pixels outside each logo box are unchanged. The existing headerless mobile Sign In layout is unchanged. Both desktop and mobile homepage screenshots are pixel-identical to the preceding heading implementation.
- Home and Legal retain their headers. Selecting Sign Up through the mobile account sheet navigates correctly without leaving an overlay or blocked pointer events. Resizing registration between desktop and mobile toggles the header without resetting form inputs.
- Form snapshots hold motion transforms/opacity steady in the test only for consistent comparisons; production animation code is untouched.

Automation: `scripts/tests/mentor-auth.browser.mjs` against a localhost build preview. Results: [browser](browser-results.json), [desktop pixel checks](pixel-results.json). Physical iPhone/Safari testing was unavailable; touch/mobile tests use Chromium emulation.

Modified source: `artifacts/ea-cloud/src/components/layout/Navbar.tsx`, `artifacts/ea-cloud/src/pages/Register.tsx`, `artifacts/ea-cloud/src/pages/admin/Login.tsx`, and new scoped `artifacts/ea-cloud/src/pages/MentorAuth.css`. No authentication logic, backend, trading-app, homepage source, dependencies or deployment configuration changed. No deployment performed.
