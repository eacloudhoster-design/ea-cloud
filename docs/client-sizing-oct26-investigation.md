# Client sizing: October 26 versus October 28

Status: the production undersizing is **not verified as resolved**. No production
deployment, credential change, account change or database operation was performed.

## Historical evidence

The end-of-day October 26 snapshot in Africa/Johannesburg is `3b33000`, timestamp
2026-10-26 23:49:27 +02:00. Current main inspected was `a5ca450`, which includes
PRs #99, #101 and #102. The comparison is not a whole-application rollback.

These files are identical between that snapshot and main: BottomNav.css,
HomeInteractions.css, S2toneActions.css, InteractiveBotPortrait.tsx, SettingsTab.tsx,
AppContext.tsx and pnpm-lock.yaml. HomeTab.tsx differs only in Matrix's conditional
branding placement, not control dimensions. The authentication repair does not
change the home-control dimensions. Changes to login/session code were inspected
but are not reverted or modified.

The larger reference has an approximately 87%-wide Matrix control panel; the
smaller reference has an approximately 74%-wide panel. This matches the existing
340px panel in a 390px versus 460px layout viewport. It does not establish the
actual device model, layout viewport, browser scale or deployed commit.

## Independent rendering comparison

The October 26 app was checked out in an isolated temporary worktree and built
using the unchanged dependency lockfile/dependencies. The proposed candidate (main a5ca450 with PR #102's viewport normalization removed) was built
separately. This was NOT unmodified production main at 460px. Both were served locally with identical isolated API fixtures,
installed-iPhone user-agent/standalone emulation, preferences and viewport sizes.
No test contacted the production API or database.

`scripts/tests/client-sizing-history.browser.mjs` compares candidate versus historical rendered home and dock
button widths, heights and font sizes, plus Matrix panel width, across Regular,
Matrix, S2tone and Lumo. The historical build and that candidate match exactly at 390px and 460px widths; this does not prove production-main viewport parity.

| Layout viewport | October 26 panel | Candidate panel | Fraction of viewport |
| --- | --- | --- | --- |
| 390px | 340px | 340px | 87.18% |
| 460px | 340px | 340px | 73.91% |

There is no measured source-level reduction in those controls to reverse. The
primary production cause remains unverified; changing their sizes would not be
an evidence-based restoration of the October 26 dimensions.

## Narrow correction in this PR

Remove PR #102's inferred 390px design canvas and dynamic viewport-scale formula.
It was a calibration hypothesis, not a demonstrated production root-cause fix.
Keep the existing installed-iOS pinch guard, native device-width viewport,
16px login inputs, fullscreen layout and Matrix's corrected pill-only movement.
No artwork, design, customization, startup animation, authentication, MT5 or
scanner implementation changes are included.

Tests now explicitly reject inferred scaling and fixed-width normalization,
including wide-iPhone, keyboard and orientation cases. The historical comparison
is an additional guard against changing dimensions based solely on screenshots.

To repeat the comparison, serve the built October 26 app at a loopback origin
with base /ea-app/ and current combined Pages output at another loopback origin:

```sh
OCT26_ORIGIN=http://127.0.0.1:5223 PUBLIC_ORIGIN=http://127.0.0.1:5222 \
  node scripts/tests/client-sizing-history.browser.mjs
```

Set PLAYWRIGHT_MODULE to an existing Playwright installation if it is not on the
module search path. Chromium must be available at /usr/bin/chromium. These are
browser emulations, not a physical iPhone/WebKit verification.

## Deployment/caching evidence and remaining checks

- `push-sw.js` is push-only, with no fetch handler or application asset cache.
- The tracked Pages headers request revalidation for /ea-app/, its index.html
  and manifest. Vite emits fingerprinted JS/CSS assets.
- The combined build writes /build-info.json containing the source commit and
  verifies the website and /ea-app/ entry points. A successful website-only
  deployment or an old retry is not evidence of the current client bundle.
- Live /build-info.json could not be read through the available web tool. Actual
  deployed SHA, response headers, build settings and iPhone cached state are
  unverified. No claim is made that caching caused the issue.

Before another sizing implementation, obtain the current production deployment
SHA and iPhone model, then read the installed app's innerWidth, visualViewport
width/scale, viewport meta content and actual Matrix control bounding rectangle
through an authorized device inspection. Compare the deployed build-info commit
and the loaded index's asset hashes with the intended deployment. No credentials,
cookies, tokens or account data are needed for these measurements.

No merge or deployment is authorized by this investigation. A real restoration
must be verified on the installed iPhone against Image 2; this PR does not claim
to have completed that restoration.
