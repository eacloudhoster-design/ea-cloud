# Chart Scanner Trade Settings navigation fix

Root cause: `settingsOpen` applies `inert` to `.scanner-main`, whose descendants included `.scanner-navigation`. The browser therefore suppressed navigation taps/clicks before their existing handlers could run. The sheet backdrop already ends above the 85px navigation region, so z-index and pointer-events changes are unnecessary.

The single runtime change moves `.scanner-navigation` outside `.scanner-main`. The wrapper uses `display:contents`, so this changes no geometry or visual styles. The scanner content behind the sheet stays inert. BottomNav's existing `navigate` handler cancels an in-flight scanner request and calls the application's existing onNavigate callback, which selects the destination and unmounts the scanner and its Trade Settings/backdrop.

Verification against the local production build with isolated APIs:

- Reproduced inert navigation and failed interaction before the fix at 390×844, 320×568 and 1280×900.
- Mobile touch and desktop mouse tests navigate from Trade Settings to Home, MetaTrader and Settings (nine destination cases).
- Each destination is usable: Home/Settings interaction, MT5 input entry, and Settings shape accordion. No scanner, Trade Settings dialog or sheet backdrop remains after navigation.
- Lot/position presets, confirmation and cancellation retain their behaviour; no server writes or trading operations occur.
- All three ordinary bottom-navigation destinations remain interactive outside Trade Settings.
- No browser runtime errors; TypeScript, the trading-app production build and existing scanner client/trade-settings test modules pass.

`before.json` and `after.json` record the reproduction and destination cases, including identical navigation geometry. Mobile screenshots show the same Trade Settings layout before and after the fix. Runtime code changed only in `ChartScannerModal.tsx`.

Run:

```
APP_ORIGIN=http://127.0.0.1:5193 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/scanner-trade-navigation.browser.mjs
```

`NAV_STAGE=before` reproduces the failure when run against the original build. No production deployment or live-site verification was performed.
