# iPhone top status-bar background coverage

## Scope

The supplied screenshot's black strip is the native iPhone status-bar area, above the web content viewport. The existing image already covered the entire available web viewport. This change adds supported **iPhone Home Screen web-app** status-bar configuration, allowing the same image to paint under that top area. It does not change the image URL, colours, opacity, filter, foreground typography, shapes, controls or navigation styling.

`viewport-fit=cover`, Apple web-app capability and `black-translucent` status-bar metadata enable the native edge-to-edge mode. The image stays on the full outer viewport. A separate content viewport reserves the top inset, retaining the old status-bar-free content dimensions and minimum component padding. Existing viewport-relative lengths and compact-height rules use those retained content dimensions so enlarging the background does not reposition controls. Safe-area variables are scoped to that content viewport to avoid applying newly exposed native insets twice.

The small edits to Home, scanner, MT5, robot and animation styles only normalize viewport/inset references. Their existing sizes, spacing constants, colours and animation durations are retained. The selected show/hide-background setting is respected.

## Verification and limits

**No physical iPhone or native status-bar capture was available.** Native status-bar appearance is therefore not confirmed on the user's device. Safari tabs and another app's embedded preview own their native chrome; a webpage cannot force its image into a host-controlled status bar. This implementation is for the Home Screen web-app mode supported by Apple, not a claim that browser/host chrome can be repainted.

Chromium DevTools safe-area emulation compares the new edge-to-edge viewport with the previous web viewport below a native status bar. It covers 44px and 59px top insets with a 34px bottom inset, a compact 20px top inset, ordinary portrait and landscape. All 45 Regular/S2tone_/Matrix × None/Orbit/Neural comparisons pass with foreground coordinates unchanged within 1 CSS pixel. Checks include bot names, branding, status/buttons, bot portraits, floating circle and all bottom-navigation controls. Both builds use the same selected Orbitron font. Resting-layout comparisons neutralize transient touch `:active` scaling in the test only.

Additional assertions verify unchanged MT5 geometry, metadata, centred `cover` sizing, loaded original image, top-edge coverage, and functional Settings, MT5 input, Start/Stop, Quotes/Home, Remove/Cancel, Notifications/outside dismissal and floating monitor/refresh/close. Existing full robot-window touch/mouse tests pass at 390×844, 320×568 and 1280×900. TypeScript and the production build pass. API responses are isolated test fixtures; no live trading operation was submitted.

The before/after images are **emulation artifacts, not device screenshots**. The baseline image is padded with a blank 44px strip representing the native area outside the old viewport; no clock or status icons are simulated. `results.json` summarizes actual geometry checks. Full measurements are generated in `work/status-bar/` by the browser script.

## Device verification after an approved deployment

Open the updated URL in Safari and use Share → Add to Home Screen, with web-app mode enabled where offered. Launch from that icon. Existing shortcuts may need to be re-added if iOS retains old launch/status-bar settings. Check the native status-bar image and unchanged control positions on the actual iPhone. No production deployment is performed by this change.

## Sources

- [Apple: supported meta tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)
- [WebKit: designing websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

## Reproduce

Serve the unchanged build at BEFORE_ORIGIN and the updated build at AFTER_ORIGIN (both expose `/ea-app/`).

```
BEFORE_ORIGIN=http://127.0.0.1:5198 AFTER_ORIGIN=http://127.0.0.1:5196 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/status-bar-background.browser.mjs
```
