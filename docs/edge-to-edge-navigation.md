# Reference-matched integrated glass dock

This supersedes the floating rectangular dock in PR #52. Only BottomNav.css changes at runtime: the shared navigation surface spans the application's full width and extends to its bottom edge, with 22px top corners, a dark translucent blurred background and a cyan top-edge glow. The inner controls retain the existing 66px height and sit above `env(safe-area-inset-bottom)`. There is no extra bottom floor or standalone-specific offset. The highlight is now an elongated oval with cyan outline/glow; the spring/drag hook, routes and screen transitions are unchanged.

The supplied reference is 710x1536 pixels. The browser preview uses a 355x768 CSS viewport at DPR 2, producing that exact screenshot size, with an 18px simulated bottom inset. Its dock begins at approximately image y=1368 (reference y≈1367). Reference artwork is not copied into the app: previews use existing repository fixture artwork, and real users continue seeing their mentor background.

The app's existing 430px desktop content cap is preserved; edge-to-edge means the full application viewport. Landscape safe-area side insets constrain only the controls, while the glass surface remains full width.

## Verification

- TypeScript and production Pages build passed (existing chunk-size warning).
- `APP_ORIGIN=http://127.0.0.1:5205 node scripts/tests/edge-to-edge-navigation.browser.mjs` checks six mobile viewport configurations across Regular, Matrix and S2tone: all three navigation routes, identical dock geometry, zero outer margins/gaps, safe-area clearance, oval indicator containment, background blur and no horizontal overflow. Additional checks cover MT5 account input retention, drag navigation and reduced motion.
- Screenshot/measurement output: `work/edge-to-edge-navigation/`. Screenshots named `355-*.png` are 710x1536 reference-sized previews.
- Node suite: 109/110 passed. The existing unrelated activity-monitor assertion expecting `Awaiting status` still fails, unchanged from the baseline.

Chromium safe-area simulation is not native iOS standalone testing. Browser and installed PWA use the same unconditional safe-area geometry, but physical iPhone Home Screen/Safari rendering must still be checked before deployment approval. No operating-system home indicator is drawn by the app or added to screenshots.

Frontend-only deployment after approval. No database changes, migrations, backend changes or environment variables. Do not merge or deploy without approval.
