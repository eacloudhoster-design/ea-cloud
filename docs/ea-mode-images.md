# Cosmetic EA modes and mentor artwork

Settings → EA Manipulation now shows four portrait cards in one row: Normal, Beast, Aggressive, Ultimate. The former four numerical display rows are removed; trading/risk code is untouched. Normal is the default. A tap changes only a local visual preference, scoped to the client ID and EA ID in `ea-cloud:client:<id>:ea:<eaId>:visual-mode`. It survives navigation and reopening on the same device. When multiple active EAs are linked to a mentor, the section has an explicit **EA artwork** selector (also local/cosmetic), because current licences link to mentors rather than an individual EA. It does not select an EA for trading.

## Mentor workflow

In the existing Profile → Branding & Assets section, select an EA under **EA Manipulation · Mode images** and press **Manage four mode images**. The same editor is available through **Mode artwork** on each EA Manager card. Upload/preview/replace any of the four images, then press **Save artwork**. Uploading a file alone does not publish its URL to clients. Clear an image and save to remove its mode-specific override; files and old image references are not deleted.

The original profile/background uploader is preserved. Normal uses that saved profile image if no EA-specific Normal image exists. Saving a Normal override changes that EA's Normal artwork without rewriting the original mentor profile URL. Mode selection now drives the active background, portrait/cube and floating circle together through shared decoded image state; see `docs/shared-mode-images.md`. Trading configuration remains unchanged. Other missing images display a missing-artwork icon, without borrowing another EA's mode images.

The client refreshes artwork every 20 seconds while the dropdown is mounted/visible and on return/focus. GET responses are no-store; the existing storage upload flow issues new immutable object URLs for replacements. Mode selection sends no API writes. Fetches/uploads have bounded timeouts, retry messages and duplicate-save protection.

## Storage, API and authorization

Existing authenticated `/api/storage/uploads/request-url` and file PUT flow are reused. On Cloudflare Pages this uses the existing BACKGROUND_IMAGES R2 binding, validates mentor/account access, size/type and file signatures, and restricts upload paths to the uploading account. No paid service or runtime dependency was added.

New routes:

- `GET/PUT /api/eas/:id/mode-images`: checks authentication, persisted approved mentor/superadmin role and ownership of that EA. PUT accepts exactly four safe image URLs/nulls and no trading fields; R2 paths belonging to another user are rejected.
- `GET /api/app/ea-mode-images`: existing client authentication plus approved status and an active, non-expired licence whose mentor matches the client. Only that mentor's active EAs and their own image rows are returned, ordered by ID. Existing hosting/scanner permissions are not changed.

The application continues using its existing session/auth architecture. These checks do not redesign authentication. Account changes/denials clear the new component's displayed records; request cancellation prevents late responses from another account replacing current artwork.

## Additive migration and deployment

**No production database migration has been run.** The migration was applied twice successfully only in an isolated in-memory PostgreSQL-compatible test engine.

1. Through your normal approved PostgreSQL migration workflow, apply `docs/migrations/20261024-ea-mode-images.sql` with errors stopping the command, for example:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/20261024-ea-mode-images.sql
   ```

   It creates only `ea_mode_images` (EA foreign key/primary key, four nullable URL columns, updated timestamp). It does not update/drop/backfill existing users, EAs, licences, trading records or images. `IF NOT EXISTS` permits rerunning it. The schema is separately represented in `lib/db/src/schema/ea-mode-images.ts`.

2. Verify in the intended database:

   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ea_mode_images'
   ORDER BY ordinal_position;
   ```

   Expected: ea_id integer; normal/beast/aggressive/ultimate text; updated_at timestamp with time zone. Verify the ea_id primary key and foreign key to eas(id) in your migration tool. Do not use forced schema push/reset.

3. Build/redeploy the API service with the updated DB package/schema and routes. Then publish the combined frontend Pages build (mentor portal plus `/ea-app/`). Preserve existing BACKEND_ORIGIN, DATABASE_URL and BACKGROUND_IMAGES bindings. No new environment variables are required.
4. Save artwork through an owned EA and verify it from a linked, valid client. If the migration is missing, the new endpoints return an actionable 503; existing EA/trading endpoints do not query the new table.

Do not deploy or merge before approval. Rolling the application back can leave the additive table and uploaded objects in place; do not drop/delete records as a rollback shortcut.

## Tests and limits

- Client, mentor portal, API and DB TypeScript checks passed.
- Combined production Pages build and API production build passed (existing bundle warnings).
- `node --test scripts/tests/*.test.mjs`: 118 tests, 116 passed, one optional new PostgreSQL integration test skipped without its test-engine path, and one pre-existing unrelated activity-monitor assertion failed (`Awaiting status` wording). The new integration test was then run explicitly and passed.
- The explicit test applies the real SQL migration to an isolated PGlite PostgreSQL engine, uses the actual Drizzle schema/queries and Express routes, and checks ownership, ordinary/forged-role denial, cross-mentor isolation, active/expired/pending access, URL validation, persistence, legacy Normal fallback and unchanged EA/profile records.
- With EA_MODE_BROWSER=1 it additionally drives the real built mentor/client interfaces. Four real JPEG byte uploads pass through the existing Pages storage handlers into an isolated R2-compatible bucket, URLs persist through PostgreSQL, and the client displays them in order. It verifies replacement refresh, per-EA/account preferences, navigation/reload persistence, no trading writes, synchronized background/portrait/circle image URLs and unchanged container/navigation bounds, and four portrait cards/readable labels/no overflow at 320/355/390/430px. It does not call production APIs/storage.

Reproduce the isolated test without adding an application dependency:

```sh
npm_config_cache=/tmp/ea-mode-npm-cache npm pack @electric-sql/pglite@0.5.11 --pack-destination /tmp
mkdir -p /tmp/ea-mode-pglite
tar -xzf /tmp/electric-sql-pglite-0.5.11.tgz -C /tmp/ea-mode-pglite
PGLITE_MODULE=/tmp/ea-mode-pglite/package/dist/index.js node --test scripts/tests/ea-mode-images.test.mjs
```

For the browser extension, serve the combined production output with SPA fallback for mentor routes, then set `EA_MODE_BROWSER=1 MODE_ORIGIN=http://127.0.0.1:<port>` on the same command. A local Playwright installation and Chromium at `/usr/bin/chromium` are required. `PLAYWRIGHT_MODULE` can select its installed module path.

Preview/evidence artifacts: `work/ea-mode-tests/mentor-uploads.png`, `client-320.png`, `client-355.png`, `client-390.png`, `client-430.png` and `layout.json`. Four distinct existing test JPEGs were uploaded into separate storage objects; production shows the files chosen by each mentor. Physical iPhone/iOS Home Screen testing and live PostgreSQL/R2 deployment verification remain outstanding.
