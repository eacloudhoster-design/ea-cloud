# Startup polish

This refinement preserves the existing logo asset, crop, size, position,
black background, exact cloud path, clockwise direction, two-second entrance
and seven-second trace. No Home, authentication, navigation, theme, trading or
voice components were modified.

The red halo is slightly stronger using the existing small static SVG shadows.
The leading core is slightly brighter, without increasing stroke widths. Two
aligned SVG eye overlays use opacity-only 2.4s and 3.1s breathing animations;
the right eye has a -1.05s offset. Opacity stays between .05 and .24, above the
unchanged embedded red eyes. Reduced-motion mode keeps a quiet static overlay.

The final outline glows for 100ms, then both startup and Home crossfade with
the same 300ms duration/easing. Removal follows the overlay's opacity
transitionend, with a cancelled-transition fallback. All timers are cleaned
up, and removing the SVG stops its CSS animations. The ready-on-time total is
approximately 9.4 seconds: the entrance/trace timing is unchanged, while the
previous 1s hold and 2s fade are removed.

## Identified glitch and regression

The previous border used an infinite accumulating dash animation. Immediately
after each seven-second circuit, its dash offset jumped from almost zero to
almost one before React could complete the state transition. With late app
readiness the entire illuminated border was erased for another circuit.

The isolated old/new CSS regression measured offsets:

| Trace time | Before | After |
| --- | --- | --- |
| 6999ms | 0.000143 | 0.000143 |
| 7001ms | 0.999857 | 0 |
| 7500ms | 0.928571 | 0 |

The accumulating border now runs once with forwards fill. Only the existing
moving highlight continues while initialization is pending. Readiness can
finish the sequence immediately after the first complete trace, rather than
waiting for another seven-second circuit. This fixes a reproduced reset;
without the two referenced recordings we cannot establish that it is the exact
moment seen by the user.

The client document now declares a black initial HTML canvas before application
CSS runs. The existing manifest gains only background_color black, a supported
launch-background hint. No PWA scope, icon, start URL, status-bar or Home artwork
settings change. iOS controls its native launch snapshot/splash before the web
page renders; these web changes do not control or verify that native phase.

## Verification

All eleven browser scenarios and three compiled-production checks pass. Client
and portal TypeScript checks, the combined Pages build and the isolated old/new
outline regression also pass.

The browser regression covers unchanged cropping/centring/progression, subtle
independent eye intensities, a retained completed border during slow startup,
multiple rendered crossfade frames, 300ms coordinated transitions, Home/auth
error flows, and no replay across Home/MetaTrader/Settings navigation. It uses
isolated API fixtures and does not submit trades or alter live accounts.

Run with both local dev servers:

    PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/startup-animation.browser.mjs

For a locally served combined Pages production bundle:

    STARTUP_APP_ORIGIN=http://127.0.0.1:5175/ea-app/ STARTUP_PORTAL_ORIGIN=http://127.0.0.1:5175 node scripts/tests/startup-animation.browser.mjs

STARTUP_SCENARIOS selects comma-separated cases; STARTUP_CAPTURE_DIR selects
where screenshots and measured frame/phase results are saved under work/.

Physical iPhone/Android hardware and native installed-PWA acceptance were
unavailable. Chromium mobile/standalone emulation is not native iOS testing.
The referenced recordings were not attached to this conversation, so no direct
recording comparison is claimed. Existing Vite chunk-size/label sourcemap
warnings remain.
