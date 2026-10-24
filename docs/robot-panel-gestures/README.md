# Robot gestures, circle visibility and Home dismissal

Scoped changes:
- The existing panel can be moved from its entire image/header area, excluding buttons and resize handles. Mouse/pen use pointer events; touch uses the panel's existing non-passive touch listeners.
- Lower content uses a completed first tap followed by a nearby second touch within 350ms. Holding/moving that second touch moves the complete window. Single-finger scrolling remains native. Pinch takes priority over dragging; resize handles and refresh/close buttons retain their existing handlers.
- The existing circle remains mounted with unchanged geometry and saved position, but is invisible and cannot receive input while the panel is open. Close restores focus after the circle becomes visible.
- Home's existing navigation-request signal now closes Copied Trades as well as Quotes/Symbols, including when Home was already selected. No stacking or navigation CSS changes were needed: the missing state reset was the cause.

The old drag handler covered only a 40px invisible header strip. The lower region had no double-tap drag recognition. The circle was always rendered visibly regardless of panel state.

## Verification

Run from the repository root against a local production preview:

```sh
APP_ORIGIN=http://127.0.0.1:5210/ea-app/ ROBOT_START_TAB=metatrader ROBOT_OUTPUT=work/robot-gestures-final node scripts/tests/robot-window.browser.mjs
```

Set `PLAYWRIGHT_MODULE` when Playwright is installed outside the repository. The test uses Chromium's native touch input on 390×844 and 320×568 mobile viewports, plus mouse input on a 1280×900 desktop viewport. API fixtures isolate the test from live accounts/trades.

Coverage includes image-region dragging outside the old strip, a stationary lower single tap, lower double-tap-and-hold movement, all eight resize handles, panel pinch in/out, native activity-log scrolling, refresh, geometry persistence/reload, bounds after resizing, nonmodal MT5 form interaction, Home/Settings/MT5 navigation, Start/Stop, circle restoration on Regular/S2tone_/Matrix, and Copied Trades dismissal using Home and its existing X on all three Home designs.

Physical Android/iOS devices and Safari were unavailable. Emulated Chromium touch tests do not establish physical-device compatibility. No live broker trades are placed. No production deployment is performed.

Final verification passed on all three viewports. An additional 390px mobile run verified changing Electric Blue → Pure Red while retaining the panel and circle themes, and verified active/paused status classes after Start/Stop across all three interfaces. TypeScript and the production build passed; Vite reported its existing chunk-size warning. Recorded geometry and checks are in `results.json`.
