# Background uploads on Cloudflare Pages + Render

## Root cause

The previous Pages Function `functions/api/[[path]].js` forwarded
`POST /api/storage/uploads/request-url` to the Node API. Its storage route
caught failures and returned `500 {"error":"Failed to generate upload URL"}`.
The Node storage provider requires `PRIVATE_OBJECT_DIR` and signs Google Cloud
Storage URLs through Replit's sidecar at `127.0.0.1:1106`. That service and its
Replit authentication are not available on Render. Adding storage path variables
alone does not supply the sidecar. There were no R2 bindings in the repository.
The supplied error matches that catch path; private Render logs would establish
whether it failed first on the missing variable or on the sidecar connection.
Live-site requests from this task were blocked by the environment's egress proxy,
including an attempted request outside the sandbox.

## New upload flow

- `functions/api/storage/uploads/request-url.js` handles the POST in Pages,
  overriding the catch-all API proxy for this route.
- The handler checks the existing bearer token against the backend's
  `/api/auth/me`. Only approved mentor/superadmin accounts may upload.
- It returns a same-origin upload endpoint under `/api/storage/r2/<owner>/<uuid>`.
  That route checks the account again for PUT, verifies ownership, enforces the
  actual streamed size limit (5 MiB), and checks JPEG/PNG/WebP/GIF signatures.
  SVG and other formats are rejected.
- Both Settings and Profile send authorization on same-origin PUTs. Tokens are
  not attached to external legacy signed upload URLs.
- R2 stores the image. The existing authenticated `PATCH /api/profile` saves
  `/api/storage/r2/<owner>/<uuid>` in PostgreSQL's existing
  `users.background_image_url` column. No database migration is required.
- GET/HEAD serve the stored image from the same-origin route. Both client apps
  already consume this persisted profile background URL, so refreshes do not
  depend on a FileReader preview or expiring upload link.

The R2 bucket stays private: do not enable r2.dev or a public bucket domain.
However, individual background URLs are intentionally publicly readable for
clients and image tags, matching the old image-serving behavior. They contain
random UUIDs. Do not upload confidential documents as backgrounds. There is no
bucket-listing or deletion API. Uploads are immutable; reusing a key is refused.

Existing Google Cloud/legacy image URLs still use the old catch-all API proxy.
They are not rewritten or deleted. Removing a background clears only the profile
reference and leaves the object intact. Existing Replit-only images may still
need their original storage runtime to be reachable; this fix does not migrate
legacy objects or recover files absent from their original provider.

## Cloudflare dashboard setup

R2 is usage-metered with a free allowance. Check the allowance, limits and prices
shown by Cloudflare before enabling it; activation may ask for billing details.
No cloud resources or paid subscriptions were created by this change. Rendering
and database hosting remain unchanged.

1. In Cloudflare Dashboard open **Storage & databases → R2 Object Storage**
   (sometimes labeled **R2 → Overview**). Enable R2 only if you accept the
   displayed billing terms.
2. Choose **Create bucket**. Create a Standard-storage bucket named exactly
   `ea-cloud-backgrounds`. Keep public access disabled.
3. Create a second private Standard bucket named
   `ea-cloud-backgrounds-preview`, so preview uploads cannot write production
   storage.
4. The committed `wrangler.jsonc` declares binding **`BACKGROUND_IMAGES`**:
   production/default points to `ea-cloud-backgrounds`; the `preview` environment
   overrides it to `ea-cloud-backgrounds-preview`. Create those exact bucket
   names before deploying. If you choose other names, edit both corresponding
   `bucket_name` values in the configuration before deployment.
5. Open **Workers & Pages → ea-cloud-website → Settings → Bindings**. After the
   configuration is deployed, verify the R2 binding is named
   **`BACKGROUND_IMAGES`** and targets the correct bucket for each environment.
   If bindings are dashboard-managed in your account, choose **Add binding →
   R2 bucket**, enter that variable name and select the bucket. With Wrangler
   configuration as the source of truth, edit the repository configuration
   instead of overriding it only in the dashboard.
6. Under **Settings → Variables and Secrets**, retain **`BACKEND_ORIGIN`** as
   the HTTPS Render API origin without `/api`. Configure it separately for
   production and preview; a staging backend/database is recommended for preview.
7. Merge the PR and redeploy through the Pages Git integration or Wrangler,
   including Functions. Keep build command
   `pnpm --filter @workspace/ea-cloud build`, output
   `artifacts/ea-cloud/dist`, root blank, and Node 24/pnpm 10.32.1.

Dashboard labels may vary. No R2 access-key ID, secret access key, S3 endpoint,
public URL or CORS rules are needed: the native Pages binding performs storage
operations, and the browser uses same-origin requests. Do not paste cloud
credentials into the repository or frontend environment variables.
`PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` are not used by these new
R2 background routes; retain them only if another legacy integration needs them.

## Verification and troubleshooting

After deployment, sign in with an approved account, open `/admin/settings`,
select a supported image under 5 MiB and click **Save Background**. Verify POST,
PUT, profile PATCH and image GET succeed in the browser Network panel. Refresh
and confirm the background still loads. The URL must start with
`/api/storage/r2/`, not `data:` or an expiring storage signature.

- 503 naming `BACKGROUND_IMAGES`: missing R2 binding; bind and redeploy.
- 401/403: sign in again or verify the account's actual role/approval.
- 502 during upload authorization: check `BACKEND_ORIGIN` and backend health.
- 413: image exceeds 5 MiB, including the actual streamed bytes.
- 415: unsupported format or declared MIME does not match the image signature.
- Upload succeeds but profile PATCH fails: the image was stored, but its profile
  reference was not saved. Fix the API/database failure and retry; no false saved
  state is shown. Orphan cleanup is a separate administrative task, not automatic
  deletion in this feature.

Local checks:

```sh
pnpm run typecheck
pnpm build:pages
node --test scripts/tests/background-storage.test.mjs scripts/tests/pages.test.mjs
npx wrangler@4 pages functions build --outdir /tmp/ea-cloud-functions
```

Native R2 handlers and compiled Pages routing were also tested against local
Cloudflare R2 emulation. Production binding availability and live deployment
remain unverified until the dashboard setup and production checks above finish.
The existing backend session mechanism is reused; this change does not claim
to redesign or harden its legacy token format.

A Chromium end-to-end check also used the real local Node API and PostgreSQL
with compiled Pages Functions and persistent local R2 storage: upload, profile
save, image read after refresh, and reference removal all passed. Authorization
was not replaced with a client-decoded token. No production database or cloud
bucket was modified.
