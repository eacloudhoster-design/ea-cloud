# Working background animations

The existing Back Animation accordion contained five styled buttons without event handlers, selection state, persistence, or a corresponding renderer. All Home layouts render above the same full-screen background image. The fix connects the existing menu to the existing account-scoped Home appearance preference and mounts one decorative effects layer between that image and Home content.

- None: no additional animation layer; original background, image visibility setting and bot shape remain independent.
- Pulse: 2.6-second ambient pulse with an expanding light wave.
- Glow: 3.8-second breathing neon edge lighting.
- Matrix Rain: transparent streams of digital characters with independent speeds, brightness, negative phase delays and fading.
- Particles: small glowing sparks with staggered floating motion, sizes and opacity.

All effects read the existing selected accent colour. No dependency was added. Only one effect mounts; switching off Home, hiding the document or enabling reduced motion removes it. CSS transforms and opacity drive animation without frame-by-frame React updates. Narrow viewports use fewer streams/particles. Decorations have no pointer events and do not affect layout.

## Verification

Browser testing uses the actual built `/ea-app/` application in Chromium with isolated authentication/API fixtures, not a reconstructed UI. The existing default robot artwork supplies the fixture background. No live account or trading service is contacted.

`background-animation.browser.mjs` selects all five options in each of Regular, S2tone_ and Matrix. For each animated effect, screenshots 700ms apart differ while unrelated animations are paused; computed transforms/opacity advance and animation play states remain running. None removes the effects layer. Tests check exclusive rendering, selected indicators, original background and shape, natural scrolling at a shorter mobile viewport, symbol controls, touch dragging and opening the floating robot, theme changes, reload/reopen persistence, inactive tabs, hidden-document cleanup, reduced motion, and density at 320px versus desktop.

`results.json` records browser assertions. `pixel-differences.json` records changed pixels between capture pairs. Included Matrix screenshots illustrate each effect at two timestamps, plus None. The full test generates corresponding pairs for all three layouts under `work/background-animation/`.

TypeScript and four Home-preference unit tests pass, including old/invalid preferences, storage failures and account isolation. Both production applications build successfully. Existing bundle-size warnings remain. The workspace pnpm wrapper attempts an unavailable store installation; builds were run using the installed Vite binaries/pnpm executable with dependency verification disabled, without changing dependencies.

No production deployment was requested or performed. Live Cloudflare access is unavailable under this environment's network policy. Review/merge is separate from this feature branch.
