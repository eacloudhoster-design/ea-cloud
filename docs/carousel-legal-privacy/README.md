# Automatic showcase and Legal & Privacy Centre

Branch: `feat/carousel-legal-privacy`, based on merged PR #76 (`cdbe808`). No open PR existed when this work resumed; the previous website PRs were already merged. This work belongs in a new draft PR, without merging or deploying.

## Behaviour

- Original screenshots remain unchanged. Initial arrangement is S2tone_ left, Matrix centre/front/largest, Regular right. One five-second timeout rotates Matrix → Regular → S2tone_, with 750ms transform transitions. Swipes, mouse drags, side-card clicks, keyboard arrows and indicator clicks reset the timer. A small pause control is available. Offscreen and inactive-tab rotation pauses; reduced motion disables automatic movement.
- Public `/legal` hub and five direct routes provide draft Terms, Privacy, Cookies, working Cookie Settings and Privacy Choices. Header duplicate HTML wordmark removed; original logo image and Orbitron hero heading preserved. Existing desktop/mobile Help styling and navigation remain, with six working support/legal links and animated expansion/collapse. Compact footer links added.
- Optional public Google Fonts loading now waits for Functional consent. Necessary technologies remain available; Analytics and Marketing are inactive, not decorative live toggles. Versioned browser choices last 180 days, restore on reload and can be withdrawn. Storage failures are visible and fail closed. The independent trading app and its preferences are untouched.
- `POST /api/privacy/requests` validates origin and JSON, limits submissions, and sends plain-text messages only to the owner-confirmed `eacloudhoster@gmail.com` inbox using existing SMTP configuration. Success requires SMTP acceptance of that recipient. No public record retrieval or automatic deletion is exposed. Failure retains the draft and offers direct email. Identity verification remains an administrator responsibility.
- Confirmed business address is identified as a business contact, never as an officer's personal address. No registration number, regulatory approval, final billing policy or blanket data-retention period is invented. See [REVIEW.md](REVIEW.md).

## Screenshots

| View | Desktop | Mobile |
| --- | --- | --- |
| Homepage carousel | [Homepage](homepage-desktop.png) | [Touch viewport](carousel-mobile-390.png) |
| Legal Centre | [Desktop](legal-centre-desktop.png) | [Mobile](legal-centre-mobile.png) |
| Terms | [Desktop](terms-desktop.png) | [Mobile](terms-mobile.png) |
| Privacy | [Desktop](privacy-desktop.png) | [Mobile](privacy-mobile.png) |
| Cookies | [Desktop](cookies-desktop.png) | [Mobile](cookies-mobile.png) |
| Cookie Settings | [Desktop](cookie-settings-desktop.png) | [Mobile](cookie-settings-mobile.png) |
| Privacy Choices | [Desktop](privacy-choices-desktop.png) | [Mobile](privacy-choices-mobile.png) |
| Expanded Help | [Desktop](help-desktop.png) | [Mobile](help-mobile.png) |

## Verification

Passed frontend and backend TypeScript checks, both production builds and the combined Pages build verifier. Existing Vite source-map and chunk-size notices remain; they do not fail the build.

- `scripts/tests/carousel-privacy.browser.mjs`: complete five-second auto loop, stable decoded image nodes, manual reset, mouse dragging, direct legal routes, desktop/mobile Help, consent network blocking and persistence/withdrawal/expiry, form error and success UI contract, 320/390/768px viewports.
- `scripts/tests/carousel-interactions.browser.mjs`: physical CDP touch left/right gestures, native vertical scrolling, offscreen pause, explicitly emulated hidden-tab pause, side-card click, keyboard navigation and unchanged mentor login/registration handlers with API fixtures.
- `scripts/tests/legal-final.browser.mjs`: final screenshots, actual optional-font request interception, storage-write failures, fail-closed consent, animated Help open/close, desktop/mobile legal navigation.
- Existing `scripts/tests/hero-showcase.browser.mjs`: exact original source hashes, responsive assets, cold-cache decode gate, visible entrance and float.
- Existing `scripts/tests/public-installation.browser.mjs`: desktop/390px/320px iOS/Android guides, existing Orbitron font, app entry, copy fallback, modal focus/close and features. Test setup saves a rejection to keep consent testing separate. A first combined-preview run failed while the app build was not yet copied; after restoring the unchanged app build, the full regression passed.
- `artifacts/api-server/src/routes/privacy.test.ts`: actual Express router and production mail helper with injected local test transport. Confirms recipient/reply-to/receipt, origin and body rejection, missing SMTP configuration, rejected SMTP acceptance, no extra credential fields, no-store responses and rate limiting. **No real email was sent.**

Browser tests use Chromium and touch emulation, not physical Safari/iPhone hardware. Hidden-tab state is explicitly emulated. Form browser tests use API fixtures; SMTP routing/acceptance is tested separately with a local test transport. Live inbox delivery, production provider locations and live deployment are not verified. See the administrator checklist before release.

Run browser scripts with `PUBLIC_ORIGIN=http://127.0.0.1:5220` and `PLAYWRIGHT_MODULE` pointing to an installed Playwright module, after building and serving the combined site locally. API test:

```sh
artifacts/api-server/node_modules/.bin/esbuild artifacts/api-server/src/routes/privacy.test.ts --bundle --platform=node --format=esm --packages=external --outfile=artifacts/api-server/.privacy-test.mjs
node artifacts/api-server/.privacy-test.mjs
rm artifacts/api-server/.privacy-test.mjs
```

## Modified source files

Public frontend:

- `artifacts/ea-cloud/index.html`
- `artifacts/ea-cloud/src/App.tsx`
- `artifacts/ea-cloud/src/components/HeroAppShowcase.tsx`
- `artifacts/ea-cloud/src/components/HeroAppShowcase.css`
- `artifacts/ea-cloud/src/hooks/use-showcase-carousel.ts`
- `artifacts/ea-cloud/src/components/layout/Navbar.tsx`
- `artifacts/ea-cloud/src/components/layout/MobilePublicPanel.tsx`
- `artifacts/ea-cloud/src/components/layout/Footer.tsx`
- `artifacts/ea-cloud/src/pages/Legal.tsx`
- `artifacts/ea-cloud/src/pages/Legal.css`
- `artifacts/ea-cloud/src/privacy/PrivacyProvider.tsx`
- `artifacts/ea-cloud/src/privacy/legal-content.ts`
- `artifacts/ea-cloud/src/privacy/legal-links.ts`

Backend:

- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/privacy.ts`
- `artifacts/api-server/src/lib/email.ts`

Tests and evidence: the five test files listed above that are new/updated, this directory's screenshots, review checklist and browser results. Existing hero-showcase test is unchanged. No trading-app source, authentication logic, MT5 integration, database schema, dependency or deployment configuration changed.
