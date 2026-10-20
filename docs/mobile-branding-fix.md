# Mobile loading and mentor branding

Previous fixes already present at b4717ee: Pages app routing/auth (#2), inclusion of the mobile bundle in the default build (#3), safe bootstrap diagnostics (#4), persistent R2 uploads (#5).

Remaining causes: `/api/app/me` had an unbounded fetch; outages were treated as invalid credentials (including database failures inside client authentication). Dashboard branding requests silently failed and used defaults, and the first active EA name overrode the mentor's custom profile name. Profile image uploads required a later Save action, and preview errors cleared the URL, allowing a later save to erase it.

The fix bounds session and branding requests (including JSON body reads) to 20 seconds, provides error/retry UI in the existing black/red splash, keeps the token on transient errors, and loads the linked mentor before displaying the dashboard. Profile names take precedence; images are persisted via the existing profile endpoint immediately after upload. Preview errors retain saved URLs. Login and activation requests also have a 20-second abort.

## Deployment

No database migration is needed: existing `users.robot_name`, `users.background_image_url`, `app_access.mentor_id` and licence records are reused. Do not reset, seed, bootstrap, or push the database schema for this fix. No production database commands were run.

1. Merge the PR into main, then redeploy the existing Node API service using its existing build/start commands. Keep DATABASE_URL, SESSION_SECRET and all other runtime settings.
2. Redeploy the existing Cloudflare Pages project using `pnpm run build:pages`, output `artifacts/ea-cloud/dist`. Keep BACKEND_ORIGIN pointing to the existing HTTPS API origin.
3. Preserve the existing BACKGROUND_IMAGES R2 binding and bucket described in the background storage deployment documentation. Do not replace or empty the bucket.
4. Verify a mentor's custom name/image after saving, refreshing and signing back in. Verify a linked client sees that mentor's branding and a second mentor's client sees only its own mentor. Test a slow/unavailable API: within 20 seconds the splash must show an error and Retry; restoring service and retrying must preserve the session. Check pending, rejected and licence activation flows and trading controls.

Existing images already lost from ephemeral storage or overwritten profile fields cannot be reconstructed by this patch; affected mentors must re-upload through the existing profile/settings UI. Existing saved R2 URLs are preserved. No automatic client reassignment or data backfill is performed.
