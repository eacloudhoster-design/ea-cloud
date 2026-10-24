# Shared app-session access and viewport-anchored navigation

## What was actually inconsistent

Before this follow-up, client login verified credentials and returned a token/any saved key without validating that licence's current state. EA Manipulation then imposed its own additional licence gate. An account could therefore enter Home but receive a different decision in Settings, which caused the hook to clear the four cards. The combined inactive/revoked error was also inaccurate for unsupported or differently formatted status values. Production account rows were not accessible, so no claim is made that the reported account's stored licence was actually revoked.

There is now one shared `resolveAppSessionAccess` policy and `requireAppSession` middleware for the licensed app session. Login, `/app/me`, protected app routes and client WebSocket subscriptions use it. The EA Manipulation handler only reads the verified session's mentor and retrieves that mentor's active EA images; it has no additional feature-specific approval/licence decision. The middleware caches the verified result on the request so a route guard does not repeat the licence lookup after the global app guard.

Known licence status words are normalized for surrounding whitespace/case. `active` requires ownership/mentor consistency and an unexpired date; real `inactive`, `revoked`, `expired` and unknown statuses remain denied with distinct reasons. Explicit invalid keys are never replaced silently. Existing verified legacy association handling is shared with login rather than being an EA-only exception. No client-provided flag is trusted as approval or licence validity.

Credential authentication still permits the existing activation/renewal screen (`sessionAccess: setup`, no app licence in the returned client DTO) when a licence is missing/invalid. This does not grant application access: the setup token is rejected by protected app routes until an owned, active, unexpired licence is verified. Valid login returns app access and the same token succeeds on `/app/me` and EA Manipulation. This preserves renewal without letting a revoked licence enter Home. Activation now rejects expired keys and invalid key types before any account write. The existing token format/password authentication is retained; this is not a replacement authentication protocol.

On genuine revocation/expiry, protected app requests return HTTP 401 through the shared session system. `/app/me` is uncached; the visible app checks it every 20 seconds and on focus/visibility changes, clears the saved session on authoritative rejection and unmounts private screens. A mode request reporting 401 triggers the same app-wide invalidation immediately. Transient service failures do not masquerade as revocation or destroy credentials. Open client WebSockets use the same policy on connect and scheduled 20-second rechecks; revoked subscriptions close with 1008. A failed database recheck closes the subscription with retryable 1013 rather than continuing unverified private broadcasts. Recheck processing time can add to the scheduled interval.

Account setup endpoints remain available for sign-in, approval polling and activation. Existing independent scanner subscription/credit authorization is unchanged; no new scanner feature licence rule or quota bypass is introduced. Mentor/superadmin portal authentication, trading calculations/order logic and standard voice announcements are unchanged. The legacy assistant backend also consumes the shared session instead of retaining a second hosting-licence policy.

## Why the previous layout adjustment was insufficient

The fixed app root had both top/bottom anchors and an explicit `100dvh` height. This over-constrains a fixed box: if WebKit's reported viewport-unit height differs from the actual fixed positioning viewport, the height wins and the bottom constraint cannot fill the discrepancy. The dock was also inside `.ea-app-content`, which is a CSS size container and clipping context. Its bottom was the content box's bottom, not an independent viewport anchor.

The root now uses fixed `inset:0` with automatic height. The real main dock is moved outside the content size container and is fixed directly at bottom/left/right zero. Its existing glass surface covers the full safe-area inset, while the unchanged controls remain above it. No second dock/backdrop, negative margin or solid-colour cover was added. The scanner retains its existing own navigation while open; the underlying main dock is not duplicated. Settings content uses the existing nav-clearance variable so the last controls are not covered. Backgrounds still fill the root with cover proportions and retain the configured shared mode-image behavior and visibility preferences.

The native iPhone compositor itself has not been tested. This fixes a concrete CSS constraint/containment problem and is validated in rendered browser geometry; it is not proof of native iOS status-bar/home-indicator coverage.

## Four-card restoration and evidence

The original four-column portrait-card grid, aspect ratio, rounded corners, labels and uploaded image mapping are retained: normal → image 1, beast → image 2, aggressive → image 3, ultimate → image 4. The active border/glow now uses the existing selected theme colour instead of a fixed cyan value. Only one card is selected; the existing per-client/per-EA storage, predecoded shared image switching and committed-mode voice events remain in use. No trading parameters or background mapping were invented/changed. The previously removed Appearance-only line remains absent.

The text references three screenshots, but those image files were not attached in this turn; the implementation preserves the existing card geometry rather than claiming an exact pixel comparison to unavailable reference images.

Verification used the actual production frontend and real server routes against an isolated in-memory PostgreSQL database:

- Client/API TypeScript and production Pages/API builds pass.
- Actual password login → returned token → `/app/me` → four-mode API returns success for an approved owned valid licence. Inactive/revoked/expired/foreign/unknown cases fail shared app access; case/whitespace-only `Active` variants work. Setup-only login cannot call protected app routes. Failed activation leaves the account association unchanged; an owned unexpired key can be activated explicitly.
- An actual local WebSocket server accepts the valid session and closes its already-open subscription after database revocation at the scheduled recheck. Six assistant/mode integration groups pass.
- Mentor upload → PostgreSQL metadata → client rendering runs with four uploaded image assets, all four selectable modes, both profile shapes, Regular/Matrix/S2tone, theme selection, reload/tenant isolation and slow-image protection. The browser then revokes the fixture licence, verifies global sign-out, restores the fixture's valid entitlement and verifies all four cards reappear. No trading writes occur in mode switching.
- Seven emulated sizes pass fullscreen/background/dock/card geometry and persistence. Tests also scroll Home and shorten the inner content box by 90px: the real dock stays at the viewport bottom. Final notch/island/landscape runs pass after Settings clearance changes.
- Navigation drag/retained MT5 form/reduced motion, scanner view, existing voice browser flow and guest/standalone startup regressions pass. Startup and voice source are unchanged.
- Full Node suite: 130 tests, 127 passed, two optional database skips subsequently run explicitly, and the same pre-existing activity-monitor wording assertion failure (`Awaiting status`). This is not an all-green full-suite claim.

Local screenshots: `work/ea-mode-tests/restored-four-cards.png`, `work/ea-mode-tests/restored-home.png`; layout/device results: `work/fullscreen-fixes/`. These are rendered application screenshots with test-uploaded assets, not generated mockups. No production account/data was changed and no live trades or paid AI calls were made.

## Deployment and remaining verification

After approval, deploy **both API and combined Pages frontend** from the PR. The API is required: deploying CSS alone leaves the old feature gate/session behavior in service. No database migration, new environment variable or dependency is required. Valid existing sessions continue through fresh server verification; genuinely revoked/expired sessions are invalidated as intended. No production licence was activated, renewed, edited or reset during this task.

The deployed `https://ea-cloud-website.pages.dev/ea-app/` could not be inspected: the execution proxy returned CONNECT HTTP 403 and the web reader could not access it. Therefore live deployment/customer-account behavior is not verified. Physical installed iPhone PWA testing remains required for the final bottom edge, system gestures, rotation and keyboard/chrome behavior. Metadata is unchanged, so no Home Screen reinstall is required by this patch. No merge or production deployment was performed.

## Exact changed files

- `artifacts/api-server/src/lib/ea-mode-access.ts` → `lib/app-session-access.ts` (shared policy rename)
- `artifacts/api-server/src/middlewares/app-session.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/client-app.ts`
- `artifacts/api-server/src/routes/ea-mode-images.ts`
- `artifacts/api-server/src/routes/assistant.ts`
- `artifacts/api-server/src/ws.ts`
- `artifacts/ea-app/src/App.tsx`
- `artifacts/ea-app/src/components/BottomNav.css`
- `artifacts/ea-app/src/components/HomeInteractions.css`
- `artifacts/ea-app/src/components/EaModeCards.tsx`
- `artifacts/ea-app/src/components/EaModeCards.css`
- `artifacts/ea-app/src/hooks/use-visual-modes.ts`
- `artifacts/ea-app/src/pages/SettingsTab.tsx`
- `scripts/tests/ea-mode-images.test.mjs`
- `scripts/tests/assistant.test.mjs`
- `scripts/tests/helpers/ea-mode-browser.mjs`
- `scripts/tests/fullscreen-device.browser.mjs`
- `scripts/tests/edge-to-edge-navigation.browser.mjs`
- `scripts/tests/ios-layout.browser.mjs`
- `scripts/tests/voice-assistant.browser.mjs`
- `docs/session-mode-navigation-restoration.md`

Browser selector changes locate the moved actual dock. Session test expectations use 401 for app-wide invalidation while retaining 403 for separate scanner entitlement denials. No image assets, startup animation, trading strategy or execution code was edited.
