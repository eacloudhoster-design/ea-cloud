# Mentor app background images

The central editor is Mentor Portal → Profile → Branding & Assets → APP BACKGROUND IMAGES. Select an owned EA, then upload Normal, Beast, Aggressive and Ultimate images. Cards appear in mode order in a 2×2 mobile grid and one row on sufficiently wide desktops; previews use 9:16 portrait frames and object-fit: cover.

Uploads accept JPG, PNG and WebP up to 10MiB (10 × 1024 × 1024 bytes), report transferred-byte progress, and use the existing authenticated storage endpoint. The previous UI advertised 10MB but both its validation and the Pages storage handler actually enforced 5MB; both are now consistent at 10MiB. The handler retains its ownership, MIME/signature, no-overwrite and streamed-size checks. Existing GIF URLs remain supported for reading, and the shared storage API retains GIF compatibility for other existing uploaders.

Use **Save artwork** to publish uploaded replacements or removals to linked clients. This preserves the existing save workflow. Switching EAs while a transfer/save is pending is disabled; unsaved selections require confirmation before discarding. Every EA still uses its own existing mode-image record and routes; no new schema, migration, credentials or account modifications.

Removing an individual mode override clears only that mode's URL when saved; uploaded objects are not deleted. Existing Normal fallback semantics are retained: when no Normal override exists, the legacy profile background is shown. It is labelled as inherited and cannot be deleted through an override's Remove Image button. Removing a Normal override restores that inherited image. This deliberately preserves existing uploads and the Mentor Portal's decorative background. Client fallback/mode-switching/image-decoding logic and layouts are unchanged.

The duplicate Settings uploader and Profile single-image URL/uploader are removed. Profile saves no longer submit a background field, preventing accidental legacy-image overwrites. EA Manager links to this editor instead of opening another upload dialog. Notifications, Security, Platform, profile fields and API credentials retain their existing handlers.

## Validation

- Website TypeScript and combined Pages production build.
- `node scripts/tests/background-storage.test.mjs`: storage ownership, errors, MIME/signature validation, streamed >10MiB rejection and acceptance at the exact 10MiB boundary.
- `PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/tests/mentor-background-api.test.mjs`: isolated PostgreSQL migration retry, owner/principal checks, per-EA persistence, client mode mapping, mode-specific removal, legacy fallback, and unchanged EA/legacy profile records. The verified portal principal is injected only by the isolated test at the production middleware boundary; production authentication is not modified.
- Serve the built Pages output and run `scripts/tests/mentor-background-manager.browser.mjs` with local `APP_ORIGIN` and `PLAYWRIGHT_MODULE`. Checks 320/390/1440px layout, uploads, reload, per-EA records, unsaved-switch confirmation, removal isolation, invalid/failed uploads, retained old previews, Settings section preservation and EA Manager links. The 390px check also opens the actual built client, selects all four modes, waits for each decoded background and verifies stable navigation/no trading writes. Routes and storage are fixtures; no production systems are used.
- The older `ea-mode-images.test.mjs` combined suite currently fails to bundle because its pre-session-repair DB fixture lacks the `pool` export now imported by browser-session.ts. Its UI helper is updated for the inline editor, but the unrelated authentication fixture has not been rewritten. The focused API test above covers this feature's persistence and authorization boundary.

## Deployment — only after approval

Merge the reviewed feature PR, then deploy that frontend/Pages Functions commit using the existing Cloudflare Pages project and settings: build `pnpm run build:pages`, output `artifacts/ea-cloud/dist`. The deploy must include the existing `functions/` directory so its 10MiB limit matches the new editor. Keep current R2 bindings, BACKEND_ORIGIN and credentials unchanged. No Render/VPS restart or new database migration is required; the existing mode-images schema/endpoints remain prerequisites.

After deployment, verify one owned EA with an approved mentor account, refresh its saved artwork, and check linked clients on actual iOS/Android devices. Roll back by reverting this feature commit and rebuilding Pages; existing storage objects, saved mode URLs and legacy background references remain compatible. No production deployment or database operation is performed by this change.
