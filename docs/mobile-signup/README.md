# Mobile sign-up matches mobile sign-in

Mobile `/register` now reuses the existing, unmodified `MobileLoginCloud` and `MobileLoginBackdrop` components from sign-in. The transparent cloud has the same native proportions, responsive width and 30px overlap above the dark panel. Its actual eyes follow the existing 3.6-second power cycle and its six circuit paths carry the same staggered pulses. The original geometric background uses the same viewport-cover transform and eight animated neon traces.

Signup-specific CSS lives in `MobileRegister.css`, scoped to registration and the same mobile breakpoints as sign-in. The old top-left panel logo is hidden only on mobile. A fixed backdrop covers the viewport throughout document scrolling. The registration panel has no maximum height or nested scroll area on mobile; the document scrolls naturally through all six existing fields, submit button, sign-in link and approval notice. The cloud does not intercept touch gestures.

The original transparent asset is reused byte-for-byte; no assets were regenerated, cropped, masked or blended. Desktop signup and both sign-in layouts remain unchanged.

## Screenshots and recording

- [Mobile top](mobile-top.png)
- [Mobile bottom](mobile-bottom.png)
- [Small phone](small-phone.png)
- [Large phone](large-phone.png)
- [Touch landscape](landscape.png)
- [Eyes off](eyes-off.png)
- [Animation and scrolling recording](animation-and-scroll.webm)
- [Seven mobile viewport results](results.json)
- [Unchanged desktop/signup and sign-in comparisons](regression-comparison.json)

## Verification

Full workspace type checking and production build passed.

`scripts/tests/mobile-signup.browser.mjs` passed seven Chromium touch viewport sizes: 390×844, 320×568, 430×932, 412×915, 760×1024, 844×390 and 960×440. These cover iPhone- and Android-sized viewports, small/large phones, a tablet-sized mobile breakpoint, landscape and a reduced keyboard-height viewport. Physical iOS Safari and Android devices were not tested.

The suite verifies:

- The same transparent logo source/size as sign-in, 30px panel overlap, centered alignment, heading clearance, matching panel width/border/background/radius and hidden old logo.
- Matched SVG/image bounds, transparent corner pixels, two eyes reaching bright/off states in 3.6 seconds, six moving circuits and eight moving background traces.
- All six fields accessible by document scrolling, no horizontal overflow, reachable Create Account and Sign In controls, scrolling back to the top and a reachable password field at 390×420.
- Required fields, unchanged registration payload, disabled/loading submission, API error message and existing success/pending-approval/status/back-to-login behavior with intercepted local API responses.
- Repeated Sign In → Sign Up → Sign In navigation preserving the document without additional session requests or any “Verifying session” flashes. Both pages already use Wouter links and the auth provider persists across route changes, so no routing, session or authentication changes were needed. The genuine initial session verification and protected-route checks are retained.
- Reduced motion disables decorative animations.

The existing, unchanged `scripts/tests/mobile-login.browser.mjs` also passed all six mobile regression viewports, including scrolling in a keyboard-sized viewport.

Nine before/after viewport screenshot comparisons are pixel-identical, with unchanged control geometry: desktop signup at 1440×1000, 1920×1080 and 820×1000; sign-in at those same three sizes plus mobile 390×844, 320×568 and touch landscape 844×390. Comparisons freeze motion for deterministic screenshots; normal animation motion is tested separately.

## Changed product files

- `artifacts/ea-cloud/src/pages/Register.tsx`: import reuse components and add mobile-only decorative wrappers. Existing fields, handlers and pending-approval screen are unchanged.
- `artifacts/ea-cloud/src/pages/MobileRegister.css`: registration-only mobile layout and styling.

The shared sign-in components/styles, sign-in page, desktop signup CSS, authentication contexts, routing, session persistence, API/backend/database, email/password handling, dependencies and image assets are unchanged. No production account or database was used during browser checks.

No production deployment or merge was performed. Changes are committed for review; the repository's existing Cloudflare integration may produce an automatic PR preview.
