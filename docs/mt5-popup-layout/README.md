# MetaTrader popup layout correction

## Cause and fix

The previous sheet occupied only 78% of the already navigation-reduced viewport. A separate 44px opaque header further reduced its form area. The mounted form retained its scroll position across openings, so reopening after entering lower fields could show a clipped logo. Existing short-screen CSS also hid the subtitle.

The sheet now fills the available space above navigation, retaining a 24px exposed Home strip for outside dismissal. Its close button overlays the existing image instead of consuming an empty black row, with a dark translucent surface for contrast. The existing EA Cloud/mentor line reserves room for that control. The form scroll resets before painting each opening; account/server values and the existing password-clearing behaviour are preserved.

The popup reserves the glass navigation's safe-area height. The form retains native internal scrolling, while the close control stays outside that scroller. The nested connection-status close control has separate space below the panel close button. The subtitle stays visible on short screens. The three labels use the existing Inter family at 17px/700.

The original MT5 logo asset, responsive dimensions, styling, heading font, background image/appearance, input dimensions, icons/placeholders/styles and connection logic remain unchanged. All new form style overrides are scoped under `.mt5-popup`. Symbols, Home, Settings, bottom navigation and the floating assistant implementations are untouched. The existing immediate popup opening/closing presentation is preserved.

## Verification

`scripts/tests/mt5-popup-layout.browser.mjs` compares original and corrected builds using the same synthetic fixture data. Nine configurations cover all three interfaces at 390×844 and 320×568, plus 393×852 with top59/bottom34 safe areas, 844×390 landscape and 1280×900 desktop layout.

Checks include:

- Complete original logo visible on opening, identical asset path, CSS and responsive size.
- Heading centred below the logo, original font retained; subtitle visible below it.
- Consistent 17px/700 labels; unchanged input dimensions, CSS and placeholders.
- Unchanged background source and computed styling.
- Native touch scrolling where content overflows; Connect MT5 and disclaimer fully reachable above navigation.
- Scroll resets on reopening; account/server persist and password clears as before.
- Outside, X, Home and Settings dismissal/navigation; no browser runtime errors or API writes.
- Existing theme changes; panel close and connection-status cancel controls do not overlap.

The existing `metatrader-popup.browser.mjs` regression suite also covers six mobile/interface combinations, password visibility and the existing unverified connection-status flow. Its panel-position assertion was updated for the taller popup.

Run against local original/updated previews:

```sh
BEFORE_ORIGIN=http://127.0.0.1:5203 AFTER_ORIGIN=http://127.0.0.1:5204 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/mt5-popup-layout.browser.mjs
APP_ORIGIN=http://127.0.0.1:5204/ea-app/ PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/tests/metatrader-popup.browser.mjs
```

Screenshots and raw results are generated in `work/mt5-popup-layout/`. TypeScript and Vite build passed; the existing bundle-size warning remains.

The two referenced screenshots were not attached, so an exact comparison against them was not possible. Verification used generated before/after browser screenshots and Chromium touch emulation, not physical iPhone/Android devices or native soft-keyboard testing. The existing MT5 preview is not live broker authentication. No production deployment performed.
