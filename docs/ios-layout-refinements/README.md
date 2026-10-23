# iOS layout refinements

## Causes and scoped fixes

1. ChartScannerModal.css still styled .scanner-navigation as the old full-width
   gradient footer: tinted background, top border and backdrop blur. Its colour
   followed the selected accent, producing the reported blue rectangular block.
   The wrapper is now transparent and pointer-pass-through, with no border or
   blur. The shared .ea-glass-bar retains its own frosted background, blur,
   reflections, border, lens, active pill, colours and interaction animations.
   Scanner artwork and scroll content are unchanged.

2. MetaTraderPopup was a bottom sheet above the navigation, originally 78% high
   with an empty header row. Latest main b28a08a had improved it to nearly full
   height, removed that row, enlarged labels and reset scroll on opening, but
   still kept an exposed strip, rounded sheet border and dark blurred backdrop.
   The existing mounted host now fills the complete application viewport.
   Only while MT5 is selected, App allows its artwork to extend through the
   existing status-bar inset. Content still respects the safe area; other
   sections keep their existing positions. The existing close control remains
   as a floating control, without consuming an empty header row.
   The form scrolls over the artwork with navigation clearance at the end.
   Main's 17px labels, scroll reset and all existing form/connection behaviour
   are retained. MetaTraderTab.tsx, its typography/input stylesheet, images,
   logos, account handling and connection adapter were not edited.

3. BottomNav.css owns the shared dimensions: 66px bar height (previously 62px)
   and max(4px, safe-area-inset-bottom) bottom spacing (previously max(8px,...)).
   The latest code already used the requested 10px side margins; these are
   preserved, with larger landscape safe insets taking precedence. This
   already matches the requested 10–14px target in normal browser mode.
   Latest main #50's compact iOS standalone gutter/bottom overrides are retained.
   Shared CSS clearance also prevents form content or the Settings dismiss
   target from covering navigation. No new navigation implementation was added.

Runtime files changed: App.tsx, components/BottomNav.css,
components/ChartScannerModal.css, components/HomeInteractions.css,
components/MetaTraderPopup.css, all under artifacts/ea-app/src.

## Checks and limits

- Client TypeScript and combined Pages website/client production build pass.
- Production UI checks cover 390x844, 320x568, 430x932, 393x852 (59px top / 34px
  bottom emulated safe areas), 844x390 landscape (44px horizontal / 21px bottom
  safe areas), a 390x420 short viewport and 1280x900 desktop.
- Checks assert full-viewport MT5 bounds/artwork, cover positioning, scrollable
  submit controls above navigation, password visibility, retained login and
  cleared password after reopening, close/Escape/navigation behaviour, scanner
  scrolling and transparent footer, consistent bar geometry in all sections,
  trade-settings navigation, glass drag/release, and no horizontal overflow.
- Before/after comparisons against main b28a08a confirm unchanged form typography/
  field surfaces, scanner artwork and navigation glass styling.
- Updated MT5 regression checks cover Regular, Matrix and S2tone at two phone
  sizes, including honest unverified connection completion and no network writes.
- Node suite: 109 of 110 tests pass. The pre-existing activity-monitor-ui test
  expects the removed text "Awaiting status". This same failure was reproduced
  by bundling baseline Git source, independent of these layout changes.
  The unrelated monitor and its assertion are untouched.
- Main #50's explicitly simulated compact iOS standalone geometry/interaction
  checks are retained, with expectations updated for the 66px bar and 4px base
  gap. They inject the exact scoped CSS declarations in Chromium and do not
  constitute native iOS testing.
- Physical iOS Safari, installed iOS PWA, real keyboard behaviour and physical
  Android hardware were unavailable. Safe-area/short-viewport emulation is not
  a claim of native-device testing.

Reproduce with a locally served combined Pages build at /ea-app/:

    APP_ORIGIN=http://127.0.0.1:5205 node scripts/tests/ios-layout.browser.mjs
    APP_ORIGIN=http://127.0.0.1:5205/ea-app/ node scripts/tests/metatrader-popup.browser.mjs

Playwright and Chromium must be installed. PLAYWRIGHT_MODULE may name an installed
Playwright module path. For optional before/after comparisons, first run
UI_STAGE=before against a baseline server, then supply
UI_BASELINE=work/ios-refinements/before-results.json to the after run.
Screenshots and results are written under work/ios-refinements. Fixtures use
isolated local accounts/API responses and never touch production accounts.

Run node --test scripts/tests/*.test.mjs for the Node suite; pnpm run build:pages
builds both frontends. This sandbox used pnpm_config_verify_deps_before_run=false
to use installed dependencies. Existing Vite sourcemap/chunk-size warnings remain.

Frontend-only review. No database/schema/API/authentication/trading changes,
migrations, paid services, new dependencies or backend deployment are required.
Deploy the reviewed combined Pages frontend after approval. Nothing is merged
or deployed by this task.
