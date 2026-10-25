# Premium scroll transitions and smart public navigation

The website's design is unchanged at rest. Scrolling adds reversible viewport-edge effects and a direction-aware header, without changing layouts, artwork, fonts, links, forms or trading-app code.

## Behaviour

- The existing fixed header slides completely above the viewport in 300ms when scrolling down, then returns on upward scrolling or at the top. Downward/upward travel thresholds of 28px/14px avoid flicker. The initial top zone remains visible. Fractional movement accumulates; clamped positions prevent rubber-band direction reversals. Height-only viewport resizes do not continually reveal the header when mobile browser chrome expands/collapses.
- Account/hamburger menus, installation dialogs and desktop authentication routes pin the header. Keyboard Tab reveals it and header keyboard focus keeps it available. Hidden header hit-testing is disabled; no new overlay is added. Existing mobile authentication routes still have no website header.
- Hero copy, original screenshot showcase, section headings/copy, feature cards, FAQ groups and the closing section fade at the viewport edges. Content stays unfiltered in the central reading band. Tall sections animate independent groups so visible cards do not dim just because their section heading has left the viewport.
- Effects follow scroll position in both directions: a smooth opacity curve, up to 12px vertical movement and at most 0.65px blur. Existing one-time reveal, hover, hero entrance, atmosphere and carousel animations remain intact. Filter opacity and independent translation compose with those existing transforms; no wrappers or layout boxes are added.
- Geometry reads are batched before writes in one scheduled animation frame, with IntersectionObserver limiting active work and cached values avoiding repeated style writes. No React state changes occur per scroll frame. Reduced-motion preferences disable the new section effects and make navigation state changes immediate. Pointer interaction and keyboard-focused content remain clear. Capability checks retain an opacity/blur fallback when independent translation is unavailable and avoid unsupported focus-selector errors.

## Demonstrations and screenshots

Real browser recordings (about 14 seconds, normal motion): [Desktop video](desktop-demo.mp4) · [Mobile video](mobile-demo.mp4). These are captured interactions, not animated still images. Recordings were converted to H.264 MP4 using the environment's installed ffmpeg for wider playback support; no application dependency was added.

| View | Header hidden while scrolling down | Header returns while scrolling up | Incoming section |
| --- | --- | --- | --- |
| Desktop | [Hidden](desktop-navigation-hidden.png) | [Returned](desktop-navigation-returned.png) | [Transition](desktop-section-entering.png) |
| Mobile | [Hidden](mobile-navigation-hidden.png) | [Returned](mobile-navigation-returned.png) | [Transition](mobile-section-entering.png) |

Rest views: [Desktop](desktop-rest.png) · [Mobile](mobile-rest.png). Reduced-motion rest screenshots are pixel-identical to the preceding implementation: [pixel results](rest-pixels.json).

## Verification

Passed frontend TypeScript, production build and combined Pages verifier. Existing Vite source-map/chunk-size notices remain.

`scripts/tests/public-scroll.browser.mjs` passes at desktop 1440px and touch 390px/320px:

- Header position/duration, upward return, top visibility, jitter resistance and height-only resize stability.
- Intermediate outgoing fade values (roughly 1 → 0.78 → 0.22), identical progress when reversing, incoming fades and clear central content.
- Account, Help and hamburger interactions; real section navigation; installation modal pinning and closing without leftover overlays.
- Native touch start/move/end gestures scroll the page and hide/reveal the header; horizontal touch gestures still switch carousel screenshots.
- Feature-card readability in a tall section, FAQ expansion and closing Get App link.
- Headerless mobile registration/Sign In, pinned desktop registration, reduced-motion/live preference changes and a simulated missing-capability fallback (not a Safari engine test).

Existing regressions also pass:

- `public-installation.browser.mjs`: desktop/mobile Get App guides, real app-entry destinations, copy fallback and modal close/focus.
- `mentor-auth.browser.mjs`: desktop/tablet/mobile/landscape header scope, original circular logo dimensions, required validation, login errors and registration success with isolated API fixtures. No real account or live credentials used.
- `carousel-interactions.browser.mjs`: left/right touch swipes, native vertical scrolling, offscreen/hidden-tab pause, side-card/keyboard controls and mentor form handlers.

[Browser results](browser-results.json). Testing used Chromium desktop and touch emulation. Physical Android Chrome and iPhone Safari were unavailable; no WebKit runtime was installed. This is not a physical-device FPS measurement.

For automation, serve the built website locally and set `PUBLIC_ORIGIN` and `PLAYWRIGHT_MODULE` if needed. `public-scroll-demo.browser.mjs` records videos when a Playwright-compatible ffmpeg executable is available; the recordings supplied here used the already installed system ffmpeg through a workspace-only browser-cache symlink. That local cache is not committed.

## Source scope

- `artifacts/ea-cloud/src/hooks/use-public-scroll-motion.ts`
- `artifacts/ea-cloud/src/hooks/use-smart-public-navigation.ts`
- `artifacts/ea-cloud/src/pages/Landing.tsx`
- `artifacts/ea-cloud/src/pages/Landing.css`
- `artifacts/ea-cloud/src/components/layout/Navbar.tsx`
- `artifacts/ea-cloud/src/components/layout/PublicNavigation.css`

Plus the two new browser scripts and this evidence directory. No dependencies, authentication logic, trading-app files, MT5 logic, backend, images, fonts or deployment configuration changed. No merge or deployment performed.
