# Mobile-only floating cloud login

The phone login now uses the approved geometric background across the full screen, with a transparent cloud icon hovering 30px into the top of a dark rectangular form panel. The heading and welcome message sit below the icon with clear separation. There is no enclosing circle, circular border, rectangular matte, CSS mask or crop around the mobile cloud. The existing cloud's black/silver/red design and circuit details remain visible.

## Desktop is unchanged

The new styles apply only at widths up to 760px, plus touch-screen landscape layouts up to 960px wide/500px high. All other layouts keep the existing artwork, eye timing, form positions, heading, links and button design. A prepared cloud image is used only inside the mobile-only layer; the original shared logo is unchanged.

Screenshots captured before and after at 1440×1000, 1920×1080 and 820×1000 matched exactly: **zero changed pixels** in all three full-page comparisons. [Comparison results](desktop-comparison.json) identify the baseline commit. The existing desktop sign-in remains the split-screen design; the pre-existing 820px stacked/tablet layout is also preserved.

## Mobile details

- The dark panel retains the email/password form, visibility toggle, LOGIN action, account creation link, Help / Support and close navigation. It shows the requested “EA Cloud Admin Portal” heading and “Welcome — Login to access your dashboard” message on mobile.
- The full cloud overlaps only the panel border area. Its bottom clears the heading by more than 12px in every tested size. The transparent wrapper has no background or border.
- The eyes run a 3.6-second dim → bright → intensified → dim → brief off cycle. SVG underlays dim the baked-in pupil illumination; the activation overlays affect only the actual eyes. The cloud image itself does not flash.
- Six SVG pulse paths track the cloud's native circuit coordinates, with staggered starts and fading light. They stay inside the cloud. The original background neon traces are reused in a fixed cover-sized mobile backdrop; artwork and pulses share the same viewport transform.
- The mobile surface scrolls naturally at short heights. The input and LOGIN button remain reachable with a reduced-height keyboard-sized viewport. Decorative layers are pointer-transparent. Reduced motion disables decorative movement and leaves static illuminated eyes.

## Transparent asset preparation

The latest request explicitly permits preparing a transparent version of the existing logo. `ea-cloud-mobile-cloud.png` was prepared from the approved `ea-cloud-nav-logo.png` using image background removal, then saved as a separate mobile-only asset. It is a 1688×932 RGBA PNG with fully transparent exterior corners and essentially opaque black interior surfaces (sample alpha 253/255). There is no image of a checkerboard, circular container, wordmark, watermark or CSS edge-concealment workaround. No raster resizing/cropping script is used. The original RGB asset and desktop rendering remain unchanged.

This supersedes the earlier mobile blocker that required an original transparent source under the previous “locate the original” instruction. The original transparent source was not found; this request authorizes a prepared transparent variant instead.

## Screenshots and recording

- [Mobile: eyes illuminated](mobile-eyes-on.png) · [Mobile: eyes off](mobile-eyes-off.png)
- [Small phone](small-phone.png) · [Large phone](large-phone.png) · [Touch landscape](landscape.png)
- [Eight-second mobile animation recording](mobile-animation.webm)

Screenshots and recording show rendered application pages. No real credentials appear in the evidence.

## Validation

- Full workspace typecheck and production build passed.
- `mobile-login.browser.mjs`: 390×844, 320×568, 430×932, 760×1024, 844×390 touch landscape and 960×440 touch landscape. Checks cover centering/overlap/heading clearance, no horizontal overflow, real PNG transparency, absence of CSS masks/circular containers, eye on/off timing, circuit motion/bounds, reduced motion, required validation, password toggle, unchanged API payload/errors, registration/sign-in/support/close links, and input/button reachability at 390×480.
- Existing detailed form suite passed at six sizes, including loading, invalid/pending/approved states and unchanged request contracts. Existing mentor registration/sign-in responsive suite passed at five sizes.
- Existing real-session browser suite passed login, refresh, full browser restart, app/portal navigation, Back, outage recovery, logout and mobile-touch logout in a disposable database fixture.
- API endpoints, authentication/session providers, password rules, approval logic, registration, database schema and trading application are unchanged. No new animation library or runtime animation loop is added.

Coverage uses Chromium touch emulation, not physical iPhone Safari/Android or installed-PWA hardware. The mobile backdrop uses a fixed element with its own cover image to keep the source artwork and neon geometry aligned without relying on iOS support for `background-attachment: fixed`.

No production deployment or merge performed. The existing repository integration may automatically create a Cloudflare PR preview on push.

## Changed files

- `artifacts/ea-cloud/public/ea-cloud-mobile-cloud.png`
- `artifacts/ea-cloud/src/pages/admin/MobileLoginArtwork.tsx`
- `docs/mobile-login/README.md`
- `docs/mobile-login/desktop-comparison.json`
- `docs/mobile-login/landscape.png`
- `docs/mobile-login/large-phone.png`
- `docs/mobile-login/mobile-animation.webm`
- `docs/mobile-login/mobile-eyes-off.png`
- `docs/mobile-login/mobile-eyes-on.png`
- `docs/mobile-login/results.json`
- `docs/mobile-login/small-phone.png`
- `scripts/tests/mobile-login.browser.mjs`
- `artifacts/ea-cloud/src/pages/MentorAuth.css`
- `artifacts/ea-cloud/src/pages/admin/Login.tsx`
- `artifacts/ea-cloud/src/pages/admin/MentorLoginArtwork.tsx`
- `docs/auth-neon/README.md`
- `docs/premium-auth/README.md`
- `scripts/tests/auth-neon.browser.mjs`
- `scripts/tests/mentor-auth.browser.mjs`
- `scripts/tests/premium-auth.browser.mjs`
