# Matrix interface fixes

Only `MatrixLayout` in `artifacts/ea-app/src/pages/HomeTab.tsx` changes in the product. Shared components, CSS, other interfaces, background positioning, controls, navigation, floating assistant, trading and authentication are unchanged.

- **None:** the existing primary BotName moves visually to 32px above the controls' layout wrapper, leaving clearance for the decorative dots and the control panel's visual extension. This anchors it responsively above the panel without moving any flow boxes. The main portrait remains hidden; Powered By retains its original None position. Existing font, font selection and background-toggle behavior are retained.
- **Any non-None shape:** Powered By appears 8px below the bot name, preserving its styling and original flow space so controls remain fixed. Current supported shapes are Orbit and Neural; the condition covers any future non-None shape too.
- **Status pill:** the existing 24px circle shows the same live mentor/EA image as the portrait, using object-fit cover. Missing imagery falls back to the existing default robot. Source changes remount only this small image; a load error also falls back to the bundled default. Pill layout and ACTIVE/PAUSED logic are unchanged.

The request referred to two reference screenshots, but neither was received. None placement follows the written requirement rather than a verified pixel match to the missing Image 2.

## Screenshots

These use an isolated local test mentor, not production account data.

| Screen | None | Shape |
| --- | --- | --- |
| iPhone-sized 390×844 | [None](iphone-none.png) | [Neural](iphone-shape.png) |
| Android-sized 360×800 | [None](android-none.png) | [Orbit](android-shape.png) |

## Validation

- Website, EA app and combined Pages production build passed.
- EA app TypeScript check passed.
- `scripts/tests/matrix-interface.browser.mjs`: Chromium touch viewports 320×568, 360×800, 390×844 and 430×932; Neural → None → Orbit → None; portrait visibility; name/branding gaps; unchanged control/header/nav geometry; status image decoding, cover crop and image updates; failed image handling; no-image default fallback; no API writes or page errors. All settings changes use the existing UI.
- Before/after geometry uses a baseline build of the parent commit's HomeTab. Controls, header, bottom navigation, fonts, background and None branding are identical at all four sizes. Regular, S2tone_ and Lumo geometry also matches exactly. See `before-geometry.json` and `after-geometry.json`.
- Product source outside `MatrixLayout` compares byte-for-byte identical to the parent version.
- Existing `scripts/tests/interactive-portrait.browser.mjs` passed at 390×844 across Regular, Matrix and S2tone_: tap/double-tap, morphing, hidden-portrait restoration, controls and scrolling, image changes, reduced motion and persisted preferences. Updated its outdated text selectors to current accessible button names and excluded only the intentionally moving Matrix labels from its fixed-sibling assertion.

Testing uses desktop Linux Chromium with mobile viewport/touch emulation. Physical iPhone Safari and Android devices were unavailable.

No merge or production deployment performed.
