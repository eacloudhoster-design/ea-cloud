# Select Font fix

Settings previously rendered font buttons without handlers or preference state.
Only Inter was requested remotely; the other choices had no font assets.

SettingsTab now renders one selected, keyboard/touch-accessible font button.
AppContext and useFontPreference share immediate state across navigation.
The existing browser-settings pattern is used: localStorage key
ea-cloud:client:<clientId>:bot-font. Invalid/missing settings default to Inter.
Preference survives reload and browser reopening on the same browser/profile.
It is account scoped, not synchronized across devices. Blocked browser storage
still allows immediate in-session changes.

BotName applies the preference to actual Home bot names in Matrix, Regular and
S2tone layouts, preserving existing sizes, colours, backgrounds and controls.
Primary names remain centred and wrap within their available width.
Locally bundled authentic WOFF2 fonts use scoped family aliases, so unrelated
UI typography is unaffected. See the assets/bot-fonts manifest and README for
provenance and the public/font-licenses directory for original OFL notices.

Validation: all 103 Node tests passed, client TypeScript passed. Real Chromium
UI checks passed all 45 combinations (five fonts, three layouts, 360/390px mobile
and 1280px desktop); CDP confirmed actual custom glyph fonts with external sites
blocked. Real button selection, exactly one selected option, navigation,
reload/reopening, bold weight, centring and overflow were checked. Local API
fixtures avoid production accounts or database access. Screenshots and metrics
are in work/font-previews (not source-controlled). Native iOS Safari and Android
hardware were not available for testing. Run node scripts/tests/font.browser.mjs
with Playwright installed and the app served locally at FONT_ORIGIN
(default http://127.0.0.1:5180, /ea-app/).

Frontend only: no database migration, backend deployment, environment variables,
or new dependencies are needed. Deploy the reviewed combined Pages frontend
after approval. No production deployment or merge is performed by this task.
