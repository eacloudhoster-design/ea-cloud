# Rectangular glass navigation

The existing shared BottomNav now uses an 18px rectangular dock and a 12px selection highlight. It retains the existing pointer/spring hook, reflections, background lens, blur, keyboard controls and user accent. Four-pixel side gutters respect left/right safe areas. The bottom offset is `max(2px, env(safe-area-inset-bottom))` in both browser and standalone windows, so the dock stays immediately above the reserved home-indicator area. The previous standalone override could place the dock inside that area and has been removed.

Home, Settings and the mounted MetaTrader form crossfade over 240ms. Outgoing screens become inert immediately; MetaTrader is hidden after its exit fade. The existing navigation component remains mounted, preserving the indicator position. Reduced-motion preferences disable fades. Screen content, form state, mentor imagery, themes, APIs and database behavior are unchanged.

## Validation

- `pnpm_config_verify_deps_before_run=false pnpm run build:pages`: passed (existing chunk-size warning).
- `node node_modules/typescript/bin/tsc -p artifacts/ea-app/tsconfig.json --noEmit`: passed.
- `node --test scripts/tests/*.test.mjs`: 109 passed, one existing unrelated activity-monitor test failed because it expects `Awaiting status` rather than the current monitor wording.
- `APP_ORIGIN=http://127.0.0.1:5205 node scripts/tests/rectangular-navigation.browser.mjs`: local production-build fixtures; 15 viewport/interface combinations, all three navigation buttons, stable geometry, indicator containment, glass styling and no overflow. Sizes: 320x568, 390x844, 393x852, 430x932, 844x390; simulated bottom safe-area insets 0/21/34px. Additional checks cover retained MT5 account input, drag selection and reduced motion.

Screenshots and measured geometry are in `work/rectangular-navigation/` (not committed). Tests use fixture account/artwork responses; they do not access production accounts or execute trades.

Physical Safari and installed iOS PWA testing is still required before approval. Chromium safe-area emulation verifies layout geometry, not native iOS glass rendering or installation behavior. Browser and standalone now share the same safe-area rule with no display-mode override.

## Publishing

Only the frontend needs rebuilding/deployment after approval. No backend redeployment, environment variables, migrations or account changes are required. Keep the PR unmerged and do not deploy until approved.
