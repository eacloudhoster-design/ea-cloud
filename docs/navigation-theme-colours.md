# Navigation theme synchronisation

The shared `BottomNav` already supplied AppContext's `accentColor` as `--nav-accent`, but its stylesheet used a separate fixed cyan variable and literal blue/cyan gradients, borders and shadows. The existing account-scoped appearance preferences therefore updated other screens while the dock remained cyan.

`artifacts/ea-app/src/components/BottomNav.css` now uses that existing variable throughout the dock, selection indicator, pressed/focus accents, selected icon/label and tinted glass highlights. White reflections and neutral inactive controls remain neutral. Active text includes a small white mix for readability on the dark glass. There is no per-theme lookup, new state, persistence mechanism or dependency.

Registering the supplied colour property enables a 240ms colour interpolation across gradient/glow layers. The reduced-motion rule also covers the dock itself. Geometry, safe areas, fullscreen handling, blur, lens, pointer interactions and spring navigation code are unchanged. Existing appearance storage (`ea-cloud:client:<id>:home-appearance`) continues to persist the selection.

Changed files are this document, the shared stylesheet and `scripts/tests/navigation-theme.browser.mjs`.

## Verification

- EA app TypeScript check and production `build:pages` pass.
- Existing home-preferences and iOS standalone detector tests: six pass.
- New production-build browser check passes all seven current colours through the real Settings buttons. It checks intermediate colour interpolation, distinct themed borders/background/glow/outline, unchanged inactive colour, all three interfaces, Home/Settings/MetaTrader and scanner navigation, reload and a fresh browser context using persisted storage, plus reduced-motion behaviour.
- The browser check asserts unchanged dock/control bounding boxes, full-width bottom anchoring, safe-area control clearance and no horizontal overflow or outer scrolling. It uses an iPhone user agent, standalone flag and emulated safe-area insets in Chromium; a new browser context is not a physical PWA relaunch.
- Existing iOS standalone fullscreen browser regression also passes all five cases: notch, island, landscape, Safari-tab and Android PWA, including its deliberately shortened containing-block model.

Review screenshots are local artifacts in `work/navigation-theme/`, including `Pure-Red.png`, `Royal-Purple.png` and the other five colours. These show the real production-built UI with fixture account/branding data; no real account or database was changed.

Native Safari and installed iPhone testing are unavailable here. Physical-iOS colour appearance, relaunch persistence and system viewport behaviour require device acceptance. No metadata changed, and this patch requires no reinstall, database migration, environment variables or API deployment. Only publish the frontend after approval.
