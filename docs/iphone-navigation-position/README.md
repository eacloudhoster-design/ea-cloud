# Compact iOS Home Screen navigation offsets

Only application change: a scoped rule appended to `BottomNav.css`. All original declarations, animation code, navigation handlers and foreground layouts remain unchanged.

The adjustment requires both iOS WebKit's `-webkit-touch-callout` feature and `display-mode: standalone`, in a viewport no wider than 440px. Ordinary browser mode, Android and desktop retain their original offsets. Wider landscape layouts retain their existing notch-aware spacing.

At the usual 34px bottom inset the bar moves down 12px, leaving 22px below it. At smaller nonzero insets the adjustment is clamped to retain at least 20px clearance; zero-inset devices retain their existing 8px bottom gap. This deliberately gives smaller adjustments where a full 12px move would consume too much clearance.

Side spacing becomes 8px from the viewport edges, respecting horizontal safe areas. The calculation also accounts for the existing centred 430px app cap on 440px iPhones, without changing that cap or moving other content. Navigation remains 62px tall, centred, with the existing three evenly distributed buttons. The existing ResizeObserver updates indicator measurements for the new width.

## Verification and limitations

`scripts/tests/iphone-navigation-position.browser.mjs` passed 12 configurations, including all three interfaces, widths375/390/393/430/440, top and bottom safe-area values, landscape, and untouched browser/Android-like and desktop defaults.

- At393×852 and bottom34: bar x10→8, y756→768, width373→377, height62 unchanged; bottom clearance22px.
- At440px width: viewport side gaps15→8, accounting for the centred app cap.
- Smaller insets and zero-inset cases retain their safety floors.
- Foreground rectangles and glass, indicator, icon and label styling matched before/after snapshots.
- MetaTrader, Home, Settings, hold gloss, drag preview and spring settling worked across all three interfaces.
- No browser errors or backend writes; TypeScript and Vite build passed (existing chunk-size warning remains).

**Actual iOS standalone/device testing was unavailable.** Chromium cannot reproduce iOS WebKit's feature query, installed display mode, or native Home indicator. Positive geometry tests explicitly inject the exact declarations extracted from the production CSS rule under a simulated iOS/standalone gate, retaining its width media query. Negative/default tests leave that gate untouched. Source guard conditions are asserted. These checks validate geometry and existing interactions, not actual system-UI clearance on a physical iPhone. Screenshots are explicitly named simulated-standalone and contain no fabricated native system UI.

Raw results are included here; generated screenshots are under `work/iphone-navigation-position/`.

```sh
APP_ORIGIN=http://127.0.0.1:5206 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/iphone-navigation-position.browser.mjs
```

No production deployment performed. Physical iPhone Home Screen testing should confirm the result before production release.
