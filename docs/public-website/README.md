# Cinematic public website

This documents the initial public-site redesign. The current homepage replaces the large animated hero logo with the user’s three application screenshots; see [the completed showcase](../hero-app-showcase/README.md) for current implementation and verification. The original screenshots/results below remain historical evidence of the first redesign.

Changes are limited to the public landing page, its shared public navigation, an animated-logo component and their styles. Dashboard, scanner, MT5, startup, authentication, registration, API and session implementations are unchanged. No dependency declarations, lockfiles or original artwork changed.

## Existing destinations retained

- Brand / Home: `/`
- App navigation: `/#download`
- Features: `/#features`
- Get App: `/ea-app/`
- Sign In: `/admin/login`
- Sign Up / Become a Mentor: `/register`
- Help: the existing landing-page FAQ content, with working FAQ and license/access anchors. No new contact address or placeholder support link was added.

The original flattened 1254px logo is displayed without editing its artwork. SVG geometry follows its cloud silhouette, red circuits and triangular eye positions. Independent eye opacity cycles and a travelling dashed highlight animate individual features. The source canvas's unused margins are cropped by the SVG viewport; the logo and wordmark remain intact. Reduced motion disables entrance/pulse/travel/reveal/hover animations and parallax.

The account dropdown reuses the installed Radix dropdown primitives for toggle, outside click, Escape, keyboard focus and closing transitions. Help expands inline so all options fit narrow screens. Section links scroll smoothly on the homepage; normal links preserve access from other routes. The mobile navigation collapses Home/App/Features while retaining brand, Get App and account access.

## Verification

TypeScript passed for the public application. Both public-site and trading-app production builds passed. Their combined output passed `verifyPagesBuild` for `/` and `/ea-app/`. Vite retains existing source-map reporting warnings in UI primitives and bundle-size warnings. The initial combined build encountered stale/missing dependencies from newer main-branch voice work; restoring the existing frozen lockfile resolved that environment issue without repository dependency changes.

Reproduce using the existing project dependencies:

```sh
pnpm install --frozen-lockfile
pnpm build:pages
PORT=5212 pnpm --filter @workspace/ea-cloud serve
PUBLIC_ORIGIN=http://127.0.0.1:5212 node scripts/tests/public-website.browser.mjs
```

Set `PLAYWRIGHT_MODULE` if Playwright is installed outside the repository. The browser script uses installed Chromium at `/usr/bin/chromium` and writes screenshots/results to `work/cinematic-website/verified` by default (`PUBLIC_OUTPUT` overrides this).

Final browser verification passed at **1440×1000, 768×1024, 390×844 and 320×568**. Mobile runs use touch interactions. Checks include no horizontal overflow, no logo/navigation/CTA overlap in stacked layouts, a fullscreen/minimum-viewport hero, stable entrance geometry, changing outline dash offset, independently changing eye glow, section navigation/selection, account toggle/outside/Escape/focus/Help interactions, FAQ expansion, existing login and registration form handlers, mentor CTA, app entry, reduced motion and preservation of existing public-session tokens.

API fixtures isolate login/registration tests from real users: rejected login credentials and the existing pending-registration screen were verified without creating accounts or placing trades. Physical iOS/Android devices, Safari and live backend authentication were not tested. The three reference screenshots mentioned in the request were not attached to this upload; design follows the written brief and existing EA Cloud assets.

## Screenshots

- [Desktop hero](screenshots/desktop-hero.png)
- [Mobile hero](screenshots/mobile-hero.png)
- [Tablet hero](screenshots/tablet-hero.png)
- [Desktop features](screenshots/desktop-features.png)
- [Mobile account dropdown](screenshots/mobile-account.png)

Recorded measurements and checks: [results.json](results.json).

No production deployment or main-branch merge is part of this change.
