# Interactive main bot portrait

The main portrait in Regular, Matrix and S2tone now supports a single tap to alternate the existing `neural` (rounded square) and `orbit` (circle) values. A double tap hides it; a double tap on an empty part of its former image area restores the last visible shape. Enter/Space and assistive activation also work; Escape hides the portrait. The existing Settings shape picker remains unchanged and uses the same preference.

## Interaction and layout

`InteractiveBotPortrait` uses primary pointer events for touch, mouse and pen. A single action waits 300ms to distinguish a double tap. A second tap within 300ms and 24px cancels the single action. Movement beyond 10px, long presses, scrolling, pointer cancellation, navigation and account/bot changes cancel pending gestures. It uses the existing interface-swipe exclusion mechanism only on the visible portrait; native vertical scrolling remains available.

The None slot animates to zero height and zero bottom margin. The image/frame are unmounted after the exit, with no visible placeholder. Restoration uses coordinate checks in a capture listener, not a pointer-active overlay. Interactive controls are excluded, so a button which now occupies part of the old portrait area retains its normal action. Touch browsers may expand nearby control hit targets; restore on the empty background portion of the former portrait area, or use keyboard/Settings. Main portrait gestures are disabled while Home's Quotes/Trades/Remove overlays are open. The floating bot trigger remains separate.

The existing portrait dimensions/centres and Matrix decorative rings are retained. Normal shape changes keep the same image/frame DOM mounted, interpolating CSS border radius over 380ms. A small opacity-based breathing glow, tap pulse and slightly stronger dismiss pulse use the current accent colour. Framer Motion is already a dependency and handles height, fade and scale transitions; reduced motion disables the transitions/effects. No new dependency was added. Regular/S2tone's old None padding and Matrix's old None title offset are removed because they reserved a portrait-sized gap. Matrix's None minimum height also collapses so its controls follow the compact content naturally.

## Persistence and mentor data

Preferences stay local, under the existing account prefix, now scoped to mentor/EA identity and interface:

```text
ea-cloud:client:<id>:robot-shape:bot:<encoded mentor/EA identity>:interface:<regular|matrix|s2tone>
```

The value is `{ "shape": "none", "previous": "neural" }`, for example. Bot images/names and tokens are not stored in this record. The old account-only shape preference is retained as an initial fallback; it is not overwritten. Blocked/malformed storage falls back safely and current-session interaction continues. Changing images or visual modes does not change the shape's scope.

Repository inspection found client shape controls, but no persisted mentor-shape field or mentor shape editor in the current backend/portal schema. The app honours a valid optional `mentor.shapeStyle` if supplied by the dashboard payload; otherwise it preserves the old client preference/default circle. A saved scoped client preference takes precedence. This does **not** claim to add mentor-side shape persistence. No database/API/portal changes are made. Mentor artwork continues to come from the existing branding/mode data and refreshes independently.

## Changed files

- `artifacts/ea-app/src/App.tsx`: scoped preference/default wiring.
- `artifacts/ea-app/src/context/AppContext.tsx`: optional last-visible shape.
- `artifacts/ea-app/src/hooks/use-shape-preference.ts` and `lib/shape-preference.ts`: persistence and restoration state.
- `artifacts/ea-app/src/pages/HomeTab.tsx`: wrap only the three main portraits, collapse old None spacing and protect existing overlays.
- `artifacts/ea-app/src/components/InteractiveBotPortrait.tsx/.css`: pointer recognition, hidden-region restoration and animations.
- `artifacts/ea-app/src/components/RobotImageFrame.tsx/.css`: stable CSS radius morphing, cover image and themed lighting.
- Tests: `portrait-preference.test.mjs`, `interactive-portrait.browser.mjs`, `robot-shape.test.mjs`, `shape-selection.browser.mjs`, `none-shape-layout.browser.mjs`.
- This document and a historical notice in `docs/none-shape-layout/README.md`. The old None browser entry point delegates to the current gesture/layout suite; its historical screenshots predate fullscreen navigation and the newly requested collapsing layout.

No navigation, trading, licensing, voice, startup, image upload, font or Settings UI source is changed.

## Verification and release

Focused preference/render tests, EA app TypeScript and the combined Pages production build pass. The full unit suite reports 140 tests: 137 passed, the existing unrelated activity-monitor wording assertion failed, and two optional database integrations skipped. No database was accessed for this UI feature.

The production-build browser suite covers all three layouts at 320×568, 390×844, 430×932 touch viewports and a 1280×900 desktop viewport: single/double taps, no accidental single action on a double tap, intermediate radius, unchanged image node/source/centre, None collapse, persisted restoration, keyboard controls, reduced motion, theme changes, mentor-artwork refresh, closing/reopening, and floating bot drag/open. Existing Settings selection and neural-announcement browser flows also pass. Browser API/account/audio fixtures are isolated; no live trading is performed.

The final-build 390px rerun also checks dismiss/restore animation states and opening Quotes/Symbols while None is selected. The existing fullscreen browser regression passes notched and landscape cases, including safe areas, navigation bounds, mode artwork, scanner and MT5 pages.

Review captures are in `work/interactive-portrait/`, including the rounded-square, circle and None states at the 390px viewport. The fixture uses existing repository artwork, not a production account. Physical iPhone Safari/PWA and real-device animation smoothness are not available here; Chromium touch emulation does not verify those native behaviours.

After approval, deploy only the combined Pages frontend (`pnpm run build:pages`). No API redeployment, migration, environment-variable change, paid service or PWA reinstall is required. Do not merge or deploy automatically.
