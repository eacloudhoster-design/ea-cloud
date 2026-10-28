# Installed iPhone sizing: read-only measurement

This branch starts from production commit `a5ca4509634d7d3255abaae33339d377773126a3`.
It deliberately keeps that commit's viewport code and all control dimensions.
It does not incorporate draft PR #103's scaling-removal candidate. Measuring a
different viewport implementation would confound the production diagnosis.

Device confirmed by the operator: iPhone 13 Pro. Production Pages project:
ea-cloud-website, main, successful deployment of a5ca450 / PR #102.

The two references are consistent with an approximately 85% density difference.
That is evidence to measure, not proof of a Safari preference, CSS regression,
stale deployment, or the actual scale reported by WebKit. In particular, #102
multiplies visualViewport.width by visualViewport.scale. A wide viewport and
compensating fractional scale could cancel in that product, so passing Chromium
tests with scale 1 does not establish correctness on the physical device.

Earlier historical rendering comparisons at 460px used the proposed #103
candidate WITH the #102 normalization removed, not unmodified production a5ca450.
They establish historical fixed-control dimensions and candidate parity, not
production viewport parity. No production-sizing resolution is claimed.

## Operator steps after a separately approved manual frontend deployment

Do not deploy automatically. Keep PR #103 unmerged while measuring production
behavior. No Render deployment, database action or credential change is needed.

1. After explicit approval, manually deploy the reviewed diagnostic-only change
   to the existing frontend origin. A preview is useful for smoke testing but
   is not equivalent to the existing PWA: origin-specific browser settings and
   storage can differ. A normal Safari tab is not a substitute either. Do not
   delete the existing PWA or clear its data/preferences as a diagnostic. Keep
   all production API/database settings unchanged.
2. Fully close and reopen the installed EA Cloud app, keeping orientation and
   device settings unchanged. Select Matrix to match the supplied screenshots.
3. Open Settings and tap the existing **Settings title seven times**. The title
   retains its existing appearance. No diagnostic request occurs before opt-in.
4. Tap **Copy report**, then paste the text into this chat. Close the dialog to
   return to the unchanged app. Capture portrait first. A second report after
   rotation can help if needed; do not change zoom settings between reports.

The report allowlists screen/window/visual viewport dimensions and scale, the
actual viewport meta, standalone/guard flags, CSS and bounding dimensions of
the app/controls/dock, and build commit plus fingerprinted entry script names.
No account names, IDs, cookies, tokens, passwords, licence values, artwork URLs,
storage contents, full URLs or query parameters are captured. The clipboard
changes only after Copy report is pressed. There is no report upload or new API
endpoint. The only diagnostic HTTP request reads /build-info.json, with no
credentials and no-store cache behavior; unknown response fields are discarded.
That metadata response also receives an explicit no-store Pages header.

The report will distinguish screen-versus-layout width mismatch, WebKit scale,
unapplied standalone guards, CSS/overflow/transform problems, and stale HTML/JS
versus build metadata. It may then be possible to identify an actual code or
configuration correction rather than applying an inferred size percentage.

## Verification

Client TypeScript and combined production builds run locally. Browser tests
exercise 390px and wider layouts with an emulated 390px screen, preserving the
production viewport implementation. They check: seven-tap opt-in; no diagnostic
network access beforehand; accurate capture of live measurements; account,
storage, cookie and query exclusions; credential-free GET of build metadata;
copy/close behavior; and unchanged Matrix control bounds afterward. These tests
are Chromium emulation. Actual iPhone/WebKit measurements are still required.
