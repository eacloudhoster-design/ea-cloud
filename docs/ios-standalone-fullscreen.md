# iOS standalone bottom viewport correction

## Cause and scope

The existing viewport metadata already specifies `viewport-fit=cover`, Apple web-app capability and `black-translucent`; the manifest already specifies `standalone`. The remaining app-side failure is the percentage-height document and fixed application/dock inheriting a shortened containing viewport. Moving a dock to `bottom: 0` cannot reach beyond that containing viewport. The supplied screenshot shows the background ending with the dock, consistent with this problem rather than extra internal dock padding. Actual device geometry has not been collected, so this is not a definitive diagnosis of the customer's WebKit instance.

[WebKit 254868](https://bugs.webkit.org/show_bug.cgi?id=254868) documents installed-app viewport sizing discrepancies and a standalone `100vh` workaround. [WebKit 301994](https://bugs.webkit.org/show_bug.cgi?id=301994) and [313800](https://www2.webkit.org/show_bug.cgi?id=313800) also describe newer native viewport/status-bar issues. A native region outside the web view cannot be painted by application CSS; physical-device verification remains necessary.

## Implementation

Only authenticated, branding-ready iOS Home Screen sessions select a document-flow `100vh` canvas. Detection supports both `navigator.standalone` and the standalone display-mode media query, including desktop-UA iPads. The visible Home wrapper uses this canvas, and the existing shared dock anchors absolutely to its non-scrolling application root instead of the potentially shortened fixed viewport. Ordinary Safari tabs and Android retain their existing layout.

The real background fills that root. Existing foreground top insets and dock bottom safe-area padding remain applied once; no spacer, new background colour, negative offset or device-size constant is introduced. Internal screens retain their own scrolling. The hook reapplies on page restoration and clears its attribute on authentication teardown. Startup animation and white-flash handling are unchanged.

Production files changed:

- `artifacts/ea-app/src/App.tsx`: activate the scoped hook.
- `artifacts/ea-app/src/hooks/use-ios-standalone-layout.ts`: platform/lifecycle detection.
- `artifacts/ea-app/src/components/HomeInteractions.css`: full document canvas and dock anchoring.
- `artifacts/ea-app/src/index.css`: matching document/root height and overflow containment.

Tests added: `scripts/tests/ios-standalone-layout.test.mjs` and `scripts/tests/ios-standalone-layout.browser.mjs`. This document is the seventh changed file. No navigation styling, images, business logic, backend, database, dependencies or installation metadata changed.

## Verification and limits

- EA app TypeScript check and `pnpm run build:pages` pass, including production Pages verification.
- Platform detector unit test passes.
- New production-build browser suite passes five cases: notched iPhone, island iPhone, landscape, Safari-tab and Android PWA. It exercises Regular, Matrix, S2tone, MT5, scanner navigation, scrolling, reopening, orientation changes and authentication teardown.
- Existing fullscreen browser suite passes three device cases; voice browser suite passes; startup guest and standalone checks pass when run sequentially. An initial parallel startup capture missed its multi-frame overlap assertion under browser contention; the sequential rerun passed without changes to startup code.
- Full unit suite: 131 tests, 128 pass, one existing activity-monitor wording assertion fails (`Awaiting status`), two optional database tests skipped. Unrelated activity-monitor code was not changed.

The browser regression deliberately creates a shortened fixed containing block, retaining a full document canvas. With the new attribute removed, it reproduces 47px and 59px gaps; restoring the real hook makes application, image and dock bounds reach the full canvas. The test disables the page-level background only in this fixture so an exposed gap is visible. This models layout geometry in Chromium, not native WebKit behaviour. Screenshots are of the real production-built app with fixture branding, not the customer's account.

Local matched captures: `work/ios-standalone-stripe/iphone-notch-before.png` and `iphone-notch-after.png`; additional cases and measurements are in that directory. These review artifacts are not committed.

No native Safari/WebKit executable or physical iPhone is available here. Therefore actual installed-iOS removal of the stripe, white system indicator rendering and exact reference matching are **not verified**. The deployed website could not be inspected from this environment because the network proxy rejects its CONNECT request with HTTP 403.

## Deployment and device acceptance

Deploy only the frontend Pages production build after approval; no API deployment, migration, data changes or environment variables are required. Do not merge or deploy automatically. Installation metadata is unchanged, so this patch does not require deleting/reinstalling the Home Screen app. After an approved deployment, reopen the updated installation and verify that the new build has loaded; restarting alone is not proof that cached assets updated.

On a physical iPhone, check both Safari and the installed app: portrait/landscape, Regular/Matrix/S2tone, MetaTrader, scanner, switching tabs, internal scrolling and reopening. Confirm the actual robot image and glass dock reach the bottom, controls remain above the Home indicator, and no outer scrolling or flashing occurs. If the installed web view itself excludes a native strip, collect screen/inner/visual viewport dimensions and safe-area values before claiming a CSS fix can resolve that OS issue. Do not reset user settings or application data for this test.
