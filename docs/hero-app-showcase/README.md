# Hero typography and installation guides — partial draft

**Not complete and not ready to merge.** The request requires the exact Matrix, S2tone_ and Regular screenshots. Both uploads contained text only; no screenshot image files were supplied. No generated, recreated or unrelated screenshots have been substituted.

The required three-screen hero replacement, its staggered entrance/float effects, and the new mobile order remain blocked by those missing assets. The original large hero logo is retained until it can be replaced with the supplied images, rather than shipping an empty hero. No second screenshot arrangement has been added below.

## Completed independent changes

- Only the large EA CLOUD heading uses authentic Orbitron Latin Black (900), already present in the project's bot-font bundle. Its WOFF2 bytes are unchanged. The existing heading line-box heights are retained to preserve the subtitle, introduction and CTA positions. The white lettering and red dot remain.
- Navigation, other headings, paragraphs and buttons retain their existing fonts. No global font override or new dependency was introduced.
- The lower Get App section retains its introduction and adds **Get iOS Version** and **Get Android Version** buttons from the preceding brief. They open platform-specific browser-installation instructions, a real `/ea-app/` link and an app-address copy helper with manual fallback.
- iOS instructions explain Safari → Share (or More → Share) → Add to Home Screen → Add, with Open as Web App enabled if shown. Android instructions explain a supported browser's install prompt or browser menu → Install app / Add to Home screen. No native app, store listing or downloadable file is claimed.
- Existing `/ea-app/manifest.webmanifest` uses app scope/start URL `./` and standalone display. There is no existing beforeinstallprompt handler to reuse. The public root is outside the app's manifest scope, so no misleading install prompt is offered for the public site. Installation is completed in the existing app's browser page.
- The latest request explicitly preserves Features content, so Features is unchanged. Internal trading application, MT5, scanner, mentor portal, auth, API and database source are unchanged.

The license is included in the repository and the production output at `public/font-licenses/orbitron-OFL.txt`. Font SHA-256: `ce87e6a1b1955bbc7b1d2d1c30fb5b53af5e34edb5b93a33e28068054892ef74`.

## Verification

Public TypeScript and production build passed. Existing Vite source-map reporting and bundle-size warnings remain. Native Chromium touch emulation at 390×844 and 320×568 plus desktop 1440×1000 verified font loading, scope, red dot, no horizontal overflow, installation guide contents/bounds, real app popup destination, manual clipboard fallback, closing animations/overlay removal and focus restoration.

The existing public-website regression suite also passed at 1440×1000, 768×1024, 390×844 and 320×568, covering current navigation/account menu, auth form handlers with API fixtures, existing app entry, reduced motion and session preservation. Those tests cover the current site, **not the missing screenshot showcase**. Physical Safari/Android installation and OS Home Screen addition were unavailable and are not claimed as tested.

```sh
PUBLIC_ORIGIN=http://127.0.0.1:5212 node scripts/tests/public-installation.browser.mjs
PUBLIC_ORIGIN=http://127.0.0.1:5212 node scripts/tests/public-website.browser.mjs
```

Set `PLAYWRIGHT_MODULE` if the installed Playwright module is outside the repository. Chromium is expected at `/usr/bin/chromium`.

Review screenshots show only the completed font and installation-guide work:

- [Desktop font](screenshots/desktop-font-only.png)
- [Mobile font](screenshots/mobile-font-only.png)
- [iOS guide](screenshots/ios-install-guide.png)
- [Android guide](screenshots/android-install-guide.png)

[Recorded results](results.json). No production deployment or main-branch merge has been performed.
