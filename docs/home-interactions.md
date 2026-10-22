# Home interface swipes and background visibility

## Runtime files

- artifacts/ea-app/src/App.tsx: wires persisted shared preferences and the
  full-screen image opacity; disables Home swiping while the scanner is open.
- artifacts/ea-app/src/pages/HomeTab.tsx: connects Home touch handlers and
  directional transitions; makes S2tone/Matrix names interactive and retains
  the Regular name button with its existing geometry.
- artifacts/ea-app/src/components/BotName.tsx and BotName.css: optional accessible
  tap/keyboard action for the existing text, with no font/size/position changes.
- artifacts/ea-app/src/components/HomeInteractions.css: scoped 250ms slide/fade
  effects, native vertical panning/pinch zoom and reduced-motion support.
- artifacts/ea-app/src/hooks/use-interface-swipe.ts: deliberate-touch detection,
  ignored controls/overlays, cancellation and direction.
- artifacts/ea-app/src/hooks/use-home-preferences.ts: the single shared interface
  and visibility state exposed through the existing AppContext.
- artifacts/ea-app/src/lib/home-preferences.ts: validated persistence and gesture/
  cyclic-order helpers.

SettingsTab and its selection controls are unchanged: Settings and touch gestures
call the same setInterfaceStyle and read the same interfaceStyle. The order is
Regular -> Matrix -> S2tone -> Regular, reversed for right swipes. Horizontal
movement must reach 60px, dominate vertical movement by 1.5x, and finish within
1.2 seconds. Vertical intent cancels the gesture; native scrolling stays enabled.
Pointer cancellation and multiple fingers cancel navigation. Mouse dragging,
controls/editable fields and overlays do not switch interfaces. The outermost
16px are reserved for browser/OS edge navigation. A 250ms guard prevents
duplicate switches during the transition.

The full-screen background alone fades between opacity 1 and 0, over the existing
black app base. Profile images, smaller avatars, existing accent glows, bot-name
typography/geometry, navigation and trading handlers are untouched. The image
stays mounted so the current mentor artwork restores without remount flicker.
Bot-name keyboard activation is also supported; no new visible control is added.

## Persistence

The existing account-scoped localStorage approach used for font/shape settings
is reused. The new key is ea-cloud:client:<clientId>:home-appearance, containing
JSON {interfaceStyle, showBg}. Defaults preserve existing behaviour: Matrix and
visible background. Both values survive navigation, layout changes and reload/
reopening in the same browser profile. Settings are separate between accounts;
they are not synchronized across devices. Invalid/unavailable storage falls back
safely, with in-session changes still possible. Token decoding only namespaces
local UI settings; authentication and authorization remain server-validated.

## Verification

- scripts/tests/home-preferences.test.mjs covers both cycles, threshold/angle/
  duration rejection, validated defaults, persistence, account isolation and
  blocked/corrupt storage.
- scripts/tests/home-interactions.browser.mjs runs the real app with Chromium
  CDP touch input and isolated local API fixtures at 390x844 and 360x800 mobile
  and 1280x900 desktop.
- Browser assertions cover forward/reverse cycles, Settings synchronization,
  short/vertical/control/cancelled/multitouch/mouse gestures, overlays, native
  scrolling where content overflows, 250ms animations, repeated name taps,
  unchanged name geometry/fonts and profile images, keyboard operation,
  original Start/Stop request bodies, Remove/Symbols actions, and preference
  persistence through reload/reopening and account switches.
- Physical iOS Safari and Android devices were unavailable; native OS edge
  navigation cannot be verified in Chromium emulation.

Run all Node tests with node --test scripts/tests/*.test.mjs. Run client TypeScript
with node node_modules/typescript/bin/tsc -p artifacts/ea-app/tsconfig.json --noEmit.
Build both Pages applications with pnpm run build:pages. In this sandbox,
pnpm_config_verify_deps_before_run=false uses the already-installed workspace
instead of triggering a package-manager reinstall. Existing Vite sourcemap and
chunk-size warnings may remain.

Serve the built client locally at /ea-app/, then run:

    HOME_ORIGIN=http://127.0.0.1:5181 node scripts/tests/home-interactions.browser.mjs

Playwright and Chromium must be installed. Screenshots/metrics are written to
work/home-interactions. Fixtures do not contact production accounts or databases.

Frontend-only deployment after review/approval. No database migration, account
configuration, API endpoint, backend deployment, environment variable or new
dependency is required. Nothing is merged or deployed by this task.
