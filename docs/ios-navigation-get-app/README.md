# Mobile menu, seamless navigation and Get App

This change implements the mobile-menu request and the two accompanying documents: the Get App redesign and removal of unnecessary session-verification interruptions.

## Mobile-menu root cause and fix

The original hamburger only called `open("navigation")`; it never toggled closed. Navigation was rendered inside the account sheet's modal Radix dialog, whose full-viewport overlay sat at z-index 80 above the header at z-index 50 and disabled background pointer interaction. A browser reproduction on the original build opened the menu with one tap, then timed out tapping the hamburger a second time. On the corrected build both taps reach the button and toggle its state.

Navigation now has a separate non-modal portal beneath the existing header. It uses standard buttons/click events, native scrolling inside the panel, an outside-click scrim, Escape, focus return, keyboard navigation and a 200ms fade. The account panel retains its existing modal sheet and drag behavior. Home, App, Features, FAQ and Support retain their labels and exact destinations. The existing Get App item opens the new public registration route.

The body is fixed only while navigation is open and its scroll position is restored on dismissal. The existing scroll-direction hook is unchanged. Its existing lock input now also covers history restoration, preventing a close/Back event from immediately hiding the header. Rapid reopening is queued safely until the temporary history entry has been removed. The header's design, icon sizes, centered cloud and desktop styles are unchanged.

## Session-navigation root cause and fix

The providers were already shared across routes, but several public anchors reloaded the document, public login forms were gated by initial session restoration, and the legacy website app wrapper replayed a timed splash on entry. Initialization and pageshow/focus events could also overlap verification requests.

- Internal public links now use the existing Wouter router. Auth providers remain mounted and React Query retains its existing cache.
- Public login and registration forms render without waiting for session checks. Redirects for an already verified account run before paint. In-flight checks are coalesced within each existing provider; no new authentication system, credential cache or expiration policy is introduced.
- Protected portal layouts and legacy client routes do not mount private children until the existing role/status/license checks authorize access. Unknown status gets a small protected-area placeholder, not a full-screen verification message. Denied/expired sessions redirect safely.
- BFCache returns, cross-tab authentication changes and explicit auth-change events force fresh validation and block protected content until it completes. Focus, visibility and existing timers still revalidate. Genuine failures expose a nonblocking Retry notice, including while a protected client route is waiting.
- Initial checks from an older generation cannot overwrite a later login. Explicit logout still calls the existing server endpoint, clears verified state and invalidates both cookie sessions through the unchanged backend.
- Website route content has a subtle 180ms appearance transition and respects reduced motion. It does not reset providers or impose an artificial delay.

`/ea-app/` is still a separately built trading application. Its genuine cold-launch branding/readiness flow is retained; entering it is an actual document handoff, followed by server session validation. Ordinary website navigation no longer launches that application merely to show a registration form. Existing direct `/ea-app/` links and installed app entries remain supported.

## Get App

Get App links now open the public `/get-app` route through Wouter. It reuses the trading app's existing `AccessScreen`, including the exact registration/login/reset/mode-selection handlers and original four fields, payload normalization, monthly plan, duplicate-account behavior and authenticated callback. A TypeScript AST comparison confirms those handlers are unchanged. Existing verified clients and successful account creation/sign-in hand off to `/ea-app/`, whose existing status/license flow handles the account.

The old blue panel is replaced by the same geometric background, transparent cloud, 3.6-second eyes, six circuit pulses and eight background traces used on the authentication pages. The cloud overlaps a dark red-bordered panel by 30px; the original headings, description, Access EA Cloud text and sign-in mode remain. There is no X button. The existing trading-account Sign In mode remains attached to `/api/app/login`; it is not changed into the separate mentor login.

The same redesigned component also serves direct trading-app access. Only its former guest-screen width/height wrapper was removed to allow responsive full-page presentation and document scrolling. No source image or dependency changes are included.

## Evidence

- [Open mobile navigation](mobile-menu.png)
- [Get App desktop](get-app-desktop.png)
- [Get App mobile](get-app-mobile.png)
- [Mobile menu results](menu-results.json)
- [Get App results](get-app-results.json)
- [Original handler comparison](get-app-handlers.json)
- [Session/navigation results](session-navigation-results.json)
- [Navigation and auth-page visual comparison](visual-comparison.json)

The original and corrected builds were compared at desktop 1440×1000 and mobile 390×844. Both header regions and both existing sign-in/sign-up viewports are pixel-identical, with identical measured control/panel/logo positions. Only Get App receives the requested redesign; public auth loading/redirect behavior changes without changing their healthy form designs.

## Validation and limits

- Full workspace type checks and production build passed. Final website type checking and both frontend builds/Pages output verification also passed.
- `ios-public-menu.browser.mjs`: six configurations cover iPhone Safari/Chrome user agents, Android Chrome user agent, 320px phone, touch landscape and a standalone flag simulation. Tests cover first/second taps, outside dismissal, Escape, native Back, every existing section, scroll hide/show, pinned menu/header, scroll restoration, profile access from an open menu, centered logo, client-side navigation and no route-triggered verification requests.
- `get-app-redesign.browser.mjs`: six desktop/mobile viewports cover original fields, custom validation, unchanged normalized registration/login payloads, loading/errors, original sign-in mode, successful app handoff, transparency/overlay alignment, eye on/off states, circuit/background motion, scrolling, keyboard-sized viewport and reduced motion.
- `seamless-navigation.browser.mjs`: public forms before session resolution, coalesced requests, visible outages, unknown/denied/wrong-role access, cached portal navigation, Back/Forward, BFCache blocking/revalidation, expired sessions, explicit logout, protected Back, late anonymous responses after login and protected-client Retry behavior.
- Existing `browser-session.browser.mjs`: real disposable-database cookie flow passes login, refresh, browser-process restart, app/portal return, outages, secure logout and mobile logout. Only its Retry selector changed for the new presentation.
- Existing `browser-session.test.mjs` passed persistent cookies, expiry, renewal, revocation and role isolation. `auth.integration.mjs` passed three cases; its existing TCP-only bootstrap case was skipped. The separate bootstrap diagnostics unit test passed.

All browser tests use **Linux Chromium**, including touch/UA/standalone simulations. **Physical iPhone Safari, iPhone Chrome, Android, installed iOS PWA, Windows and macOS browsers were not tested.** A WebKit download was attempted, but the environment rejected the browser CDN with HTTP 403 “Domain forbidden”; no WebKit pass is claimed.

There are no backend, API, schema, migration, database, cookie-lifetime, password-policy or server-authorization changes. No production accounts or databases were used. Nothing was merged or deployed to production; the existing Cloudflare integration may generate a review preview.

## Exact changed implementation files

- `artifacts/ea-app/src/App.tsx`
- `artifacts/ea-app/src/pages/AccessScreen.tsx`
- `artifacts/ea-app/src/pages/GetApp.css`
- `artifacts/ea-cloud/src/App.tsx`
- `artifacts/ea-cloud/src/components/ClientStartup.tsx`
- `artifacts/ea-cloud/src/components/NavigationTransitions.css`
- `artifacts/ea-cloud/src/components/PortalLoading.tsx`
- `artifacts/ea-cloud/src/components/SessionNotices.tsx`
- `artifacts/ea-cloud/src/components/layout/MobileNavigationMenu.css`
- `artifacts/ea-cloud/src/components/layout/MobileNavigationMenu.tsx`
- `artifacts/ea-cloud/src/components/layout/MobilePublicPanel.tsx`
- `artifacts/ea-cloud/src/components/layout/Navbar.tsx`
- `artifacts/ea-cloud/src/contexts/AuthContext.tsx`
- `artifacts/ea-cloud/src/contexts/ClientAuthContext.tsx`
- `artifacts/ea-cloud/src/hooks/use-public-mobile-panel.ts`
- `artifacts/ea-cloud/src/pages/GetApp.tsx`
- `artifacts/ea-cloud/src/pages/Landing.tsx`
- `artifacts/ea-cloud/src/pages/admin/Login.tsx`
- `artifacts/ea-cloud/src/pages/admin/MobileLoginArtwork.tsx`
- `artifacts/ea-cloud/src/pages/app/Login.tsx`
- `artifacts/ea-cloud/src/pages/superadmin/Login.tsx`

The test changes are `scripts/tests/ios-public-menu.browser.mjs`, `scripts/tests/get-app-redesign.browser.mjs`, `scripts/tests/seamless-navigation.browser.mjs` and the Retry selector in `scripts/tests/browser-session.browser.mjs`. Evidence and this report are under `docs/ios-navigation-get-app/`.
