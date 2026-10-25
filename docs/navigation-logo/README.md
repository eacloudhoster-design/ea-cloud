# Navigation logo: cloud icon only

The public header now uses `ea-cloud-nav-logo.png`, a lossless crop of the existing `ea-cloud-logo.jpeg`. Crop bounds are `(left: 0, top: 145, width: 1254, height: 692)`; no resampling, recolouring or generated artwork was used. Decoded RGB pixels exactly match that region of the source, including both red eyes. All lettering is outside the crop. The original JPEG is unchanged and remains in use by the footer and other branding.

Only `Navbar.tsx` switches to the new `navigationLogo` export in `branding.ts`. Header CSS, desktop placement, mobile centring, element dimensions and homepage link are unchanged. No trading-app files changed.

Verified locally in Chromium at desktop 1440px, tablet 820px and touch/mobile 390px. Before/after measurements of header, logo, controls, hero copy and showcase are identical. Screenshots are pixel-identical outside the masked logo box at all three sizes. Logo image loading, unchanged footer asset and click-to-home navigation from `/legal` all pass. Source pixels were compared with Pillow; the crop itself was performed with ImageMagick. Frontend TypeScript and production build pass (existing Vite source-map/chunk-size notices remain).

Screenshots: [Desktop](desktop.png) · [Mobile](mobile.png) · [Tablet](tablet.png)

Results: [Browser](browser-results.json) · [Pixel comparison](pixel-results.json)

Reproduce the scoped browser comparison with `scripts/tests/navigation-logo.browser.mjs`: run with `LOGO_TEST_MODE=before` against the previous build, rebuild the updated site, then run with its default `after` mode. Set `PUBLIC_ORIGIN` to the localhost preview and `PLAYWRIGHT_MODULE` to the installed module path if required. The existing public-website test's expected header asset URL was updated as well.

No merge or deployment performed. Physical iPhone/Safari testing was not available; touch testing used Chromium emulation.
