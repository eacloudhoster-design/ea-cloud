# EA Cloud on Cloudflare Pages

See [the deployment guide](../../docs/deployment.md) for frontend, API,
database, authentication and infrastructure setup.

Build from the repository root using Node 24 and pnpm 10.32.1:

```sh
pnpm install --frozen-lockfile
pnpm build:pages
```

Pages output: **`artifacts/ea-cloud/dist`**. This includes the actual separate
client application at `/ea-app/`. The earlier website-only build command does
not include that application.

Set Pages build variables `NODE_VERSION=24` and `PNPM_VERSION=10.32.1`.
Neither `PORT` nor `BASE_PATH` is needed. Set Pages runtime `BACKEND_ORIGIN` to
the separately deployed HTTPS API origin (without `/api`), for production and
preview. Root `functions/` proxies `/api/*` and WebSockets. Deploy with the Git
integration or Wrangler so Functions are included; static drag-and-drop alone
is insufficient.

Local validation:

```sh
env -u PORT -u BASE_PATH pnpm build:pages
pnpm run typecheck
node --test scripts/tests/pages.test.mjs
npx wrangler@4 pages dev artifacts/ea-cloud/dist
```

With no backend configured, the API returns a JSON service-unavailable error.
A successful build does not establish working production login or trading.
