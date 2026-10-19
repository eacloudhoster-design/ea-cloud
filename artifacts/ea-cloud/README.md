# Cloudflare Pages

Build from the repository root so pnpm can resolve the workspace packages.

| Setting | Value |
| --- | --- |
| Root directory | Repository root (leave blank) |
| Build command | `pnpm --filter @workspace/ea-cloud build` |
| Build output directory | `artifacts/ea-cloud/dist` |
| `NODE_VERSION` | `24` |
| `PNPM_VERSION` | `10.32.1` |

Install dependencies with `pnpm install --frozen-lockfile`. Use pnpm 10, which
supports the workspace's `onlyBuiltDependencies` configuration.

Neither `BASE_PATH` nor `PORT` is required for the production build. The base
defaults to `/`; local Vite development and preview servers default to port
5173. Existing environment overrides remain supported.

The website uses the tracked `public/ea-cloud-logo.jpeg` through
`src/lib/branding.ts`. No external `attached_assets` directory is needed for
this application. Vite copies public assets into `dist` during the build.

Cloudflare Pages serves client-side routes through its default SPA fallback
when there is no top-level `404.html`. Keep that behavior for portal and login
routes.

Pages hosts the static frontend. The Express API, PostgreSQL, uploads, and
WebSocket service must continue to run on their backend host. Route `/api/*`
(including WebSockets) on the website's origin to that backend; the frontend
keeps its existing relative API URLs. A successful static build does not
deploy or validate the backend integration.

To verify locally from the repository root:

```sh
env -u BASE_PATH -u PORT pnpm --filter @workspace/ea-cloud build
pnpm --filter @workspace/ea-cloud typecheck
pnpm --filter @workspace/ea-cloud serve
```
