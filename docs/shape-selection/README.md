# Shape options: None, Orbit and Neural

Cornerstone and Fortress have been removed from the menu, ShapeStyle type, valid saved-value registry and frame rendering/geometry logic. Legacy saved values safely fall back to Orbit. New selections still use the existing per-client localStorage key, including None, with no account or navigation changes.

None returns the actual image element, not an empty transparent frame. Its intrinsic aspect ratio is preserved within each interface's image size limit, and it is centered without clipping, decorative border, outline, glow or shape background. If no mentor image is configured, None uses the existing default robot asset. Regular's additional frame glow, S2tone's highlight and Matrix's surrounding rings/pulse and 210px frame holder are absent in None mode. Orbit and Neural keep their existing rendering and immediate shared selection behavior.

## Actual production-build browser verification

The combined Cloudflare Pages build was served locally at `/ea-app/`. Chromium used Settings → Select Main Interface and Select Shape, with isolated API fixtures using the original default robot artwork as mentor image. No production account or trading service was used.

For each of Regular, S2tone_ and Matrix, selected None → Orbit → Neural → None. Assertions verified the main image/frame changed immediately while Settings remained open, before returning Home. All 12 switches kept a loaded image centered on screen. None rendered IMG directly, with zero border/radius, no background, shadow or clipping, no outline SVG, and its rendered aspect ratio matching the source image. Orbit and Neural frames returned correctly. Each None selection survived a full page reload and retained the matching Settings checkmark; the value remained scoped to the existing client key. Cornerstone and Fortress were absent from the clickable menu.

![Regular with None](regular-none.png)

![S2tone_ with None](s2tone-none.png)

![Matrix with None](matrix-none.png)

[Recorded measurements for all 12 switches](browser-results.json)

The updated unit suite covers all nine layout/shape combinations, menu callbacks, removed-option rejection, fallback from old saved selections, per-account isolation and unavailable storage. TypeScript and production builds passed. No new dependencies were added.

Repeat with an existing production preview on port 5177:

```sh
APP_ORIGIN=http://127.0.0.1:5177/ea-app/ CHROMIUM_PATH=/usr/bin/chromium node scripts/tests/shape-selection.browser.mjs
node scripts/tests/robot-shape.test.mjs
```

Set PLAYWRIGHT_MODULE to the installed Playwright index.mjs path if the module is external to the repository. Browser evidence defaults to work/shape-selection/.

No production deployment was performed. These screenshots verify the locally served production artifact, not the live Cloudflare website. The request ended at “The selected shape”; persistence follows the application's existing per-client preference mechanism.
