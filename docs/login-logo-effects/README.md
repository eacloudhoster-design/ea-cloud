# Desktop sign-in artwork only

Only the desktop left panel changes. Mobile's component, CSS rules, artwork, animations, positions and form remain unchanged from the base branch. Login.tsx, the right-hand form, navigation and all authentication-related files are unchanged.

Desktop now uses the existing `ea-cloud-mobile-cloud.png` with real alpha transparency. This PNG was prepared during the earlier mobile work; it is **not a newly discovered original transparent source**. The original transparent source remains unavailable. No image was regenerated or edited for this change, and no CSS cropping, masking, blending, circle, or background container hides the matte. The asset is read-only and remains byte-identical to the base branch.

The cloud retains its proportions and centered position. Desktop-only SVG overlays use the PNG's native 1688×932 coordinates and dedicated desktop filter IDs, classes and keyframes. The entire logo remains still. Only the eyes brighten, intensify, dim and switch off in a 3.6-second loop; six accurately positioned circuit paths carry staggered electrical pulses. The subtle red ambient halo and the existing geometric background artwork, composition and eight moving neon traces are preserved.

## Evidence

- [Desktop eyes illuminated](desktop-eyes-on.png)
- [Desktop eyes off](desktop-eyes-off.png)
- [Desktop animation recording](desktop-animation.webm)
- [Mobile comparison results](mobile-comparison.json), [before](mobile-before.png) and [after](mobile-after.png)
- [Browser measurements](results.json)

## Verification

- Full workspace type checking and production build passed.
- `scripts/tests/login-logo-effects.browser.mjs` passed desktop 1440×1000, 1920×1080, tablet 820×1000 and mobile regression checks at 390×844, 320×568 and touch landscape 844×390. It reads actual transparent exterior pixels and opaque interior pixels; verifies matched logo/overlay bounds, centered placement, 3.6-second eye on/off states, six moving circuits, eight moving background traces, stable form controls, reduced motion and no horizontal overflow.
- Desktop form positions match the saved pre-change measurements in `form-baseline.json`.
- Six mobile before/after viewport screenshots were compared at 390×844, 320×568, 430×932, 760×1024, 844×390 and 960×440. Five are pixel-identical. At 390×844, two rounded panel-border pixels differ by one RGB level; all other pixels match. No layout or perceptible visual changes were found. Reduced motion freezes effects for a deterministic comparison; normal animation behavior is checked separately.
- The original mobile component and mobile browser regression script are restored byte-for-byte to the base branch. All original CSS content is preserved; new rules are appended for desktop artwork only. The touch landscape mobile layout still hides the desktop artwork.
- Existing desktop neon browser checks and the unchanged mobile regression suite passed.
- Browser checks use Chromium and emulated touch devices, not physical iOS/Android devices.

## Scope

Product changes are limited to `MentorLoginArtwork.tsx`, the new decorative `DesktopCloudArtwork.tsx`, and desktop artwork rules appended to `MentorAuth.css`. No mobile implementation changes are included in the final diff. No login, registration, field, button, navigation, authentication/session, API, backend, database, dependency or image asset changes are included. Browser test requests are intercepted locally. No production account or database is accessed, and the existing login service issue was not investigated.

Changes are committed for review. No production deployment or merge was performed.
