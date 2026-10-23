# iOS status-bar background: existing implementation and verification

## Finding

Current main already implements the requested edge-to-edge background. Commit `6b16f24` added `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style=black-translucent`. The loaded mentor background is a direct child of `.ea-app-viewport`, absolutely covering that complete 100dvh container with `object-fit: cover; object-position: center`. Foreground content is separately offset by `env(safe-area-inset-top)` and keeps its safe-area-reduced height. No black top strip was reproduced with this build.

No runtime source/layout changes are included in this PR. Changing main content padding or its offsets would risk moving the interface without fixing a demonstrated source problem. The reported installed-iPhone symptom remains unconfirmed; an old deployment, a different installed start URL or retained iOS launch settings are possibilities, not established causes. No new screenshot was attached to this request.

## Safeguards and evidence

The production Pages verifier now rejects a client bundle without `viewport-fit=cover`, standalone capability or `black-translucent`. Regression tests remove each setting and confirm the build is rejected; the normal complete build passes.

The browser test uses existing fixture artwork/account responses and the production build, never production accounts. All three interfaces are tested at top safe-area values 0/44/47/59px, including viewport resizing. It checks loaded image bounds exactly at x=0/y=0 through full viewport width/height, cover/center rendering, retained safe-area foreground positioning and identical foreground rectangles with the background layer visible/hidden. It does not add fake native status-bar icons to the app or screenshots.

Commands:

- `pnpm_config_verify_deps_before_run=false pnpm run build:pages`: passed (existing bundle-size warning).
- `node --test scripts/tests/ios-background.test.mjs scripts/tests/pages.test.mjs`: 11 passed.
- `APP_ORIGIN=http://127.0.0.1:5208 node scripts/tests/status-background.browser.mjs`: 12 passed.

Screenshots/rectangle measurements: `work/ios-status-background/`. Native status-bar text/colour cannot be observed inside Chromium or the web page. Physical iPhone Home Screen PWA testing has not been performed, so this is verification of the existing implementation and build protection, not confirmation that the production iPhone symptom has been fixed.

## Deployment / iPhone follow-up

1. Confirm the deployed client URL is the intended `/ea-app/` app and serves the current build, not a different app or an older website bundle. The combined Pages build publishes the client at `/ea-app/`; `build-info.json` identifies its build commit.
2. First fully close and reopen the installed app after refreshing the deployed client. No new runtime change from this PR is needed to obtain the existing background behavior; these settings are already on main.
3. If the installation predates the status-bar metadata change, iOS can retain old launch/status-bar configuration. Remove the Home Screen shortcut/app and add the correct client URL again from Safari using Share → Add to Home Screen. Sign-in may be needed again and device-local appearance preferences may need restoring. This does not delete server accounts, licences, scans or database records. Do not clear website data or reset the database as a troubleshooting shortcut.
4. On the actual installed iPhone app, verify white time/Wi-Fi/cellular/battery indicators over the robot artwork, no black strip, and unchanged foreground positions. `black-translucent` requests white native indicators where iOS supports it; a web page cannot draw or directly control those system indicators.
5. If the strip remains, capture the exact installed URL, iOS version and screenshot and compare the deployed build before changing layout.

No deployment has been performed. No backend, database, migration or environment changes are needed. This PR affects build validation/tests only and should remain unmerged until approval.
