# Sign-in artwork animation — transparent cloud asset still required

> Mobile-only follow-up: the newer request authorizes preparing a transparent variant of the approved cloud. That variant is now used for the floating phone login, while desktop stays unchanged. See [mobile login status and evidence](../mobile-login/README.md). The earlier missing-original-asset notes below describe that prior task.

## Status: logo integration is blocked

The original transparent cloud-only EA Cloud logo is missing. The available `public/ea-cloud-nav-logo.png` is a 1254×692 RGB image with a baked-in black rectangular matte. `ea-cloud-logo.jpeg` is also opaque. The transparent wordmark is lettering, not the cloud icon, so it is not a replacement. Current assets, uploaded archives and available Git history were checked; no transparent cloud original was found.

Following the request, this change removes the previous polygon crop and does not use CSS masks, blending or raster background removal to pretend the asset is transparent. The existing icon is displayed at its original aspect ratio without cropping. Its matte remains visible in the evidence. **The “no rectangular edges / naturally integrated logo” acceptance criteria cannot pass until the owner supplies the original transparent PNG or SVG.** The draft is not a completed logo fix.

When that original is supplied, replace only the `logo` source passed to `MentorLoginArtwork` on the sign-in page and confirm eye coordinates against its native artwork. Do not substitute a different logo or modify branding on unrelated pages.

## Implemented work

- Eight SVG traces follow selected existing red strips in the approved 1445×1088 geometric image. Paths share the image's centered cover transform through `preserveAspectRatio="xMidYMid slice"`; no random crossing lines are added. Staggered 8.5–14 second dash movement, soft reflections and restrained ambient lighting replace the broad diagonal sweep.
- Eye effects use SVG shapes in the original logo's 1254×692 coordinate space, with blurred red spill around the pupil shapes. Left and right intensities vary independently over 6.4 and 7.1 seconds, including a slow occasional brighter phase. The logo itself does not pulse red.
- A 1.4-second logo fade, eye illumination and 1.8-second expanding ambient glow introduce the scene. Neon motion starts during that sequence. The form is immediately interactive after the existing authentication check; no animation timer delays it.
- Explicit image dimensions and aspect ratio reserve the original logo's space. The existing central placement and logo size are retained. Decorative overlays do not accept pointer input. All decorative movement is disabled by `prefers-reduced-motion`.
- No new animation library, animation JavaScript loop, replacement image, watermark manipulation, auth/backend/database/trading changes, or form layout changes.

## Evidence

- [Eight-second desktop animation recording](desktop-animation.webm)
- [Desktop at two seconds](desktop-2s.png) · [Desktop at four seconds](desktop-4s.png)
- [Desktop reduced motion](desktop-reduced.png) · [Mobile reduced motion](mobile-reduced.png)
- [Alignment/movement/layout-shift checks](results.json) · [Frame sample without recording](frame-sample-no-video.json)

The video intentionally shows the remaining baked-in matte rather than concealing the missing asset.

## Validation

- Full workspace typecheck and production build passed.
- Animation browser checks passed at 1440×1000, 390×844, 320×568 and 844×390: aligned eye/image bounds, independent eye intensity changes, travelling stroke offsets, original uncropped asset, stable form rectangles, no horizontal overflow, no decoration-related layout shifts, and static reduced-motion mode.
- Pixel comparison against the previous committed screenshots found the right desktop form panel and the mobile form region identical (zero differing pixels). The comparison excludes the intentionally changed artwork.
- Detailed form suite passed at six sizes: required rules, password reveal/hide, unchanged login payload, loading/error/pending/approved states, registration/support/close links, short mobile scrolling and reduced motion.
- Existing session browser suite passed real password login, refresh, full browser restart, app/portal navigation, Back, outage recovery, logout and mobile-touch logout in the disposable database fixture.
- Without video recording, a headless Chromium sample had 16.7ms median and 16.8ms p95 frame intervals with motion enabled and reduced motion. Recording adds capture/encoding overhead; that run's separate frame sample is in `results.json`. These are short environment observations, not physical iPhone/Android or battery benchmarks.

Run `auth-neon.browser.mjs` with a loopback `PUBLIC_ORIGIN` and Playwright available (or `PLAYWRIGHT_MODULE`). Playwright's ffmpeg must be available for the recording. This workspace used system ffmpeg through a workspace-local Playwright browser cache. The test writes to `work/auth-neon`, not this evidence directory. Other form/session tests retain their existing invocation.

No production deployment or merge performed. A pushed draft branch may receive an automatic preview through the repository's existing Cloudflare integration.
