# Standalone background canvas

## Changes

The app previously painted the robot only as an absolutely positioned child of its app container. The document canvas remained black (`html/body` base background and an inline body background shorthand). Although that child already covered the document viewport, the page canvas was a separate black rendering surface.

The same existing mentor image now fills an independent fixed viewport layer, with the previous cover/center crop and 430px app width cap preserved. In mobile standalone mode the hook also paints that actual image on the HTML canvas and makes the body transparent. The inline body fallback uses a background-color variable rather than a shorthand that resets background-image. It is still black on startup/auth screens and normal browser pages. No solid replacement status-bar colour is introduced.

The canvas effect is enabled only for the branded authenticated app with background visibility enabled, supports both iOS navigator.standalone and display-mode:standalone, and restores document styles on disable/cleanup. It follows mentor image changes. Wider screens keep their existing canvas/gutters. The foreground content container, its safe-area offsets, size calculations and all Home/MT5/Settings controls are unchanged.

Existing viewport-fit=cover, Apple standalone capability, black-translucent and the standalone manifest are preserved. No service worker is registered or shipped. Cloudflare Pages headers now explicitly revalidate the client HTML and manifest; hashed assets and API caching are unchanged. This does not forcibly clear device storage or existing Home Screen launch metadata.

## Scope of the fix

This addresses the app's separate black canvas and container-dependent image layer. It is not proof that iOS 26.5's native status-bar strip is fixed. If WebKit places a system-owned strip above the web view, neither this image layer nor CSS can paint outside that web view. Relevant report: https://bugs.webkit.org/show_bug.cgi?id=301994#c12 (reported on 26.5.2). No foreground offsets, fake status-bar icons or hidden native indicators are used.

The confirmed installed URL is https://ea-cloud-website.pages.dev/ea-app/. Live inspection was previously blocked by the environment proxy (403), so deployed HTML/cache behavior has not been independently confirmed.

## Verification

- Production Pages build and app TypeScript check: passed.
- `node --test scripts/tests/ios-background.test.mjs scripts/tests/pages.test.mjs` validates the build configuration and output: 15 passed.
- `PWA_BASELINE=work/pwa-canvas-baseline/results.json APP_ORIGIN=http://127.0.0.1:5210 node scripts/tests/status-background.browser.mjs` compares foreground rectangles with the a controlled pre-change source baseline (main commit d7a057d, served read-only). A fixed persisted avatar test position avoids existing resize-clamping event races; production avatar code is untouched. It checks three interfaces, four viewport/top-inset configurations, normal browser mode, simulated legacy iOS standalone and simulated modern standalone. It also verifies actual mentor canvas image/transparent body, unchanged background fit/bounds, and cleanup/restoration through the existing background toggle. The controlled baseline and changed-build runs passed: 12 baseline cases and 36 comparison cases. Without PWA_BASELINE it compares standalone geometry to its browser run, making the test usable on a fresh checkout.

Local evidence is saved under `work/pwa-canvas/`. Standalone signals and safe areas are simulated in Chromium, not a physical installed iPhone. Native white time/Wi-Fi/cellular/battery visibility and the actual status-bar area still need physical iPhone verification.

## Deployment and installation

After approval, deploy the complete frontend Pages build, including the linked manifest and root `_headers` file. No backend deployment, database migration or account changes are required. Do not merge or deploy without approval.

Once deployed, fully close/reopen the installed app. If it retains its old installation settings, remove the Home Screen installation and add the exact `/ea-app/` URL again from Safari. Reinstallation can refresh retained metadata but is not a guaranteed workaround for an OS-owned strip. Sign-in and device-local preferences may need restoring; server accounts/licences/records remain intact. Do not clear website data or reset the database.
