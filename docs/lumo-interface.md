# Lumo interface

Lumo is a fourth, independent Home presentation. It uses actual React controls and scoped CSS rather than rendering the reference screenshot. The portrait card (7:10), overlapping identity badge, left menu, large bot name, glossy three-control capsule, powered-by badge and lower information panel follow the supplied reference proportions. The shared BottomNav is reused without markup, style or safe-area changes.

## Existing services and data

- `bgImageUrl` is the existing decoded mentor/mode image from `useVisualModes`; the card, identity avatar and reflection all follow the same source. Missing/broken images use the existing packaged `robotBg` fallback. No image storage or upload API was added.
- The current mentor bot name, tagline, symbols, selected font, mode and accent come from AppContext. There is no reference bot name/image hardcoded in the component. The existing powered-by label elsewhere in the app is EA Cloud; no mentor-specific powered-by field is exposed, so that platform fallback is used.
- The primary BotName retains its existing background toggle, keyboard access and selected font. Its reserved card geometry does not change when the background is toggled.
- Lumo's own card has the reference's rounded portrait geometry. Regular, Matrix and S2tone_ keep their independent shape presentation and preferences.
- Start/Stop calls the same `setBotRunning` hook. The identity badge distinguishes a confirmed enabled robot, paused state and unconfirmed status; it does not invent a live trading/MT5 connection status. Existing activation failures, voice announcements, push events and activity-panel behavior stay under their existing owners.
- Quotes and Remove open the existing Home panels/confirmation flow. The menu calls the existing Settings navigation. The information link opens the existing floating activity monitor. No alternative command, removal or trading-execution implementation was introduced.
- The information section shows existing bot context, not invented balance, profit, equity, performance or connectivity metrics. Those verified details remain in the existing activity monitor.
- The shared swipe order is Regular → Matrix → S2tone_ → Lumo → Regular, reversible. The same Settings selector and account-scoped local preference store persist the selection. No account, database or server configuration changes are needed.

## Files

| File | Change |
| --- | --- |
| `artifacts/ea-app/src/components/LumoLayout.tsx` | New presentation component and connections to existing callbacks/context. |
| `artifacts/ea-app/src/components/LumoLayout.css` | Lumo-scoped responsive glass, theme accents and portrait proportions. |
| `artifacts/ea-app/src/context/AppContext.tsx` | Fourth interface identifier. |
| `artifacts/ea-app/src/lib/home-preferences.ts` | Fourth swipe/persistence entry; existing defaults unchanged. |
| `artifacts/ea-app/src/pages/SettingsTab.tsx` | Fourth selector option. |
| `artifacts/ea-app/src/pages/HomeTab.tsx` | Mount Lumo and reuse Quotes/Remove handlers; Lumo-only header/scroll clearance. |
| `artifacts/ea-app/src/App.tsx` | Pass existing Settings navigation to Lumo's menu. |
| `scripts/tests/lumo.browser.mjs` | Real built-app mobile/desktop checks and screenshots using isolated API fixtures. |
| `scripts/tests/home-preferences.test.mjs` | Four-way order and account-scoped Lumo persistence. |
| `scripts/tests/home-interactions.browser.mjs` | Adapt existing swipe expectations to the new fourth slot. |
| `scripts/tests/voice-assistant.browser.mjs` | Exercise existing voice triggers on Regular/mobile and Lumo/desktop. |
| `scripts/tests/free-voice.test.mjs` | Stabilize a pre-existing clock-tick race: the test's fresh snapshot must be timestamped at/after its request, matching the production freshness rule. No voice runtime logic changed. |
| `docs/lumo-interface.md` | Implementation, validation and publication notes. |

## Validation

- All 161 Node tests pass, including isolated PostgreSQL Web Push/security and voice regressions. An initial parallel run exposed the existing clock-tick race described above; it was corrected in the test fixture and the full suite rerun successfully.
- EA app TypeScript and the complete production Pages build pass. The existing large-bundle warning remains.
- The real built app passes Lumo browser checks at 320×568, 390×844, 430×932 and 1280×900: Settings selection, both swipe directions, persisted selection/theme, dynamic mentor name, long names, missing-image fallback, image refresh, background toggling without geometry changes, Quotes, Remove confirmation, successful/failed Start and Stop, activity monitor, theme integration and dock bounds.
- Instrumented audio browser checks pass with Lumo selected, including welcome, Start/Stop failures/success, connection stages, saved symbols, modes, scanner signals and existing execution events. They verify triggering/text/order, not a new perceptual voice-quality evaluation.
- The existing portrait suite passes all 12 Regular/Matrix/S2tone_ interface/viewport combinations. The broader Home touch/navigation suite passes at 390×844, 360×800 and 1280×900. The three legacy layout function implementations are byte-identical to the branch's main baseline.
- The unchanged real push service worker passes notification, duplicate, account-scope and closed-app-page dispatch checks in Chromium. These are injected local push events, not real APNs/FCM delivery tests.
- Shared BottomNav, floating monitor, voice hook, push worker, backend APIs and database code are unchanged. The existing safe-area implementation is reused; browser dock bounds are flush with the viewport bottom.

Screenshots and detailed fixture results are under ignored `work/lumo/`, including red/purple mobile/desktop previews and the information section. The robot shown in these local tests is the repository's existing default image, supplied through the mentor fixture; production uses the actual current mentor source.

Physical iPhone Home Screen PWA layout/audio/push behavior, native status-bar compositing and real provider delivery could not be tested in this workspace. These remain owner acceptance checks after an approved release; browser emulation is not a physical-device result.

## Publication

This is frontend-only: publish the normal Cloudflare Pages build after review and approval. No Render release, environment changes, database migration, new keys or paid service is required. Existing notification enrollment/provider settings remain prerequisites for native push delivery. Do not merge or deploy automatically. This task makes no production database or configuration changes.
