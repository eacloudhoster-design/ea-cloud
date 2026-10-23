# Liquid Glass navigation and edge-to-edge background

## Scope

The shared BottomNav retains the existing TrendingUp, Home and Settings icons, labels, left/centre/right order, AppContext accent colour and navigation callbacks. Its old opaque black gradient and separate Home glow are replaced by one translucent floating pill and one moving glass indicator per navigation instance. No page, trading, authentication, Settings option or floating assistant implementation changes.

Pointer capture tracks touch and mouse gestures locally to the bar. A 7px threshold distinguishes dragging from a tap. Dragging previews the nearest destination and moves the lens without selecting a page. Release selects once; compatibility clicks are suppressed. Cancellation, lost capture, blur and hidden documents restore the actual selection. Native button clicks, Enter and Space remain available. External tab changes, including outside dismissal, move the indicator back to the actual active tab.

A requestAnimationFrame spring moves the indicator with a controlled overshoot. Finger tracking is immediate; a lagging spring body drives subtle stretch, skew and reflections. Release starts from the last visible finger position. Pointer/frame updates write decorative DOM transforms rather than React state. ResizeObserver and visualViewport handling keep measurements current; listeners, observers and frames are cleaned up. Reduced motion preserves tracking/navigation while disabling spring motion, stretch and zoom.

The glass surface uses translucent gradients, reflective edges, CSS backdrop-filter with its WebKit prefix, and a translucent fallback. A clipped, slightly enlarged copy of the existing background provides local lens magnification; it is decorative, cached and only supplied when the existing background preference is enabled. Icons stay above the glass. Safe-area spacing is local to the navigation. The existing Settings outside-dismiss strip reserves the glass bar’s safe-area height so its invisible hit target cannot overlap the bar on notched iPhones.

The existing independent app background already covered the viewport. Its cover/centre sizing is now explicit in the scoped background rule, with a 100vh height fallback before 100dvh. Removing the black navigation gradient reveals the original image behind the bar and down to the bottom edge. No foreground positioning, image source, filter, colour or background animation changed. The existing maximum app width and iPhone Home Screen metadata remain unchanged.

## Browser tests

`scripts/tests/liquid-navigation.browser.mjs` compares before/after builds and uses a test-only component fixture for counted callbacks. The fixture is not an application route or production entry.

Coverage:

- Regular, S2tone_ and Matrix × Orbit, None and Neural × five viewports: **45 foreground comparisons**. Same bot names, branding, images/shapes, status, bell, function buttons and floating circle geometry, within 0.75px.
- 390×844, 320×568, 844×390 landscape, 1280×900 desktop, and 393×852 with emulated top59/bottom34 safe areas.
- Loaded, centred, undistorted cover image across the complete app viewport; no background filter; coverage after viewport resize.
- One moving indicator, normal taps, hold appearance, dragging left/right, release-only selection, MT5 outside dismissal, Home, Settings, keyboard and four existing theme options.
- Counted callback fixture: no action while holding/dragging, exactly one action on release, cancellation, mouse drag, Space, reduced motion and intermediate spring positions.
- Existing Chart Scanner/Trade Settings navigation and robot-window regression suites.

Tests use fixture accounts/API responses, never live broker connections or trading writes. Screenshots and raw results are generated under `work/liquid-navigation/`.

Example (builds served on ports5200/5201 and Vite development server on5202):

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/liquid-navigation.browser.mjs
```

Use BEFORE_ORIGIN, AFTER_ORIGIN and DEV_ORIGIN to override the local servers. NAV_TEST_SECTION can run geometry, interaction or fixture separately. The fixture needs the Vite development server because it imports the real source component.

## Limits

The reference video was not available, so an exact visual comparison was not possible. Chromium mobile/touch emulation is not a physical iPhone Safari or Android device test. The browser cannot paint over native Safari/browser chrome; existing iOS standalone support is retained. Smooth 60FPS is a target, not a measured guarantee across devices. No production deployment is part of this change.
