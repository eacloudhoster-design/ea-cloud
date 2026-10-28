# Client control panel customization

Regular, Matrix and Lumo share one control-panel preference. Existing accounts default to **Default Panel**, which retains the original shared control surface, dimensions and callbacks. **Regular Panel** adds a dark pill and highlighted rounded-square toggle; **Matrix Panel** has separate outlined circular Remove, Start/Stop and Symbols controls. The selected accent color continues to apply.

Choose Settings → Control Panel, or swipe left/right directly on the control surface to cycle Default → Regular → Matrix (reverse on right swipe). Settings includes non-interactive CSS previews. Changes are local presentation only: they never invoke robot, MT5, trading, Scanner, Live Shot, voice or push commands. Matrix's Symbols action uses the existing Quotes/Symbols screen; Remove still opens the existing confirmation.

The existing per-client `home-appearance` storage record persists `controlPanel`. Missing/invalid values default safely; other appearance fields retain their current values. Storage failures leave the selection available in memory. No database, backend, dependency or environment changes are needed. S2tone_ does not mount this component and ignores the preference.

All variants retain the original shared width and 118px height, including existing interface control slots. No viewport, safe-area, background, portrait, navigation or layout changes. A 240ms opacity/translation animation runs on the existing DOM surface when switching; reduced motion disables it. Pointer gestures accept deliberate horizontal touch/pen swipes, preserve vertical scrolling, capture horizontal drags, suppress their compatibility clicks, and remain isolated from interface swipes. Mouse/keyboard buttons work normally.

## Verification

- `node scripts/tests/home-preferences.test.mjs`
- `node scripts/tests/ios-native-viewport.test.mjs`
- `node scripts/tests/ios-standalone-layout.test.mjs`
- `pnpm --filter @workspace/ea-app typecheck`
- `pnpm run build:pages`
- Serve the combined Pages output locally, then run `scripts/tests/control-panel-customization.browser.mjs`, `scripts/tests/shared-control-panel.browser.mjs`, and `scripts/tests/premium-settings.browser.mjs` with `APP_ORIGIN=http://127.0.0.1:5234/ea-app/` and the installed `PLAYWRIGHT_MODULE` path.

The shared-panel browser test supports `BASELINE=1` against the original build to capture surrounding geometry, then checks the updated Default surface against it. Customization tests cover 320/390/1280px, real browser touch dispatch, both cycle directions, vertical scrolling, no commands on swipes/settings changes, existing actions, active state, cross-interface selection, Settings synchronization, reload persistence, S2tone exclusion, viewport scale and stable surrounding geometry. API responses are isolated fixtures; no production trades or service requests are performed.

Native iPhone Home Screen PWA and Android device checks still require manual verification. Preserve the site's existing 100% Safari Page Zoom; this feature does not override browser user zoom.

## Release (only after approval)

Review and merge the focused PR, then deploy the reviewed frontend commit through the existing Cloudflare Pages workflow: build `pnpm run build:pages`, output `artifacts/ea-cloud/dist`. No Render, Windows/VPS, credential, database or environment changes. Confirm the deployed commit and reopen the PWA; test all variants and both swipe regions. To roll back the feature, revert this PR's frontend commit and rebuild Pages; the extra stored preference is harmless to the previous build. Do not reset browser storage or account data.
