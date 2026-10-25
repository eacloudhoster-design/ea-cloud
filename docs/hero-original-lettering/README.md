# Homepage heading: original red-and-silver lettering

Only the main homepage heading changes. It now displays the original logo's metallic red EA and silver/chrome CLOUD lettering instead of live Orbitron text. The full stop is removed. The header keeps its separate cloud-only asset; the footer and other branding retain the original JPEG.

The new `public/ea-cloud-wordmark.png` extracts `(left:55, top:842, width:1150, height:168)` from `public/ea-cloud-logo.jpeg`. ImageMagick crops the existing artwork and makes near-black background pixels transparent (2% fuzz) for a clean blend into the existing hero. No generated artwork, substitute font, resizing, sharpening or recolouring was used. The extracted PNG's RGB channels exactly match the source crop; only background alpha is removed. The original red highlights, chrome shading and angular lettering are retained.

`Landing.tsx` keeps the same accessible H1 and entrance class, with `alt="EA CLOUD"` on its image. `Landing.css` preserves the old heading line-box heights at every breakpoint and uses `object-fit:contain` without stretching or clipping. The prior hero-only font-face declaration is no longer needed; no global typography changes.

| View | Previous heading | Original lettering |
| --- | --- | --- |
| Desktop | [Before](desktop-before.png) | [After](desktop-after.png) |
| Mobile | [Before](mobile-before.png) | [After](mobile-after.png) |

Also verified: [320px mobile](mobile-320.png) · [820px tablet](tablet.png).

## Verification

- Frontend TypeScript and production build pass; existing Vite source-map/chunk-size notices remain.
- Chromium checks at 1440, 820, 390 and 320px: original wordmark loads, no full stop, no clipping or horizontal overflow, H1 remains accessible, header remains cloud-only, footer asset remains unchanged.
- Header, heading box, hero copy, introduction, CTA row and carousel geometry exactly match before measurements at all four widths.
- Screenshots masked only over the heading are pixel-identical before/after at all four widths. Source RGB crop comparison also passes. See [pixel results](pixel-results.json) and [browser results](browser-results.json).
- The existing heading entrance animation remains active when reduced motion is off. Reduced-motion layout captures were used for reliable pixel comparisons.
- Existing Get App/iOS/Android installation flows pass on desktop, 390px and 320px, including modal close, link destinations and copy fallback.
- Existing installation-guide tests were updated to check the original image lettering rather than the deliberately replaced Orbitron/full-stop design. The public-website regression's heading asset assertion was updated as well.

Run `scripts/tests/hero-wordmark.browser.mjs` with `WORDMARK_TEST_MODE=before` against the previous build to capture baselines, then without that variable against the updated build. Set `PUBLIC_ORIGIN` to the localhost preview and `PLAYWRIGHT_MODULE` if needed. Browser evidence uses Chromium touch emulation; physical iPhone/Safari testing was unavailable.

Source changes: `src/pages/Landing.tsx`, `src/pages/Landing.css`, `src/lib/branding.ts` and the extracted public wordmark asset, all under `artifacts/ea-cloud`. No navigation component, trading-app source, backend, dependency or deployment configuration changed. No deployment performed.
