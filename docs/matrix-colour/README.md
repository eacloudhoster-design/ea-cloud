# Matrix and floating-robot colour customisation

## Root cause and change

Matrix's theme values were hardcoded to blue, including its header accents, rings, lighting, function-bar border, active-button gradient/glow and lower branding. The draggable activity trigger separately used hardcoded red border/background/glow. The existing Settings colour selector changed an in-memory accent value, which reset to red on reload.

The fix reuses that existing `accentColor` setting:

- Matrix accents, the active navigation dot, portrait rings/glow, active button and lower branding now derive from the selected colour. Existing neutral surfaces and semantic status colours stay unchanged.
- The floating trigger receives a scoped CSS variable for its border, tinted background, glow and focus outline. Its image, activity-status dot, panel, dimensions, position and drag/click handlers are unchanged. The dragging hook is untouched.
- The colour is validated and saved in the existing account-scoped Home appearance preference, alongside interface, background visibility and animation settings. No second colour selector or storage key was introduced. Older preferences without a colour retain the original default red; invalid values fall back safely without losing other settings.

Regular and S2tone_ rendering code is unchanged. Existing background animations already consume the selected accent; their implementation is unchanged. The change adds no dependencies and makes no backend changes.

## Actual browser verification

`scripts/tests/matrix-colour.browser.mjs` tests the production-built `/ea-app/` application in Chromium with isolated authentication/API fixtures. The original default robot image supplies the fixture artwork; no live account or trading service is contacted.

At 390×844 mobile and 1280×900 desktop, the test selects red, blue, green and purple through the actual Settings menu and checks:

- Matrix active-button gradient/border, bar border, selected dot, rings, glow and lower branding use the selected colour.
- The floating trigger updates even while Settings is open; its image source/filter stay unchanged. Screenshot hashes of opaque centre image pixels are identical across all colour changes.
- Bot-name font, image sources and measured title, frame, function-bar and layout geometry are identical across colour selections.
- Real touch dragging on mobile and mouse dragging on desktop move the trigger; releasing a drag does not open the panel. Colour changes, interface changes and reload preserve its position and dimensions and do not rewrite the saved position.
- Regular, S2tone_ and Matrix all retain the selected trigger colour. Its activity-panel click/open/close behaviour remains functional, and the colour remains active on MetaTrader.
- Reload and reopening a page retain both Matrix and floating-trigger colours. No browser runtime errors occur.

`results.json` records the eight colour/viewport combinations. Four mobile screenshots show the actual visual changes with the robot deliberately dragged away from its default position.

Five Home preference unit tests cover persistence, account isolation, old settings, storage failures and all seven existing colour values. TypeScript and the production trading-app build pass; the existing bundle-size warning remains.

Runtime files changed: `App.tsx`, `pages/HomeTab.tsx`, `components/TradingActivityMonitor.tsx`, `components/TradingActivityMonitor.css`, `hooks/use-home-preferences.ts`, `lib/home-preferences.ts`. Additional changes are confined to tests and this evidence folder.

No production deployment or merge was performed.
