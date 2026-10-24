# Shared EA mode image switching

The earlier mode UI stored its choice inside Settings and never supplied that choice to the app's image renderers. This change moves selection and artwork loading into an app-level `useVisualModes` hook exposed through the existing AppContext. The existing `/api/app/ea-mode-images` endpoint, per-EA database rows and mentor upload/save workflow are reused unchanged.

## Behavior

- Normal/Beast/Aggressive/Ultimate select the corresponding uploaded Image 1/2/3/4. The background, portrait frame (Orbit or Neural/cube) and floating circular avatar use one decoded active image URL, published in one React update. Other components already consuming that shared branding image receive the same source.
- Selection highlights update immediately. The selected image is loaded/decoded before replacing the displayed source, so a cold network load retains the current valid image until its replacement is ready. A cached card image switches without a refresh. ModeImage retains the original img attributes/box and adds only a 200ms low-amplitude arrival fade, disabled for reduced motion and hidden backgrounds.
- The existing per-client/per-EA localStorage keys are preserved. Saved modes restore on startup before the splash dismisses, not only after opening Settings. Existing EA artwork selection also persists.
- Missing/failed artwork falls back to that same EA's Normal image, then the assigned mentor's profile image, then the existing bundled robot fallback. It never substitutes another EA/mentor's stored mode image. Image attempts and API requests have timeouts; failed images can retry on refresh or the existing Retry control. A complete load failure exits loading with an error rather than leaving the splash indefinitely.
- The shared request/cache/decoded state is scoped to client session, assigned mentor ID and EA ID. Late results are discarded on scope changes. An access denial clears the mode records. Mode selection writes only local preferences; trading/risk/auth/licensing/payment behavior is unchanged.
- Artwork refresh runs globally on focus/visible return and every 20 seconds, so replacements also reach Home while Settings is closed. Existing background visibility, fixed fullscreen image, safe-area rules, PWA canvas configuration and shape dimensions are preserved.

## Files

- `artifacts/ea-app/src/hooks/use-visual-modes.ts`: shared fetch/selection/persistence, owner-scoped decoding cache, fallback and refresh.
- `artifacts/ea-app/src/App.tsx` and `context/AppContext.tsx`: retain mentor identity/profile fallback separately and expose the shared active image/mode state.
- `components/EaModeCards.tsx`: same cards/classes/layout, now using shared state instead of private Settings state.
- `components/ModeImage.tsx`: same img box/props, optional arrival animation only.
- `pages/HomeTab.tsx` and `components/TradingActivityMonitor.tsx`: use ModeImage for existing portraits/circles; no control, frame or navigation CSS changes.
- `scripts/tests/helpers/ea-mode-browser.mjs`: expanded real upload→storage→database→render integration checks.
- `docs/ea-mode-images.md`: update the older cosmetic-card-only description.

## Verification

Client TypeScript and combined production Pages build passed. The new integration run passed using the real Express mode routes, real Drizzle queries, isolated PGlite PostgreSQL and existing Pages R2 handlers with an isolated bucket:

```sh
MODE_ORIGIN=http://127.0.0.1:5215 \
PGLITE_MODULE=/tmp/ea-mode-pglite/package/dist/index.js EA_MODE_BROWSER=1 \
node --test scripts/tests/ea-mode-images.test.mjs
```

The test uploads four distinct existing JPEG test assets through the Mentor Portal, saves them, and checks all three rendered image URLs/loaded dimensions for all four modes. It repeats across Regular/Matrix/S2tone and Orbit/Neural shapes, checks fixed portrait/circle/navigation bounds, persistence across navigation/reloads and account/EA separation, a failed URL, missing-mode fallback, a delayed image resolving after a newer selection, mentor replacement refresh, and mode changes while the background is hidden. No client trading writes occur. Test assets are confined to the isolated test bucket/database, not production mentor data.

The full Node suite remains 118 tests: 116 passed, one optional DB test skipped without its engine path, and one pre-existing unrelated activity-monitor wording failure. The optional DB/browser test was explicitly run separately and passed. No production database or storage was accessed. Physical installed iPhone/PWA and real deployment verification remain outstanding.

Artifacts: `work/ea-mode-tests/dynamic-{regular,matrix,s2tone}-{orbit,neural}.png`, `client-{320,355,390,430}.png`, `mentor-uploads.png`, and layout measurements. They use real existing repository test images uploaded to distinct test storage objects, not hardcoded runtime mode assets.

## Deployment

This change requires only the client/combined frontend Pages build. No new backend route, database migration, environment variable or service is introduced. The existing EA mode-images API/table from PR #57 must already be deployed/applied; if not, use that earlier migration/deployment procedure (`docs/ea-mode-images.md`) first.

Do not merge or deploy without approval. Existing iOS fullscreen metadata and OS behavior are unchanged; this does not claim to fix a native iOS status-bar limitation or require reinstalling for a CSS viewport change.
