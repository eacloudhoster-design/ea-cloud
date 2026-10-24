# Fullscreen, backgrounds and EA Manipulation fixes

## Findings and changes

The main app and its fixed background image were independently capped at 430px. Larger iPhones, tablets and desktops therefore could not render a genuine full-width app. The standalone page-canvas artwork was also restricted to screens at most 430px wide. The dock was anchored to an inner box whose height was calculated separately from its top offset, and the bottom control inset was capped at 20px even when the device reports 34px. Foreground bottom/side safe-area variables were forced to zero. These are confirmed code-level limitations; the precise native iOS 26.5 compositor behavior behind the reported strip has not been reproduced on a physical iPhone.

The actual app viewport is now fixed edge-to-edge with 100vh/100svh/100dvh fallbacks; its inner content is anchored between the existing top safe inset and bottom zero, rather than relying on a separate top-plus-height calculation. The dock remains a child of that box, touches the viewport bottom, and its original glass surface includes the full bottom inset. Only its unchanged 60px control row is lifted above the home-indicator area. The top inset is reserved once. Landscape side insets protect the Home/MT5 content and navigation controls. No negative margins, translation hacks, second dock or hardcoded device-model layout were introduced.

The existing background layer is absolute inside the full viewport and uses 100% width/height with object-fit:cover and centered cropping. It extends behind navigation, while foreground positions retain their original top-safe offset. Page-canvas mentor artwork now works at every width; the existing hook still enables/cleans it up only for authenticated standalone sessions and respects the background toggle. Existing interface/background/mode storage keys, images, upload pipeline, transitions and selected sources are unchanged. The stored preference to hide a background is respected. The original viewport-fit=cover and black-translucent metadata, first-paint/launch artwork and startup/voice sources are untouched.

## Licence investigation and access control

The old artwork endpoint used a single combined rejection for all approval/key/mentor/status/expiry problems. It required both a stored mentor_id and an exact untrimmed license_key. The existing approval handler can return early for an already-linked mentor without resolving a missing key; legacy/manual links can therefore fail this narrower artwork check. A key with surrounding whitespace also failed lookup. Dashboard access uses a different, less specific check, so reaching Home alone never proved that the artwork entitlement check passed. No production account row was available in this workspace, so the exact condition affecting the reported account is **not confirmed**.

`resolveEaModeAccess` reads fresh persisted account/licence rows on every request. It trims an explicit key, requires approval and active/unexpired status, and validates mentor association plus the issued email. Email comparison is trimmed, case-insensitive exact equality, never wildcard matching. An explicitly linked missing, inactive, revoked, expired or foreign key is never silently replaced with another active key.

For an approved legacy account with a mentor link but no key, the resolver can use an active, unexpired licence issued to that exact email by that same mentor. An owned explicit key can resolve its mentor when the account's mentor link is absent. Neither path writes/reassigns accounts or licences. Blank-email legacy licences retain the existing explicit-key plus matching-mentor policy; they cannot qualify through the email-only fallback. Returned artwork is scoped only to the verified mentor's active EAs. Authentication and mentor-editor ownership checks remain in place.

Denied access now reports specific codes/messages: ACCOUNT_NOT_FOUND, ACCOUNT_NOT_APPROVED, LICENCE_NOT_FOUND, LICENCE_NOT_LINKED, LICENCE_ASSOCIATION_MISMATCH, LICENCE_INACTIVE, LICENCE_EXPIRED or MENTOR_NOT_LINKED. Sanitized warnings log only the event/code/client ID, not licence keys, email addresses or credentials. No-store responses and existing focus/refresh/retry behavior remain intact.

“Appearance only · trading settings stay unchanged” was removed with no replacement text. The four existing Normal/Beast/Aggressive/Ultimate cards, images and selection behavior are preserved. No trading parameters changed.

## Verification

- Client and API TypeScript checks; combined production Pages build and API build passed.
- Isolated PGlite/Drizzle/Express tests verify active/expired/revoked licences, pending accounts, foreign-key/mentor ownership, key whitespace, exact email matching, safe legacy associations, no fallback around a revoked/expired explicit key, and no account writes during access checks. Existing six assistant and mode integration groups passed.
- Actual mentor upload → PostgreSQL metadata → owned client API → mode/image switching → reopen/isolation browser flow passed, including all four distinct uploaded images and unchanged trading settings.
- Device browser tests exercise 320px phone, notch, Dynamic Island-sized 440px screen, Android, tablet, desktop and landscape. Each runs Regular/Matrix/S2tone, safe-area overrides, full viewport/background/dock geometry, no document overflow, navigation/settings/MT5/scanner, mode selection, background toggle, reload persistence and viewport/orientation resize.
- Existing navigation tests passed retained MT5 form, drag selection and reduced motion. Updated their retired popup selector to the current fullscreen MT5 view and their expected safe inset to the full device inset.
- Existing voice browser regression passed saved Start/Stop, symbols, scanner reports, MT5 honesty, real WebSocket fixture confirmations, deduplication and mode announcements.
- Guest and standalone startup browser checks passed with the original animation timings and glow behavior. Startup TSX/CSS and voice source match main unchanged.
- Full Node suite: 130 tests, 127 passes, two optional database skips subsequently run explicitly, and one known pre-existing activity-monitor wording assertion failure (`Awaiting status`).

Browser/device data, MT5 and speech are fixtures; the database is isolated in-memory PostgreSQL, never production. Chromium standalone/safe-area emulation is not physical iOS verification. Local results/screenshots are under work/fullscreen-fixes; the mode upload regression is under work/ea-mode-tests. Test fixture corrections (preserving localStorage on reload, leaving open accordions open, and waiting for resize crossfades before screenshots) did not require application changes.

## Deployment and account steps

After approval, deploy the API service and combined Pages frontend (`pnpm run build:pages`). No new environment variables, services, paid dependencies or schema migrations are needed. No production records were modified. Existing ea_mode_images storage/migration is unchanged.

A correctly owned/active licence resolving through the safe legacy path needs no database repair for artwork access. A genuine missing/expired/mismatched association must be corrected through the existing activation/admin workflow; this patch does not renew, grant or rewrite it. The new response code and sanitized Render log identify the failing condition. Existing scanner subscriptions/credits and hosting/trading licence checks elsewhere are untouched.

Physical iPhone iOS 26.5 testing remains necessary: installed-PWA top/bottom compositor coverage, home-indicator comfort, notch/rotation, keyboard/browser chrome changes and relaunch behavior. No PWA metadata changed, so this patch does not itself require deleting/reinstalling the Home Screen app. Load the approved updated frontend in the installed app; do not assume a browser screenshot proves the native status-bar region.

## Exact changed files

- artifacts/api-server/src/lib/ea-mode-access.ts
- artifacts/api-server/src/routes/ea-mode-images.ts
- artifacts/ea-app/src/App.tsx
- artifacts/ea-app/src/components/BottomNav.css
- artifacts/ea-app/src/components/EaModeCards.tsx
- artifacts/ea-app/src/components/HomeInteractions.css
- artifacts/ea-app/src/index.css
- scripts/tests/ea-mode-images.test.mjs
- scripts/tests/edge-to-edge-navigation.browser.mjs
- scripts/tests/fullscreen-device.browser.mjs
- docs/fullscreen-mode-fixes.md
