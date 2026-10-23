# Scanner theme and Settings dismissal verification

The scanner previously used fixed red CSS values rather than AppContext.accentColor. The scanner now exposes that existing setting as --scanner-accent; decorative tints, buttons, selected strategies, portrait lighting, scan beams/dots and its trade settings sheet inherit it. Semantic error, success and trading result colours remain unchanged. No scanner requests, reports, signal calculations or upload logic changed. Comparing CSS with colour values normalized confirmed that every non-colour declaration is identical.

The 88%-wide Settings drawer previously had no backdrop, and Home remained interactive. A transparent dismiss button now intercepts the exposed 12% strip above the existing navigation. Home is inert while Settings is open and for its 300ms closing transition. The strip consumes the click, retains interception during closing, and is disabled while the full-screen scanner is open so scanner controls remain accessible. The drawer keeps its existing transition and internal controls.

Local production build tested in Chromium using touch-enabled mobile viewports 390×844 and 320×844. `scripts/tests/scanner-theme-settings-dismiss.browser.mjs` exercises all three interfaces, a touch outside with the Font accordion open, reopening Settings, shape controls, unchanged localStorage/background and no underlying Home click or API write. It then uses Settings to select red, green, blue and purple, checks computed scanner colours and identical geometry, uploads an isolated chart, observes the themed analysis animation, verifies the original error colour, and opens/closes the themed trade settings sheet. No runtime errors. APIs are isolated fixtures; no live AI request or trade is submitted.

Run against a combined local preview:

```
APP_ORIGIN=http://127.0.0.1:5191 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/scanner-theme-settings-dismiss.browser.mjs
```

`results.json` records six interface dismissal cases and eight scanner colour cases. Screenshots show the purple scan animation and green trade settings sheet. TypeScript and the production trading-app build also passed. This verifies the local production build; no live deployment was changed or verified.
