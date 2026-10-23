# Three targeted UI fixes

## Causes and changes

- The floating robot window used fixed red decorative CSS and a fixed red header shade. Its existing accentColor now supplies a panel-scoped custom property for decorative borders, gradients, glows, neutral badge decoration, focus/resize cues and the footer/refresh icon. The same image URL remains in the header. Active/paused indicator colours, semantic status badges, P&L and message severity colours are unchanged. Normalizing colour values confirms every existing CSS layout and animation declaration is identical.
- The Copied Trades backdrop had no outside-click handler. It now consumes a click only when the backdrop itself is the target, then closes the existing sheet. Interactions inside the sheet and the X button retain their behaviour. There are no dimension, position, blur or trade-feed changes.
- Quotes and Symbols share QuotesSheet and keep local open state in the always-mounted HomeTab. Their Home button already received taps, but selecting the already-active Home tab did not change activeTab or clear that local state. An explicit Home navigation request now clears showQuotes before paint. The existing bottom navigation and scanner navigation share the handler; no z-index or navigation appearance changes are needed.

## Verification

`three-ui-functionality.browser.mjs` runs real Chromium touch interactions at 390×844 and 320×568 against the local production app, with isolated REST/WebSocket fixtures and no live trades.

- All three interfaces: open Copied Trades, verify its empty state and incoming live execution, tap the exposed backdrop once, verify sheet/blur removal, unchanged preferences/background/bot state and zero underlying Home clicks. Reopen and close with X.
- All three interfaces: open Quotes/Symbols, press Home once, verify the sheet and nested overlay controls are removed, preferences are unchanged, and subsequent Start/Stop controls respond normally.
- Keep the same floating window open while selecting red, blue, green and purple in Settings. Verify its computed accent/border/glow/footer colours, unchanged dimensions/position/image/name, unchanged semantic status/P&L colours and red paused/green active indicator. Verify drag, corner resize, pinch and refresh remain functional.

TypeScript and the production trading-app build pass. The existing full robot-window test covers eight edge/corner handles, touch pinch, mouse dragging, scrolling, keyboard navigation, persistence/reload/rotation and non-blocking interactions across three viewport sizes. The existing scanner Trade Settings navigation regression also runs at both mobile sizes and desktop.

Screenshots and results accompany this file. APIs in screenshots are fixtures; no invented values were added to production. No production deployment or live-site verification was performed.

```
APP_ORIGIN=http://127.0.0.1:5194/ea-app/ PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/three-ui-functionality.browser.mjs
```
