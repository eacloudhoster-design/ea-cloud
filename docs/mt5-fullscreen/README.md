# Fullscreen MetaTrader and shared robot assistant

## Implementation

The latest main branch already contained a partial fullscreen CSS treatment, but retained the popup component, page-close control, modal dismissal/focus code and a negative safe-area offset. Replace that host with a mounted fullscreen application view selected through the existing activeTab navigation state. Remove the outer close button, circle, click/escape dismissal and modal semantics. Keep the existing connection-status cancel/close controls and robot panel close button; these are separate functions.

Render MT5's existing image and effects through a React portal into one full-viewport background host, outside the foreground's safe-area/scroll container. The same layer spans content, safe areas and navigation. Keep the newer branch's existing 240ms foreground/background crossfade, including its outgoing screen and reduced-motion behaviour. Home stays mounted and follows its existing opacity transition; its shared base image remains underneath for seamless crossfades. At rest, the viewport-wide MT5 background is opaque and Home's foreground is invisible. No separate MT5 background is painted inside the form or below navigation, and no seam-hiding gradient is added. The image, existing filters/shading and theme values remain unchanged; the existing app fallback image is reused when no mentor image is configured. The decorative navigation lens is unchanged.

The form remains in the normal application content scroller, using the existing --ea-nav-clearance value. Preserve the current logo, heading, label and input styling and global positions, including safe-area placement. The obsolete MT5-only overflow override and popup files are removed. The latest navigation dimensions, iOS positioning and glass/drag/spring code are untouched. Home, Settings, scanner and authentication/trading logic are not redesigned.

The robot was disabled on MT5 by an inert wrapper around the shared TradingActivityMonitor. Remove that restriction; keep one mounted component and the same panel state, drag/resize/pinch implementation, status logic and storage keys across Home/MT5/Settings.

Native touch tracing also reproduced a missing click on the first tap after dragging the circle. The existing shared circle hook now activates non-drag touch gestures on pointerup and locally prevents touch compatibility clicks. This prevents swallowed taps, duplicate activation and click-through when the panel appears. Mouse/keyboard clicks still use the existing click handler; drag threshold, geometry, clamping, image, size, colours and persistence are unchanged. The local touch listener is cleaned up and the activation callback is stable.

## Verification

Current tests:

- `scripts/tests/mt5-fullscreen.browser.mjs`: nine current-main versus updated comparisons, all three interfaces at390×844/320×568 plus393×852 safe-area emulation,844×390 landscape and1280×900 desktop. Exact form/logo/heading/input position/style comparisons, identical navigation skin/geometry, unchanged Home geometry; fullscreen background host, one MT5 background image outside the scroller, no outer X/modal, hidden Home foreground, fixed background during scrolling, reachable Connect/disclaimer, preserved credentials handling and connection preview, theme changes and navigation without reload/new page.
- `scripts/tests/robot-window.browser.mjs`, started on MT5 at390×844,320×568 and1280×900: circle drag without activation followed by tap, shared panel opening, all eight resize handles, mouse/touch dragging, mobile pinch and internal scrolling, refresh/data, geometry persistence/reload, clamping, keyboard access, Home/Settings/MT5 persistence, selected theme and MT5 fields/Connect usable outside the visible window. Tests move the panel or use exposed field areas when the visible circle/window overlaps a control; no forced clicks bypass overlays.
- The same window suite started with a real touch tap on Home at390×844 passed as a shared-hook regression.
- TypeScript and Vite build passed; the existing chunk-size warning remains.

Run local original and updated builds at /ea-app/:

```sh
BEFORE_ORIGIN=http://127.0.0.1:5209 AFTER_ORIGIN=http://127.0.0.1:5208 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/mt5-fullscreen.browser.mjs
APP_ORIGIN=http://127.0.0.1:5208/ea-app/ ROBOT_START_TAB=metatrader ROBOT_OUTPUT=work/robot-mt5 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/robot-window.browser.mjs
```

WINDOW_WIDTH can focus the robot test on390,320 or1280. ROBOT_START_TAB defaults to Home. Historical popup verification scripts describe the retired behaviour; use the fullscreen test for the current MT5 presentation.

Tests use synthetic fixtures, including fixture-only trading-control state changes; no live broker login/trading was performed. Before/after screenshots and raw outputs are under `work/mt5-fullscreen/` and `work/robot-mt5*/`. The changes were integrated onto main commit `2005d63`, preserving its newer navigation, startup, PWA background, visual-mode and voice-event features. The supplied attachments were text, so the referenced current-device screenshot was unavailable. Browser tests use Chromium touch/safe-area emulation, not actual iOS standalone/PWA devices or native soft keyboards. Physical iOS verification remains outstanding. No production deployment performed.
