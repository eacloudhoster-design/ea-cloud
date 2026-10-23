# Compact navigation spacing

Inspection found no duplicate safe-area application or extra spacer in the navigation's parents. The shared dock explicitly stacked a 66px row on the complete bottom inset, while the row itself used 5px top/bottom padding. This produced a 100px panel with controls raised above a 34px blank lower area on common iPhones.

The dock now uses a 60px row, 2px top/bottom row padding and `min(20px, env(safe-area-inset-bottom))` bottom clearance. At a 34px inset the actual panel height changes from 100px to 80px, and button centers move down 17px. A zero-inset panel changes from 66px to 60px; smaller insets remain respected up to the compact 20px home-indicator allowance. Glass still reaches the viewport bottom with zero outer margins. No negative margins or positional transforms are added.

Button targets remain 54px high, the oval highlight remains 54px high, and icon sizes/typography are unchanged. Reducing row padding—not button sizes—recovers six pixels. The existing lens measurement reads actual top padding so the same background refraction stays aligned. Spring/swipe behavior is unchanged. No screen layouts, images, backend or database changes.

## Verification

- TypeScript and production Pages build passed (existing bundle-size warning).
- `APP_ORIGIN=http://127.0.0.1:5207 node scripts/tests/edge-to-edge-navigation.browser.mjs`: 18 mobile viewport/interface combinations, with assertions for actual compact container height, unchanged 54px buttons/54px indicator, zero bottom/side gaps, safe-area clearance, all three routes, retained MT5 form input, drag navigation and reduced motion.
- A direct baseline-CSS comparison at 393x852 with a 34px bottom inset measured 100px → 80px panel height and button center y=785 → 802, with identical 54px button/highlight heights and identical glass background. Raw measurements: `work/compact-navigation/comparison.json`; screenshots: `before-iphone-393.png` and `after-iphone-393.png`.
- Production-build screenshots/measurements: `work/compact-navigation/`. The 355px CSS viewport at DPR 2 produces 710x1536 previews for comparison with the previous dock screenshots in `work/edge-to-edge-navigation/`.
- Node suite: 109/110 passed; the unchanged activity-monitor test still expects the old `Awaiting status` wording.

Physical iPhone Safari and installed PWA testing remains outstanding. Chromium simulates safe-area values but cannot verify native home-indicator hit testing/rendering. Browser and standalone use the same geometry without display-mode-specific overrides.

Frontend-only change. No database migration, backend deployment or environment configuration. Do not merge or deploy until approved.
