# Native device-width viewport for the installed iOS client

## Confirmed evidence

The installed iPhone 13 Pro reported screen.width 390, innerWidth/HTML/body/app
width 459, visualViewport.width 459, visualViewport.scale .85, and a 340px Matrix
panel. Loaded build: `35a15f25de4f442b8bda900073496a0d25ec6a00`.

This is page-level underscaling, not reduced control CSS dimensions. The same
340px panel occupies about 74% of the 459px layout instead of 87% of 390px.

PR #102's standalone guard is the only page-viewport writer found. It computes:

```text
surfaceWidth = visualViewport.width * visualViewport.scale
             = 459 * .85 = 390.15
scale        = round(surfaceWidth / 390, 5) = 1.00038
width        = 390
```

That reproduces the unusual fixed width and fractional scale from the report.
It measures an already-scaled viewport, cancels the observed discrepancy, and
feeds the result back as a new viewport policy on resize. The arbitrary 390px
reference and geometry feedback are confirmed application bugs. The browser's
original selection/retention of .85 is not independently established by the
report; no application page-level .85 assignment or CSS width of 459 was found.
The separate .85 lower bound in robot-panel resizing is local to that panel and
is unchanged. Do not claim that the app deliberately assigned .85 to the page.

## Narrow correction

Replace the computed policy with:

```text
width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover
```

Use device-width instead of a fixed number, and let WebKit resolve it for each
device/orientation. No screen, innerWidth or visualViewport arithmetic participates
in viewport configuration. Stop rewriting the meta tag on resize/keyboard events.
Keep the existing standalone-only scope, native-gesture guard, restoration on
pageshow and orientation handling. Repeated events with the same policy do not
write the meta tag again. Browser tabs and non-iOS platforms are unaffected.

This follows [Apple's viewport guidance](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html):
use device constants rather than hardcoded numeric widths. No CSS zoom, parent
transform, percentage compensation or individual control resizing is introduced.
The shared viewport policy applies to Regular, Matrix, S2tone and Lumo together.

No changes to authentication, passwords, accounts, startup animation, artwork,
control designs, customization, MT5, scanner or desktop layouts are included.
The opt-in sizing diagnostic remains available to verify the real iPhone after
an approved deployment. No merge or deployment is performed by this fix.

## Verification

- Recorded-state policy tests supply the actual 459/.85 observations and
  width=390 / scale=1.00038 metadata. The guard produces the canonical device-width
  policy without reading those zoomed measurements. Tested screen sizes:
  320, 375, 390, 393, 414, 428, 430 and 440. Keyboard/resume/rotation and gesture
  scope checks pass, with no feedback writes. This is policy regression coverage,
  not a simulation of all WebKit internals.
- A separate Chromium mobile-browser fixture starts at an actual .85 scale.
  Applying the real guard restores innerWidth and visualViewport.width to the
  device width and scale 1 for 320, 375, 390, 393, 414, 430 and 440px layouts.
  Control height stays 84px and panel width stays min(340px, available width).
  Keyboard-sized resizes keep scale 1. The fixture starts with a legacy .85
  viewport; it does not reproduce WebKit's fractional-meta/.85 contradiction.
- Client TypeScript and combined production builds pass. Existing app browser
  checks cover all four interface modes, native widths, fields/keyboard, rotation,
  floating-control dragging and Matrix pill-only movement. Pages/proxy regression
  checks run separately.

## After approval only

Deploy only the existing Cloudflare Pages frontend from the reviewed fix commit.
Leave Render, database and credentials unchanged. Fully close and reopen the
existing Home Screen PWA; do not delete its data or reinstall it as a diagnostic.

On the 390px iPhone, use Settings title → seven taps → Copy report. Expect:
device-width metadata with exact scale-1 policy; innerWidth/app/visual width about
390; visualViewport.scale about 1; Matrix panel 340px. Check all interfaces,
portrait/landscape, login fields, scrolling, swiping and the draggable controls.

Physical iPhone/WebKit recovery is NOT verified before deployment. If WebKit
still reports .85 despite the canonical metadata, investigate its retained or
site-level page-zoom state using the new report. Do not add another compensating
scale or resize controls to conceal that state.
