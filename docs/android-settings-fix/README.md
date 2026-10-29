# Android Settings presentation fix

The existing Settings cards already match the supplied iOS reference proportions: 76px minimum height, 22px corners, 42px icon containers, white labels, red theme icons, thin borders and existing spacing. Android's difference was the background path: only iOS standalone received the full-screen Settings artwork host, so Android painted the opaque drawer gradient and hid the mentor image.

`artifacts/ea-app/src/App.tsx` now passes the existing page background host to Settings on Android as well. This reuses the existing full-viewport cover image, dark tint, transparent drawer and fade behavior without introducing any new CSS or image assets. The native safe-area handling remains unchanged. The equal-inset screenshot uses 47px top and 34px bottom insets to compare app geometry with the supplied iPhone reference; Android device insets can differ.

The change is five added lines and one prop replacement. The new host selection is used **only by Settings**. The existing iOS path, Chart Scanner host, MetaTrader host, navigation, floating avatar, Home interfaces, settings actions, authentication, trading and background-selection logic are untouched. No cards or settings are added, removed, renamed or reordered.

## Screenshots

These show an isolated local mentor fixture using the existing default robot image. Actual mentor-selected artwork is preserved. Native OS status-bar UI is not simulated.

- [Finished Android Settings](android-settings.png)
- [Small Android phone](android-small.png)
- [Large Android phone](android-large.png)
- [Unchanged iOS reference implementation](ios-reference.png)

## Validation

- Website + EA app + Pages production build passed.
- EA app TypeScript check passed.
- `scripts/tests/android-settings.browser.mjs` passed eight configurations: iOS PWA, Android PWA with matched reference insets, small Android PWA, Android Chrome browser mode, large Android PWA, Android landscape, ordinary iOS Safari viewport, desktop.
- All six requested settings retain their order; every accordion (including Back Animation) opens/closes; vertical scrolling reaches Sign Out; no horizontal overflow; dock bounds remain unchanged.
- Android avatar drag, click-to-open, close and status-indicator presence passed. Its implementation is unchanged.
- Full-screen Android background bounds, original mentor image source, cover sizing and transparent Settings foreground passed. Returning Home deactivates the Settings layer.
- Before/after builds have identical heading/card geometry and styles and dock bounds at all eight sizes. iOS PWA, iOS browser and desktop Settings screenshots have **zero changed pixels**.
- Android and iOS Settings geometry and computed styles match exactly with equal viewport/insets. See [comparison.json](comparison.json).
- Existing `premium-settings.browser.mjs` passed at 390px, 360px and 1280px: interface/shape/font/colour choices, manipulation modes, background animations, scanner/Live Shot navigation, dock bounds and overflow checks using isolated API fixtures.

All browser checks use Linux Chromium with mobile viewport, user-agent, touch, standalone and safe-area emulation. Physical Android, installed PWA and iPhone Safari testing were unavailable.

No merge or production deployment was performed. The repository's normal automatic PR preview workflow may run.
