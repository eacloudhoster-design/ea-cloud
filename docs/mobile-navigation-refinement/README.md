# Mobile navigation refinement

The existing full-screen menu now contains only Home, App, Features, FAQ and Support, with unchanged destinations. Get App and Become a Mentor remain available through the existing landing-page buttons; their pages and functionality are unchanged.

Headings are approximately 23% smaller (20–26px instead of 26–34px), with 68px minimum touch rows instead of 86px. All five fit at 320×568. Black/charcoal styling adds a faint dark-red ambient gradient, thin red dividers, custom directional arrows, and red press feedback. Rows fade and slide in over 200ms with 25ms offsets (300ms total). Active sections have red text, a slim left marker and an illuminated divider. Pressed arrows advance 3px. Reduced motion disables these animations and transitions.

The mobile active-section tracker measures the viewport reading area on a single animation frame per scroll. It freezes during menu scroll locking, avoiding stale intersection entries that could leave Home selected. Desktop retains its existing observer and navigation design. Existing close timing, history, focus, header positioning, scroll locking and destinations are preserved.

## Changed product files

- `artifacts/ea-cloud/src/components/layout/MobileNavigationMenu.tsx`: five items, stagger indices and custom decorative arrows.
- `artifacts/ea-cloud/src/components/layout/MobileNavigationMenu.css`: mobile portal appearance and motion only.
- `artifacts/ea-cloud/src/components/layout/Navbar.tsx`: mobile active-section tracking and cross-page selection state.

No authentication, session, login/signup page, backend, database, trading, landing-page, header styling or desktop layout files were changed.

## Verification

- Root production build and workspace type checks.
- Final website/EA app/Cloudflare Pages build and website type check.
- Updated `scripts/tests/fullscreen-menu.browser.mjs`: three normal-motion sizes (390×844, 320×568, 844×390), five items, smaller text, stagger timing, all five destinations from Legal, active indicator after each selection, Back/Forward, reduced motion, no document reload, and working Get App/mentor buttons outside the menu.
- Updated `scripts/tests/ios-public-menu.browser.mjs`: seven Chromium touch configurations, toggle, outside/header dismissal, Escape, native Back, scrolling, all section links, profile and public auth navigation.
- Desktop screenshots at 1440px and 1920px: zero changed pixels; identical visible header bounds, text and destinations (see `desktop-comparison.json`).

All browser tests run in Linux Chromium with emulated mobile viewports/touch and selected user agents/standalone flags. Physical iPhone Safari, iPhone Chrome, Android and installed PWA tests are unavailable. This is not WebKit or physical-device certification.

## Screenshots and recording

- [Mobile menu](mobile-menu.png)
- [Small phone: all five links](small-phone-top.png)
- [Landscape menu](landscape-menu.png)
- [App active](active-download.png)
- [FAQ active](active-help.png)
- [Opening and closing recording](opening-feedback-closing.webm)

No production deployment or merge was performed. The pull request uses the repository's normal automatic preview workflow.
