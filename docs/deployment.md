# EA Cloud deployment

## Architecture and routing

| Component | Responsibility | Public routes |
| --- | --- | --- |
| `artifacts/ea-cloud` | Landing site, mentor admin, superadmin and older client portal | `/`, `/admin/*`, `/superadmin/*`, `/app` and `/app/*` |
| `artifacts/ea-app` | Full client app: access, approval, activation, dashboard, MetaTrader, settings, scanner and execution feed | `/ea-app/`; tabs use application state |
| `artifacts/api-server` | Express API, uploads, WebSockets, PostgreSQL access and durable signal worker | `/api/*`, `/api/ws` |
| `lib/db` | PostgreSQL schema and Drizzle client | Backend only |
| `vps-mt5-service` | Python/MetaTrader5 execution service on Windows | Reachable from the Node backend |
| `lib/api-client-react`, `lib/api-zod`, `lib/api-spec` | Generated API hooks, validation and contracts | Built with consumers |
| `artifacts/mockup-sandbox` | Design sandbox | Excluded from production Pages build |

The failure at production commit `3974376` was a mismatch between the saved
Cloudflare command and the repository's build scripts. The saved command,
`pnpm --filter @workspace/ea-cloud build`, ran only Vite for the website.
Vite's `emptyOutDir` deleted any prior nested app output, and that command did
not rebuild/copy the client. Pages then served the website's SPA fallback at
`/ea-app/`; its router has no such route and displayed its 404.

The earlier fix added a separate combined command but did not change the
package's default build. The default package build now invokes the combined
builder too. It runs the internal `build:site` Vite step, builds the actual
`ea-app` with `/ea-app/` as its base, copies its HTML and assets into
`dist/ea-app/`, and verifies both applications before reporting success.
No new React route or redirect substitutes for the client application.

## Cloudflare Pages settings

A separate Pages project is **not required**. Use the existing
`ea-cloud-website` project and build both frontends together:

| Setting | Exact value |
| --- | --- |
| Root directory | Repository root (leave blank) |
| Build command | `pnpm --filter @workspace/ea-cloud build` |
| Build output directory | `artifacts/ea-cloud/dist` |
| Build variable `NODE_VERSION` | `24` |
| Build variable `PNPM_VERSION` | `10.32.1` |
| Runtime variable `BACKEND_ORIGIN` | Actual HTTPS backend origin, e.g. `https://your-api.example.com`; no `/api`, credentials, query or fragment |

Existing production settings (root blank, branch `main`, the command and output
above) do not need to change. `pnpm build:pages` remains an equivalent alias.
Do not deploy via `build:site` or a bare `vite build` command: those intentionally
omit the separate app. The root all-package build excludes a direct second app
build because the website build now owns that step, avoiding concurrent writes.

Install with `pnpm install --frozen-lockfile`. pnpm 10 supports the workspace's
`onlyBuiltDependencies` setting. Leave `PORT` and `BASE_PATH` unset: the build
sets `/` for the website and `/ea-app/` for the client, then copies the client's
output into the website's `dist/ea-app`. Existing artwork is reused from the
tracked website assets; no missing `attached_assets` directory is needed.

Configure `BACKEND_ORIGIN` for both production and preview, using a staging
backend/database for preview where possible. Do not point it to the Pages
website itself. Redeploy after changing settings. Database and email secrets
belong on the backend, never in frontend variables or any `VITE_*` variable.

`wrangler.jsonc` declares the output directory. Root
`functions/api/[[path]].js` proxies API paths, query strings, bearer headers,
request bodies and WebSocket upgrades. `_routes.json` invokes Functions only
for `/api/*`. Missing configuration and backend errors return JSON 503/502,
not the website HTML. API responses are not cached. The proxy never issues
tokens or authenticates users itself.

Deploy through Pages Git integration or Wrangler so Functions are included;
static drag-and-drop is insufficient. Keep Pages' default SPA fallback (no
top-level `404.html`) for admin and older portal routes. The `/ea-app/`
directory has its own entry point.

Local preview after building:

```sh
npx wrangler@4 pages dev artifacts/ea-cloud/dist
```

For a real HTTPS staging backend, put `BACKEND_ORIGIN` in an ignored
`.dev.vars` file. Without it a JSON 503 is expected. The proxy intentionally
requires HTTPS. Test an HTTP-only local Node API directly instead.

## Node backend and database

The original `.replit` file selects Node 24 and PostgreSQL 16, but does not
establish that a backend has actually been deployed. Inconsistent Replit
hostnames embedded in old links are not evidence of a working API. Mentor
webhook URLs now use the website's own origin; email links use
`PUBLIC_WEBSITE_ORIGIN`, defaulting to the current Pages website.

Deploy the API on a persistent Node 24 service/container with HTTPS,
WebSocket support and network access to PostgreSQL and the Windows MT5 host.
Static Pages cannot run it. Install the workspace from the repository root
with `pnpm install --frozen-lockfile`; build tools require dev dependencies.

Build from repository root:

```sh
pnpm --filter @workspace/api-server build
```

Start with:

```sh
pnpm --filter @workspace/api-server start
```

The start script runs `node --enable-source-maps ./dist/index.mjs` from
`artifacts/api-server`. Keep workspace runtime dependencies and externalized
packages available; the bundle is not a standalone executable. Persist the
API working-directory `uploads/` on durable disk when using local uploads.
Begin with one Node instance: the worker runs inside it and WebSocket
connections live in memory. Multi-instance hosting needs further coordination.

Configure on the **backend host** through secure environment settings:

| Variable | Requirement |
| --- | --- |
| `PORT` | Host's listening port, e.g. `8080` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Secret PostgreSQL URL for the actual production database; use provider-supported TLS |
| `SESSION_SECRET` | Strong random persistent secret, at least 16 characters; encrypts MT5 passwords and API keys. Changing it breaks decryption of existing data |
| `PUBLIC_WEBSITE_ORIGIN` | `https://ea-cloud-website.pages.dev` or the final custom domain, for email links |
| `EMAIL_ADDRESS`, `EMAIL_PASSWORD` | Optional SMTP sender and Gmail app password, supplied securely; required for notifications |
| `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | Object-storage paths; also need the compatible storage authentication runtime described below |

Provision PostgreSQL before startup. Schema management uses Drizzle push,
not committed migrations. Back up existing data and review the schema diff
before this controlled command with the backend's `DATABASE_URL`:

```sh
pnpm --filter @workspace/db push
```

Do not use `push-force` blindly on production. `/api/healthz` returns
`{"status":"ok"}` without querying PostgreSQL: also check
`GET /api/app/mentor-config`, which exercises the database, and inspect startup
logs for schema, key-backfill and signal-worker reconciliation failures.

## Admin and client authentication

Mentors use `/admin/login`; owners use `/superadmin/login`. Both call
`POST /api/auth/login`, then `GET /api/auth/me` with the returned bearer token.
Their accounts live in `users`. Client accounts live separately in
`app_access`: a mentor account is not automatically a client login.
Mentor registration starts pending and needs operator approval.

| Network response | Diagnosis |
| --- | --- |
| HTML, including HTTP 200 HTML | API request reached static SPA fallback/wrong host |
| 502/503 JSON | Backend unavailable or `BACKEND_ORIGIN` missing/incorrect |
| 500 JSON | Inspect backend and database/schema logs |
| 400 JSON | Missing email or password |
| 401 JSON | No matching account/password in that backend's database |
| 403 `pending_approval` | Account awaits approval |
| Other 403 | Account disabled, rejected, suspended or wrong portal role |
| 429 | Rate limit; wait before retrying |

The login UI now distinguishes service failures from incorrect credentials.
An authenticated owner signing in through the mentor screen is sent to the
owner dashboard. Existing approval and role checks remain in place.

API startup previously overwrote certain superadmin passwords with a value
in source code. That reset has been removed; stored credentials are preserved.
This change does not reset a live account. Do not run the old demo `seed`
script in production: it uses fixed demo credentials and updates matching rows.

To create a new owner, set `BOOTSTRAP_ADMIN_EMAIL` and a unique
`BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters securely on the backend,
then run once from repository root:

```sh
pnpm --filter @workspace/scripts bootstrap-admin
```

It creates an approved superadmin only if the email is absent, uses the current
password format, never logs passwords and never updates an existing account's
credentials/role. Remove bootstrap variables afterwards. Recover existing
accounts through a verified operator procedure, not by putting passwords in
chat, PRs, URLs or command-line arguments.

The full client app now asks for a password and uses `/api/app/login`.
The legacy `/api/app/login-by-email` URL also requires password verification;
an email alone no longer issues a token. Old accounts with unknown generated
passwords need an operator-assisted reset or a separately implemented verified
recovery flow. Approval and licence gates remain; an activated client retains
the licence state returned by login.

## Existing integration and security limitations

- The API still uses legacy SHA-256 password hashes and unsigned base64 bearer
  tokens. This deployment change does not redesign all session consumers.
  Migrate to signed, expiring sessions, server-side authorization and a modern
  password KDF before treating the trading system as production-secure.
- Object storage authentication depends on a Replit sidecar at
  `127.0.0.1:1106`. Bucket variables alone on a generic Node host are insufficient.
  Keep the backend on a compatible Replit runtime or separately adapt and test
  the storage provider before relying on profile/background uploads.
- MT5 routes currently target `http://102.214.9.67:8000`. The service requires
  Windows with MT5 installed and backend connectivity; it cannot run on Pages
  or this Linux machine. Protect that traffic with a secure private route/TLS
  and validate it separately. Trade execution was not verified here.
- SMTP delivery, storage uploads, broker connectivity and live WebSockets
  require real services and credentials. No secrets are bundled into Pages.

## Tests and deployment verification

Using Node 24 and pnpm 10.32.1 from repository root:

```sh
env -u PORT -u BASE_PATH pnpm --filter @workspace/ea-cloud build
pnpm run typecheck
pnpm --filter @workspace/api-server build
node --test scripts/tests/pages.test.mjs
```

For database integration tests, start the built Node API against a disposable
local PostgreSQL database with the schema applied. Set `DATABASE_URL` to that
local database and `API_TEST_ORIGIN` to its loopback API origin, then run:

```sh
node --test scripts/tests/auth.integration.mjs
```

Tests refuse remote URLs, create random fixture accounts/passwords and clean
up their rows. They verify password validation, not production credentials.
Local build/typechecks, proxy/error tests and database login tests passed.
Chromium against the local Pages runtime verified Get App opens the distinct
client app, images load, portal routes render, and missing backend config
produces a service error rather than "Invalid credentials".

Requests from this task to the supplied production/preview Pages URLs and
the two old Replit hostnames were blocked by the environment's egress proxy
(tunnel 403), before reaching those services. This does not establish that
they are offline or their databases are empty. Deployed login is **unverified**.
After deploying, verify the Pages-origin health and database-backed endpoints,
then sign in with an authorized account and verify `/api/auth/me` and the
correct portal. Do not claim deployed login works before those checks pass.


## Confirming the uploaded artifact

A successful combined build logs `Verified Pages output: website at / and
EA Cloud trading app at /ea-app/`. It also emits `/build-info.json` containing
the build commit (Cloudflare's `CF_PAGES_COMMIT_SHA` when provided), both HTML
entry paths, production bundle paths and HTML hashes. This is public build
metadata, without configuration values or credentials.

After deploying the new commit, check `/build-info.json` and confirm
`applications.tradingApp.entry` is `/ea-app/index.html`. Then open `/ea-app/`
and inspect the document: it must have title `EA Cloud App`, load its JavaScript
from `/ea-app/assets/`, and show the actual client access screen. The landing
HTML title is `EA Cloud`; seeing that title or its `/assets/` entry bundle at
`/ea-app/` means the wrong document was deployed or served.

The build now fails if either entry or its JS/CSS is missing, or if the client
asset URLs point to the website's `/assets/` instead of `/ea-app/assets/`.
Tests also exercise these failure cases. Local production-preview and Pages
runtime checks reproduce the original router 404 with the old command and
verify the client application after the default-build fix. Live production
verification still requires access to the newly published deployment.
