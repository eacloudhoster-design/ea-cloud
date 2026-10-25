# Help/Legal, homepage typography and header-free Sign Up

## Changes

- Removed the actual Back to homepage anchor/arrow from the shared Legal component, covering the overview and all five policy/settings routes. Removed its associated eyebrow margin so no gap is retained. The top navigation, legal tabs, policies, notices, disclaimers and control logic remain intact.
- Main Legal titles and section headings use self-hosted Space Grotesk Bold (700). The existing homepage Help/FAQ headings use the same family/weight. Active legal tabs use weight 600 and retain the original red underline. No separate Help route was invented; the existing support channel and Help menu destinations are unchanged.
- The homepage's “The Future of Automated Trading” heading uses Space Grotesk Bold, with a white lead line and silver-to-white gradient plus a subtle blush/red accent on the second line. Descriptions use the owner's exact replacement wording, self-hosted Inter Medium (500), clearer silver contrast, increased line spacing and two restrained red phrase highlights. The original EA CLOUD image wordmark, cloud-only header logo, carousel, buttons and page composition remain unchanged. The existing staggered hero entrance and scroll transitions are preserved.
- Sign Up now has no header at any width, including its trailing-slash route. Desktop top padding is 24px (or a larger safe-area inset), with content aligned below the browser UI. The original mobile media query restores its previous centred alignment and identical padding. Form sizes, circular logo, glow, headings, fields, buttons, handlers and Sign In route are unchanged. The user's final all-screen instruction is followed; mobile already had no header, so its appearance is preserved.

## Screenshots

| View | Desktop | Mobile |
| --- | --- | --- |
| Homepage | [Desktop](homepage-desktop.png) | [Mobile](homepage-mobile.png) |
| Terms of Service | [Desktop](legal-terms-desktop.png) | [Mobile](legal-terms-mobile.png) |
| Legal overview | [Desktop](legal-overview-desktop.png) | [Mobile](legal-overview-mobile.png) |
| Cookie Settings | [Desktop](cookie-settings-desktop.png) | [Mobile](cookie-settings-mobile.png) |
| Existing Help section | [Desktop](help-desktop.png) | [Mobile](help-mobile.png) |
| Sign Up | [Desktop](signup-desktop.png) | [Mobile](signup-mobile.png) |

Sign Up comparisons: [desktop before](signup-desktop-before.png) → [after](signup-desktop.png); [mobile before](signup-mobile-before.png) → [after](signup-mobile.png), with identical mobile pixels.

## Verification

Frontend TypeScript, production build and combined Pages verification pass. Existing Vite source-map/chunk-size notices remain.

`typography-refresh.browser.mjs` passes at 1440, 820, 390, 430 and 320px:

- All six Legal views have no back link; heading font/weight and active underline are verified; legal text exactly matches before snapshots after removing only that link.
- Legal tabs navigate, preferences save/restore/withdraw and privacy-form delivery errors retain the message. No real privacy email is sent.
- Fonts load locally without optional consent. Existing optional Google Fonts loading remains controlled by the unchanged privacy provider.
- Exact new homepage copy, local heading font, paragraph weight/contrast, gradient, original image assets, CTA destinations, heading/paragraph entrance ordering and no clipping/horizontal overflow.
- Sign Up is header-free on desktop/mobile and `/register/`. Desktop form elements preserve their widths/heights/horizontal positions and shift together to remove the old top offset. Registration succeeds into its existing pending-approval view using an isolated fixture.
- Mobile Sign Up geometry and screenshots are exactly unchanged at 390×932 and 430×932, including the taller-screen centring case: [pixel evidence](mobile-pixels.json). Unbaselined widths are not claimed as pixel comparisons.

Existing `mentor-auth.browser.mjs`, `public-scroll.browser.mjs` and `public-installation.browser.mjs` regressions also pass. Their former desktop registration-header expectations were updated to the new explicit requirement. These cover Sign In and registration validation/requests, mobile menu navigation and overlays, scroll direction and reduced motion, carousel gestures, FAQ, installation dialogs/copy and app entry. No real account was created or live credentials used.

[Browser results](browser-results.json). Tests use Chromium desktop and touch emulation; physical Android Chrome and iPhone Safari were unavailable.

## Fonts and scope

Only the requested heading/copy selectors use the new aliases in `src/styles/PublicTypography.css`; no global font-family is changed. Font assets are unchanged files from the OFL-1.1 packages `@fontsource/space-grotesk@5.3.0` (Latin 700) and `@fontsource/inter@5.3.0` (Latin 500). The npm archive SHA-512 integrity values were verified before extraction. Original licences accompany the public website in `public/font-licenses/space-grotesk-OFL.txt` and `inter-OFL.txt`. No package dependency or lockfile changed. See [font provenance](font-provenance.json).

Source scope under `artifacts/ea-cloud`: `src/components/layout/Navbar.tsx`, `src/pages/MentorAuth.css`, `src/pages/Landing.tsx`, `src/pages/Landing.css`, `src/pages/Legal.tsx`, `src/pages/Legal.css`, the new shared typography stylesheet, two font assets and their licences. Tests/evidence are included separately. No trading-app source, backend, authentication logic, cookie/privacy implementation or deployment configuration changed.

No merge or deployment performed.
