# None-only content positioning

> Historical layout record. The interactive portrait feature now deliberately collapses None instead of reserving portrait space. See [interactive portrait](../interactive-portrait.md). Recorded JSON/pixel baselines below describe the earlier behaviour; current browser assertions check compact flow.

## Cause and change

`RobotImageFrame` correctly returns null for None. That also removes its layout dimensions and margins, placing Regular/S2tone's main name and following controls immediately below the header. Matrix removes its outer frame holder as well; its name stays near the top while its flex spacer keeps the function bar lower down.

Only `artifacts/ea-app/src/pages/HomeTab.tsx` changes at runtime:

- **Regular + None:** reserve the existing frame's 290px height plus its 24px bottom margin with top padding. Name, lower branding and buttons move together by 314px; internal spacing and alignment are unchanged.
- **S2tone_ + None:** reserve the existing frame's 230px height plus the 20px flex gap, in addition to the existing top padding. Name, branding, buttons and Robots List move together by 250px. The two-column arrangement and the explicitly requested small Robots List image are retained.
- **Matrix + None:** translate only the main name to 32px above the existing function bar. The gap leaves the existing small pagination dots unobstructed. Measurements use the existing flow positions, so the function bar, lower branding, header, tagline and other elements retain their original positions. ResizeObserver updates the name placement for viewport/font/content changes and is disconnected when switching to another shape or leaving the layout.

Spacing for Regular/S2tone comes from their actual existing frame dimensions, not a phone-specific viewport offset. Content remains in natural scroll flow. No invisible frame, portrait, placeholder, border or glow is introduced. Orbit and Neural receive no new spacing or positioning.

## Browser verification

`scripts/tests/none-shape-layout.browser.mjs` runs the real production-built `/ea-app/` application in Chromium with isolated local authentication/API fixtures. The existing default robot artwork is used as the fixture background. No live account or trading service is contacted.

Before/after measurements cover all three layouts and all three shapes at 320×568, 390×844 and 430×932 (27 combinations per build). Assertions compare exact positions and sizes for unaffected shapes and verify that headers, navigation, background source and floating robot position remain unchanged. For None, Regular/S2tone's content elements move by equal deltas; Matrix's name moves while its controls and lower branding keep their original measurements. The tests select None, switch to Orbit/Neural, open Symbols/Quotes and exercise normal scrolling where content overflows.

`before.json` and `after.json` record geometry. Screenshots capture each None layout before/after at 390×844, and the pixel comparison report verifies Orbit/Neural Home screenshots remain identical outside the independent animated floating trigger. That trigger’s position and dimensions are verified separately; its existing hover/status animation can differ between captures. Decorative CSS animations are paused at the same time for comparisons, and navigation transitions are finished before capture. The screenshots mentioned in the request were not attached in this session; the supplied written requirements determine the adjustment.

The separate `LAYOUT_DYNAMIC=1` browser run exercises all four currently available fonts and actual viewport resizes with None selected in Matrix (24 additional checks), verifying the 32px gap and horizontal centering. `dynamic.json` records those checks. `python scripts/tests/none-shape-pixels.py` generates the pixel report from the captures.

Production trading-app build and TypeScript checks are also run. The existing bundle-size warning remains. This branch is for review; no production merge or deployment is performed.
