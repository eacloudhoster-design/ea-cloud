# Floating robot information window

The previous monitor was a modal: a full-screen pointer-active backdrop intercepted outside clicks, outside clicks closed it, and a Tab handler trapped keyboard focus. Position was session-local. This change removes that backdrop and focus trap. Only the panel and the existing circle receive pointer events; outside controls remain usable. The panel has its own layer above drawer dismissal areas, while the original circle keeps its layer, appearance, status logic, hook and storage key.

`use-draggable-panel.ts` now owns independent window geometry (`x`, `y`, `width`, `height`, `scale`) under `ea-cloud:robot-panel-window`. Storage is validated, exceptions are handled, and geometry is bounded by the application/visual viewport safe area. Drag/resize renders use requestAnimationFrame; storage writes occur at gesture completion, keyboard changes and viewport adjustments. ResizeObserver plus visualViewport/window listeners handle viewport changes and are cleaned up on close.

- One pointer on the existing header handle moves the window, keeping dimensions unchanged.
- Eight subtle edge/corner buttons resize the box, anchoring the opposite sides. Arrow keys also work on focused handles.
- Two touches that originate inside the panel scale width, height and contents proportionally (normally 85–150%, bounded by available space). Native non-passive touch listeners cancel browser zoom for that gesture. Single-finger log scrolling remains native; page zoom outside the panel is allowed. The existing page-wide `maximum-scale=1` cap was removed from `index.html` to make that possible.
- Drag/resize handles cancel their own native touch compatibility clicks so the next outside tap works normally.
- Minimum usable dimensions are 240×280 at content scale; maximum dimensions fit the visible application area. At small sizes content can scroll internally, with a sticky header keeping Close and the drag handle available.
- The previous background, bot name, account values, badges, event stream, refresh, branding and close controls remain. All data fetching/status logic is unchanged; no new trading data source or simulated production values were added.

Verification is performed against the local production build with isolated API fixtures, not live broker/AI operations. Run:

```
APP_ORIGIN=http://127.0.0.1:5192/ea-app/ PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/robot-window.browser.mjs
```

The browser test covers mobile multi-touch pinch, all eight touch/mouse resize handles, anchored edges, movement without resizing, native log scrolling, refresh, circle geometry/image/storage independence, reopen/reload restoration, non-blocking Start/Stop and navigation in all three interfaces, Quotes/Symbols, keyboard focus leaving the window, rotation/clamping, and actual browser zoom from two touches outside the open panel. Saved results and screenshots accompany this document. All cases passed at 390×844, 320×568 and 1280×900. The existing floating-circle regression test also passed at all three viewport sizes. TypeScript and the production trading-app build passed.

No production deployment or live-site verification is part of this change.
