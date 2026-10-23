# MetaTrader popup

The MT5 tab previously occupied an absolute full-viewport container and entered with a horizontal slide. It now uses a bounded bottom sheet above the existing navigation, leaving Home mounted behind a dismissible backdrop.

The presentation follows the existing Symbols Configure Pair popup in `HomeTab.tsx`: bottom alignment, 24px rounded top corners, dark surface, theme-tinted border, `rgba(0,0,0,.7)` backdrop and 4px blur. That existing popup has no entrance/exit animation; this change does not invent one or modify Symbols. The top-level Symbols/Quotes view itself is currently full-screen, distinct from its Configure Pair popup.

MT5 content, assets, form fields, validation, preview adapter and connection-status logic are unchanged. Only the old navigation-space reservation is removed inside the new sheet so its contents scroll within the available space. The shared floating assistant remains mounted and becomes inert while MT5 is open, preventing background activation. Bottom navigation remains outside the backdrop. Closing restores Home without remounting it; the existing password-clearing behaviour on leaving MT5 remains intact.

## Verification

Chromium mobile touch emulation at 390×844 and 320×568, for Regular, S2tone_ and Matrix (six cases):

- Correct interface selected; sheet bounded above navigation; Home background retained.
- Account/server fields work; password visibility toggles.
- Content scrolls to Connect MT5 on short screens.
- Outside touch closes without activating the background assistant.
- Account/server remain on reopening; password clears as before.
- Home, Settings and close button work; no leftover visible backdrop.
- Existing connection preview/status and Back to login work.
- No API writes, live broker login or browser runtime errors.

The existing MT5 adapter is a credential-free visual preview. Tests do not claim a live broker connection. Native iOS/Android devices and production were not tested or deployed.

Run after building and previewing the app at `/ea-app/`:

```sh
APP_ORIGIN=http://127.0.0.1:5199/ea-app/ PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/metatrader-popup.browser.mjs
```

Screenshots and machine-readable results are generated under `work/metatrader-popup/`. An early short-screen outside-tap test used a point 3px above the sheet; Chromium touch adjustment retargeted it to the header. The final test places the touch inside the exposed background area.

TypeScript and Vite production build also passed (existing chunk-size warning remains).
