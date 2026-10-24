# Cinematic startup

The existing StartupSplash now uses a 12-second ready-on-time sequence:
2 seconds for a centred 0.88-to-1 scale/opacity entrance, 7 seconds for the
clockwise cloud outline, 1 second for the completed glow, and a simultaneous
2-second eased crossfade into the still-mounted application.

The original JPEG is unchanged. A presentation crop uses artwork coordinates
0,150 through 1254,840, excluding the baked-in wordmark beginning at y=849.
The SVG uses those same coordinates and the existing cloud silhouette. A bright
core and soft red trailing stroke add prominence without extra visual elements.
Static shadow filters avoid animating blur; scale, opacity and dash offsets
provide the motion. Reduced-motion mode omits zoom and the moving highlight.

The timeline waits for logo decoding. A failed image cannot trap a usable app.
Readiness is checked at the end of each complete seven-second trace; delayed
initialization continues tracing and never exposes an unready interface.
Tab navigation keeps the same splash instance and does not restart it.

## Verification

- Client and portal TypeScript checks and combined Pages production build pass.
- Eleven Chromium browser scenarios pass: guest, desktop, Android-sized mobile,
  simulated iPhone standalone, delayed logo, delayed auth, auth failure, portal,
  portal dashboard, reduced motion and asset failure.
- Normal decoded-asset sequences measure 12.03–12.10 seconds. Delayed-auth
  coverage measures 19.03 seconds, completing an additional circuit before
  revealing Home rather than exposing an uninitialized interface.
- Three additional checks on the compiled combined Pages bundle pass: guest,
  simulated standalone and portal dashboard, measuring 12.04 seconds.
- Assertions cover gradual zoom, centring at multiple animation frames, exact
  image crop coordinates, closed cloud path, progressive slower dash movement,
  glow, simultaneous opposing fade opacities, two-second transition, ready Home,
  retained authentication and no splash restart across app tabs.
- Trace/completion screenshots were visually inspected. All browser APIs use
  isolated fixtures and do not submit trades or alter production accounts.

Run both dev servers, then:

    PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/startup-animation.browser.mjs

For a locally served combined production bundle:

    STARTUP_APP_ORIGIN=http://127.0.0.1:5175/ea-app/ STARTUP_PORTAL_ORIGIN=http://127.0.0.1:5175 node scripts/tests/startup-animation.browser.mjs

STARTUP_SCENARIOS selects comma-separated cases; STARTUP_CAPTURE_DIR selects
where screenshots and measured results are saved (default under work/).

Physical iPhone/Android hardware and native installed-PWA acceptance remain
unverified. Chromium standalone/mobile emulation is not native iOS testing.
Only the request text was attached; the referenced recording was unavailable,
so no comparison against that recording is claimed. Existing Vite chunk-size
and label sourcemap warnings remain.
