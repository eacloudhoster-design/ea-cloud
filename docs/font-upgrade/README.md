# Select Font upgrade — implemented subset and outstanding assets

This change is intentionally **partial**: one of the eight requested additions is bundled. No missing font is represented by a generic fallback or a nonfunctional menu entry.

## Implemented

- Removed Rajdhani and Exo 2 from the existing Select Font menu. Existing saved selections migrate to Inter in the same account-scoped preference key. Their asset files stay available for existing unrelated typography, including MetaTrader's Exo 2 heading.
- Preserved Inter, Roboto and Orbitron and added authentic **Flipside BRK** by Brian Kent / Ænigma Fonts (v1.75). The unmodified TTF comes from Ubuntu's `fonts-aenigma` package. Its native weight is 400; no synthetic bold is applied. Original author notices and the distribution's explicit redistribution permission are included in `/font-licenses/flipside-brk/`.
- Enforced uppercase presentation on the primary bot name without changing mentor data. The primary name alone follows the selection; secondary labels retain the existing default Inter typography. Existing wrap/centering rules remain, including wrapping unbroken long names.
- Kept the same Settings menu, selected-state indicator, local persistence and interface layouts. Font choices preview the authentic face. No dependencies or external runtime font service.

## Requested font status

| Font | Status / source |
| --- | --- |
| Concielian | Not included. Iconian's commercial permission is required; no licence or font supplied. [Designer terms](https://iconian.com/commercial.html). |
| Flipside BRK | Included. [Ubuntu distribution package](https://archive.ubuntu.com/ubuntu/pool/universe/f/fonts-aenigma/fonts-aenigma_0.0.20080511+dfsg-5_all.deb), original author `flipside.txt` and distributor permission bundled. File and package checksums are in `src/assets/bot-fonts/additional-manifest.json`. |
| Generic Techno | Not included. Designer's [download page](https://ncempire.net/download) is inaccessible to the download environment. Third-party OFL listings are insufficient to verify the exact delivered version; obtain the original file and included licence. |
| Glitch Goblin | Not included. [Designer release](https://ggbot.itch.io/glitch-goblin-font) confirms SIL OFL 1.1; authentic download blocked. |
| Moonhouse | Not included. [NimaType's listing](https://www.1001fonts.com/moonhouse-font.html) permits commercial use under the listed [FFC licence](https://www.1001fonts.com/licenses/ffc.html), including app embedding. Authentic download blocked. |
| Woodwarrior | Not included. [Font Library](https://fontlibrary.org/en/font/woodwarrior) distributes Anton Bohlin's font under CC BY-SA with web embedding examples. Authentic download blocked. |
| Strasua | Not included. The designer's [public-domain collection](https://typodermicfonts.com/public-domain/) explicitly includes Strasua under CC0 and permits embedding. Authentic download blocked. |
| Streetbrush Regular | User confirmed this is the single script style formerly described as Sphere-style Script. Not included: [Robert Arnow's publisher listing](https://www.myfonts.com/collections/streetbrush-font-robert-arnow?tab=licensing) offers separate commercial webfont/app licences; no licensed files supplied. |

The nine screenshot references were not attached to this session, so an exact visual comparison was not possible. None of these fonts has been silently substituted.

The managed environment's destination allowlist blocks the designer/font-library download hosts (HTTP CONNECT 403). A sandbox network grant did not change that destination policy. Downloads require those hosts to be enabled in the environment network configuration, or original font packages supplied by the owner. Trusted Ubuntu archive access was available for Flipside. No blocked-host proxy bypass was attempted. Concielian and Streetbrush additionally require the appropriate owner-held licences.

## Verification

The updated `scripts/tests/font.browser.mjs` runs the real production-built `/ea-app/`, with local account/API fixtures and external websites blocked. It uses Chromium's `CSS.getPlatformFontsForNode` to confirm the actual rendered glyphs come from the selected bundled family, rather than merely checking a CSS family name. All four available fonts are selected in all three layouts at mobile and desktop sizes. It also checks uppercase, centering/overflow, one selection, secondary-font isolation, saved-selection migration, reload/reopen persistence and a long bot name.

Results and screenshot evidence are included alongside this file. This is a fixture using the app's original default robot artwork; no production credentials, accounts or trading services are used. Only the Select Font system and bot-name typography are changed. The remaining seven additions cannot be called complete or visually verified.

No production deployment or merge was performed.
