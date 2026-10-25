# Completed homepage screenshot showcase

The exact three screenshots supplied in the user's `image.zip` are now in the homepage hero. Matrix is centred, largest and in front; S2tone_ sits behind on the left, and Regular behind on the right. The large hero logo and its original-identity caption are no longer mounted. The navigation's small logo is unchanged.

The hero introduction stays on the left on desktop, with the layered phone composition on the right. Mobile/tablet layout shows the existing introduction and CTA buttons first, then the grouped screenshots. All three screens remain visible together without horizontal overflow. There is no duplicate screenshot arrangement in the lower Get App section.

`HeroAppShowcase.tsx` and its scoped CSS own the composition. Static perspective/inward angles, thin red frame highlights, ambient light and shadows sit outside the images. Entrance wrappers and floating wrappers are separate: Matrix fades/scales forward first, then S2tone_ and Regular slide in, followed by a slow 4px floating movement. The entrance waits until the real image assets decode, including a cold cache, while the text, links and normal scrolling remain available. Reduced motion removes all entrance/floating animation.

## Assets verified before implementation

All three ZIP members were opened and visually identified before source changes. Each is 739×1600 RGB PNG. Original bytes are stored unchanged in `artifacts/ea-cloud/public/showcase/`:

| Image | Position | Original SHA-256 |
| --- | --- | --- |
| `matrix.png` | Centre / largest / foreground | `ddebb9220917c02bc5ea30565f1351d059fcb2e07734e8958ff585a3cba5fca2` |
| `s2tone.png` | Left / smaller / behind | `e6787bdb9c6c2460edad2c48ab0643b03e505411c341e496ffa26ca2628864b4` |
| `regular.png` | Right / smaller / behind | `c00f4ba813ea0945fad1bded1135a0ee1d450692786ee0c43d720e1a739f851b` |

Responsive WebP sources at widths 360, 540 and 739 preserve the complete image and proportions. Only proportional resizing is applied to smaller variants; WebP encoding is lossless. Full-resolution WebP decoded pixels were compared to the PNGs and are identical for all three. No artwork, colours, names, controls or backgrounds were retouched. PNGs remain the browser fallback. The smallest three variants total approximately 844KB, versus 4.1MB for the three original PNGs. `public/showcase/manifest.json` records dimensions, sizes and source hashes.

## Preserved

Orbitron heading, its red dot and line-box sizing; hero subtitle/introduction/CTAs; navigation/account menu; existing Get App installation guides; Features content; authentication/session code; and all trading-app/MT5/scanner/backend code. No new dependency was introduced. PR #74 had already been merged, so this completion is a follow-up change based on its merge commit.

The earlier phase's real iOS/Android web-app installation guides remain unchanged. They link to `/ea-app/` and explain browser installation rather than claiming native store downloads. Orbitron remains limited to the large hero heading, with its SIL Open Font License included in production output.

## Browser verification

- Public TypeScript and production build passed. Existing Vite UI source-map reporting and large-bundle warnings remain.
- The combined build layout passed `verifyPagesBuild` for `/` and `/ea-app/`.
- `hero-showcase.browser.mjs` passed at 1440×1000, 1280×720, 390×844 and 320×568: original-byte hashes over HTTP, every responsive asset URL, actual changing opacity/transform frames after image decode, centre-first/left/right entrance timing, slow floating movement, cold-response gating, full image proportions and full-hero screenshots.
- `public-website.browser.mjs` passed at 1440×1000, 768×1024, 390×844 and 320×568: correct order/overlap/foreground/relative sizes, three loaded images, no hero logo/duplicate showcase, mobile introduction-first order, no horizontal overflow, no image recolouring filters, preserved Orbitron, reduced motion, navigation/account/Help interactions, original auth form handlers with fixtures, app entry and session preservation.
- `public-installation.browser.mjs` passed at desktop and 390px/320px touch viewports: both guides, real app popup, copy fallback, focus restoration and overlay removal.

Chromium used native touch-input emulation for mobile tests. Physical Safari/iOS/Android devices and OS installation were unavailable. Auth APIs were isolated with fixtures; no real accounts or trades were created. The tests do not claim measured 60 FPS.

```sh
PUBLIC_ORIGIN=http://127.0.0.1:5214 node scripts/tests/hero-showcase.browser.mjs
PUBLIC_ORIGIN=http://127.0.0.1:5214 node scripts/tests/public-website.browser.mjs
PUBLIC_ORIGIN=http://127.0.0.1:5214 node scripts/tests/public-installation.browser.mjs
```

Set `PLAYWRIGHT_MODULE` if Playwright is installed outside the repository. Chromium is expected at `/usr/bin/chromium`.

## Review screenshots

- [Desktop homepage](screenshots/desktop-homepage.png)
- [Short desktop homepage](screenshots/short-desktop-homepage.png)
- [Mobile homepage](screenshots/mobile-homepage.png)
- [Small mobile homepage](screenshots/small-mobile-homepage.png)
- Existing guides: [iOS](screenshots/ios-install-guide.png) / [Android](screenshots/android-install-guide.png)

Measurements and animation samples: [results.json](results.json).

No production deployment or main-branch merge was performed for this completion.
