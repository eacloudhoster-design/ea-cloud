# Public website mobile navigation

Mobile header: hamburger on the left, the original EA Cloud image exactly centred, account icon on the right. The adjacent text and header Get App button are hidden on mobile; Get App remains in the mobile navigation and existing homepage CTAs. Header height and homepage content remain unchanged.

The account icon opens a lower-screen, charcoal bottom sheet with rounded top corners, a drag handle, dimmed/blurred backdrop, large Sign In/Sign Up/Help rows and a separate language selector. The hamburger opens a matching navigation sheet with the existing Home/App/Features/Get App destinations. Both sheets support outside taps, Escape and Back. The account sheet supports native downward touch swipes and handle dragging; short pulls snap back. Expanded content scrolls normally inside the panel, including on small phones. Closing restores focus and the page's previous scroll position.

The existing Radix Dialog primitives supply focus trapping, background scroll locking, outside/Escape dismissal and closing presence. A same-URL history entry makes browser/device Back close the panel before leaving the page; Forward reopens it. Selected navigation is performed on the frame after `popstate` so native history scroll restoration cannot cancel a Help/section scroll. No whole-page reload occurs when dismissing a sheet. Get App still loads its separate real `/ea-app/` bundle; public sign-in/registration use the existing routes.

The mobile breakpoint remains at 760px, with additional support for coarse-pointer, non-hover phone landscape viewports up to 960px wide and 500px high. Desktop pointer layouts above the mobile breakpoint retain the existing header and account dropdown.

## Honest language availability

The public website currently implements English only. English is the default/current selectable language. Português and Español are explicitly disabled and labelled **Not yet available**; there are no fake translation actions. No partial translation or global desktop text change was introduced. Help reuses the existing FAQ and license/access links; no support address or route was invented.

## Scope preserved

No changes to the hero, screenshot assets, Orbitron/other website fonts, introduction, CTAs, installation guides, Features content, auth/session/backend code or trading application. No new dependency declarations or lockfile changes.

## Verification

- TypeScript and public production build passed. Existing Vite UI source-map reporting and bundle-size warnings remain.
- Combined static output passed `verifyPagesBuild` for the public website and `/ea-app/`.
- Native Chromium touch emulation passed at **390×844, 320×568, 430×932 and 844×390**: centred original logo, three header elements, account/help/language panels, outside/handle/panel-swipe dismissal, short pull snapback, Back/Forward/Escape, preserved scroll position, no reload on Back, real auth/help/section/app destinations, overlay cleanup and mobile-to-desktop resize cleanup.
- Final focused 390px/320px runs additionally verify immediate intentional taps after a cancelled drag and native scrolling within expanded content. Actual recorded opening frames progress upward to the final sheet position.
- Desktop captures at **1440×1000, 1024×900 and 768×1024** are byte-for-byte identical PNGs before/after the change with reduced motion enabled. Navigation/hero geometry is identical too. The original desktop account dropdown remains functional.
- The public website regression suite passed at desktop/tablet/mobile sizes, including screenshot composition, reduced motion, navigation/account/help, auth form handlers with fixtures, app entry and session preservation.

Tests use API fixtures for account flows and create no real accounts or trades. Physical iOS Safari/Android devices were unavailable. The Rockstar reference images mentioned in the text were not included in that upload; styling follows the explicit written requirements using EA Cloud's own branding.

Reproduce against local previews, with the baseline built from commit `13f770e6f26b20f1b201452479dc544dba7d660c`:

```sh
PUBLIC_ORIGIN=http://127.0.0.1:5216 BEFORE_ORIGIN=http://127.0.0.1:5217 node scripts/tests/mobile-public-navigation.browser.mjs
PUBLIC_ORIGIN=http://127.0.0.1:5216 node scripts/tests/public-website.browser.mjs
```

Set `PLAYWRIGHT_MODULE` when Playwright is installed outside the repository. Chromium is expected at `/usr/bin/chromium`. `MOBILE_WIDTH` can select one phone width; desktop comparisons still run.

## Requested screenshots

- [Homepage / header](screenshots/home.png)
- [Account panel](screenshots/account.png)
- [Expanded Help](screenshots/help.png)
- [Expanded language selector](screenshots/languages.png)

Measurements, animation frames and desktop screenshot hashes: [results.json](results.json).

No main-branch merge or production deployment was performed.
