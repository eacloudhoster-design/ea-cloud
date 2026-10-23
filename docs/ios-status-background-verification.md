# iOS Home Screen launch configuration and status-bar background

## Findings and change

The confirmed client URL is `https://ea-cloud-website.pages.dev/ea-app/`. The local source already uses `viewport-fit=cover`, `apple-mobile-web-app-capable=yes` and `black-translucent` (introduced in commit `6b16f24`). Its mentor background covers the full viewport at y=0; foreground content has a separate safe-area offset. It did not have a web app manifest, leaving installation/launch configuration entirely to legacy Apple metadata.

This PR adds a linked, base-aware client manifest with explicit `display: standalone` and relative id/start URL/scope. The confirmed installation path resolves to `/ea-app/`; a separately built root-hosted client still resolves to its own base. Existing Apple icon metadata is retained, and the manifest references the existing favicon. No service worker, offline cache, theme-color or forced status-bar colour is introduced. No React, CSS, foreground geometry, navigation, artwork or trading behavior changes.

The root marketing page is not modified: the user confirmed installation directly from the client path. Its missing Apple metadata was investigated but is not established as the cause for this installation.

This repairs an incomplete installation configuration. It is **not proof** that the reported black strip is fixed on the physical iPhone. The live HTML and build could not be inspected: the environment's outbound proxy rejected `https://ea-cloud-website.pages.dev` with `CONNECT tunnel failed, response 403`. There is no evidence here of the website itself returning 403. The iOS version was requested to investigate possible OS-specific behavior.

## iOS behavior and limitations

Apple documents that `black-translucent` allows page content beneath the status bar:
https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html

WebKit has reports of opaque Home Screen status-bar regions and reduced viewports despite previously working edge-to-edge configuration:
https://bugs.webkit.org/show_bug.cgi?id=301994

That report is a possible explanation, not a diagnosis of this device. If WebKit exposes a viewport that starts below a native opaque status-bar region, CSS cannot reliably paint outside the web view. Moving the foreground, using negative offsets, hiding the native status bar or inventing a universal CSS workaround would not satisfy this task.

## Build and layout verification

The Pages verifier rejects missing/transformed translucent-status metadata, a missing/incorrectly based manifest, non-standalone display and launch URLs escaping the intended client scope. Regression tests cover those failures.

The production-browser test uses fixture account/artwork responses, not production accounts. It loads and verifies the real manifest, then checks all three interfaces at top insets 0/44/47/59px and changing viewport sizes. Loaded background bounds remain x=0/y=0 through full width/height with cover/center rendering. The foreground keeps its safe-area bounds, and every recorded foreground rectangle remains identical with the background layer visible/hidden. No fake native status-bar icons are added.

Commands:

- `pnpm_config_verify_deps_before_run=false pnpm run build:pages`
- `node --test scripts/tests/ios-background.test.mjs scripts/tests/pages.test.mjs`
- `APP_ORIGIN=http://127.0.0.1:5209 node scripts/tests/status-background.browser.mjs`

Local screenshots and geometry: `work/ios-status-background/`. Chromium checks document geometry and manifest delivery, not native iPhone status-bar rendering. Physical installed-PWA verification remains outstanding.

## Deployment and reinstallation

After approval, publish the combined Pages build from this PR, including `/ea-app/index.html`, assets and `/ea-app/manifest.webmanifest`. Verify `build-info.json` and the linked manifest on the deployed site. No backend, database, migration or environment-variable changes are needed.

Only after that deployment, if the installed app retains the old appearance, remove its Home Screen installation and re-add the exact `/ea-app/` URL using Safari → Share → Add to Home Screen. A close/reopen alone may retain old installation settings. Sign-in and device-local appearance preferences may need restoring; server accounts, licences, scans and database records are unaffected. Do not clear website data or reset the database.

On the installed iPhone, verify white native time/Wi-Fi/cellular/battery indicators over the robot artwork and unchanged foreground positions. If the strip remains after a fresh installation, check the iOS version and actual safe-area/innerHeight/visualViewport values with Safari Web Inspector before further layout changes.

No deployment or merge has been performed. Keep this PR in draft until the configuration change and native-device result are reviewed.
