# Sign-in logo and animations only

Desktop now uses the existing `ea-cloud-mobile-cloud.png` with real alpha transparency. This PNG was prepared during the earlier mobile work; it is **not a newly discovered original transparent source**. The original transparent source remains unavailable. No image was regenerated or edited for this change, and no CSS cropping, masking, blending, circle, or background container hides the matte.

The cloud retains its proportions and centered desktop position. Mobile retains its existing floating position above the panel. The same SVG overlays use the PNG's native 1688×932 coordinates, with distinct desktop/mobile filter IDs. Eyes brighten, intensify, dim, and switch off in a 3.6-second loop. Six circuit paths carry staggered electrical pulses. Existing geometric background artwork and its eight traced neon paths are unchanged; mobile also receives subtle ambient red lighting.

## Screenshots and recordings

- [Desktop eyes illuminated](desktop-eyes-on.png)
- [Desktop eyes off](desktop-eyes-off.png)
- [Mobile eyes illuminated](mobile-eyes-on.png)
- [Mobile eyes off](mobile-eyes-off.png)
- [Desktop animation recording](desktop-animation.webm)
- [Mobile animation recording](mobile-animation.webm)
- [Browser measurements](results.json)

## Verification

- Full workspace type checking and production build passed. Final website build also passed after the ambient CSS addition.
- `scripts/tests/login-logo-effects.browser.mjs` passed six viewports: 1440×1000, 1920×1080, 820×1000, 390×844, 320×568, and touch landscape 844×390. Checks read actual transparent exterior pixels, opaque interior pixels, matched logo/overlay bounds, centered placement, 3.6-second eye animation with on/off states, six moving circuits, eight moving background traces, stable controls, reduced motion and no horizontal overflow.
- Desktop form positions match the saved pre-change measurements in `form-baseline.json`. Logo proportions use the actual PNG dimensions.
- Existing `scripts/tests/mobile-login.browser.mjs` passed all six mobile sizes including validation, API payload, mocked login responses, navigation, keyboard-size viewport and reduced motion.
- Existing `scripts/tests/auth-neon.browser.mjs` passed its three desktop/tablet cases, including background motion and stable form geometry. Its selectors now target the appropriate shared overlay.
- Browser checks use Chromium and emulated touch devices, not physical iOS/Android devices.

## Scope

Product changes are limited to `MentorLoginArtwork.tsx`, `MobileLoginArtwork.tsx`, the shared decorative `CloudLogoArtwork.tsx`, and `MentorAuth.css`. Login.tsx, registration, fields, buttons, navigation, authentication/session code, APIs, backend, database, dependencies, and image assets are unchanged. API requests in browser tests are intercepted locally; no production database or account was used.

Changes are committed for review. No production deployment or merge was performed.
