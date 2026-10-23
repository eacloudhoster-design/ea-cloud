# Compact draggable robot panel and confirmed activation light

## Implementation

The existing activity panel and all its live-data rendering are retained. It is narrower and has smaller header/padding/gaps, with a bounded internally scrollable activity log. No account values, events, status text, controls or branding are removed. The original background image, colours and rounded shape remain. At 390×844 the fixture panel changes from 354×678 to approximately 283×535 (80% width / 79% height). On a narrow 320px screen, a 260px minimum width preserves readability instead of squeezing three account columns to 227px. Desktop is compact as well.

A transparent non-text handle occupies the header's top strip, excluding Close and all selectable text. It moves the complete panel with primary touch or mouse pointers, pointer capture, a 6px threshold, requestAnimationFrame updates and translate3d. The rest of the panel keeps normal text selection, log scrolling and button interactions. Arrow keys move the panel when its handle is focused. Its position is independent of the original floating circle and retained in memory when the panel is closed/reopened. No new storage key is introduced.

Bounds intersect the visible app and visual viewport with safe-area margins. ResizeObserver and viewport resize/scroll listeners re-clamp the position and keep Close accessible. These observers/listeners and pending frames are cleaned up when closed. The original floating-circle drag hook and saved-position key are unchanged.

## Activation source of truth

The original Start/Stop state was optimistic and could temporarily show a successful start before the server accepted it. The same `/api/app/trading-controls` setting, `copyingEnabled`, remains the source of truth. `useBotStatus` retains optimistic controls but adds confirmation metadata: the indicator changes to green only after a valid successful GET/PATCH confirms enabled, and red after a confirmed paused response. Unknown, pending, malformed or failed responses never produce an unconfirmed green; amber identifies an unconfirmed state.

Rapid writes are ordered so a late request cannot overwrite a newer command. Stale initial reads are ignored after a command, requests are aborted on session changes, and failed commands roll the displayed control back to the last confirmed value while marking the status unconfirmed. The confirmation flag is shared through the existing app context, not a separate invented activation state or localStorage toggle.

The light describes the application's confirmed started/paused setting. It does not claim that an MT5 connection/engine is healthy or trades are executing. The panel's existing connection/engine status, live account data, freshness handling and event feed remain separate and unchanged. The light retains its existing size and position and has semantic green/red glows independent of the selected ring theme colour.

## Browser evidence

The actual production-built `/ea-app/` is exercised in Chromium at 390×844, 320×568 and 1280×900. Authentication, account balances and activity events are isolated local API fixtures; no live account or trading service is contacted, and fixture values are not application defaults.

`scripts/tests/robot-panel.browser.mjs` verifies the following through the real interface:

- Before/after panel size and unchanged header artwork; all information remains rendered and the activity log overflows internally.
- Real CDP touch dragging on mobile and mouse dragging on desktop, release position, reopen position, bounds/Close visibility, viewport rotation/resizing, and keyboard movement/focus handling.
- Log scrolling, text selection, Refresh requests and Close/Escape work without dragging or resetting the panel.
- Circle image/size/position remain unchanged by panel dragging; the separate circle remains independently draggable and does not open on drag release.
- Delayed/rejected Start cannot produce green, confirmed Start becomes green, confirmed Stop becomes red, and rapid commands remain ordered.
- Theme changes affect the circle ring but not semantic light colours. State stays synchronized across all three interfaces, Settings, panel opening/closing and page reload. An unavailable status response stays unconfirmed.
- No browser runtime errors.

`before.json` and `after.json` record measurements and assertions; screenshots show the original and compact panels at each viewport. The screenshot referenced by the user was not attached to this session; comparisons use the application's existing implementation and original default robot artwork as a fixture.

The existing `floating-robot.browser.mjs` regression also passes across its touch/desktop viewports, including saved positions and Settings/interface switching (`circle-regression.json`). Six existing font preference/rendering tests pass.

Runtime files changed: `App.tsx`, `context/AppContext.tsx`, `components/TradingActivityMonitor.tsx`, `components/TradingActivityMonitor.css`, `hooks/use-bot-status.ts`, and `hooks/use-draggable-panel.ts`. Added the panel browser test and this evidence folder.

TypeScript and the production trading-app build pass, with the existing bundle-size warning. No new runtime dependencies or backend changes. No production merge or deployment is performed.
