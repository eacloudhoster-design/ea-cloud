# Free backend hosting and login recovery — draft audit

Date: 3 November 2026. Base: main `aeff807` (PR #129 merged). **Review only: nothing installed on a server, merged, deployed, migrated, or changed in production.**

## Recommendation and decision gates

The existing Rackzar VPS is the closest runtime match and avoids another hosting subscription. Keep the existing Node 24 Express API, custom authentication and PostgreSQL records. Do not replace authentication with Supabase Auth. Keep both frontends on their existing Cloudflare public origin and `/api` proxy; that preserves host-only session cookies when the API host changes.

The owner confirmed **2 vCPU, 4 GB RAM, 60 GB NVMe**, Linux/Ubuntu planned, with no MT5 engine installed and no Windows VM/VPS. Two demo accounts under Wine are planned. These are owner-supplied specifications, not a remote capacity measurement. No VPS access was available.

**The draft is not approved for production cutover.** Three gates remain:

1. Resolve the database compute budget. Existing signal polling keeps PostgreSQL active. Moving the API to an always-on machine does not fix a database Free-plan quota.
2. Measure Node plus two real demo terminals and resolve the Wine execution bridge. Installing MT5 under Wine does not make the repository's Windows-only Python bridge a native Ubuntu service.
3. Confirm one production worker owner, all public callback domains, private-origin authentication, existing file storage/credentials, and rollback readiness. Never run a second production API against the shared database merely to test login: its startup starts jobs and reconciliation.

A safe immediate deliverable is this inactive VPS preparation, read-only preflight and small login/diagnostic repairs. A guaranteed indefinitely available zero-additional-cost production system cannot honestly be promised under the unverified quotas and current no-database-migration constraint.

## Current incident: what is known

The owner's previous production observation establishes Render Free sleep/wake latency as a contributor to client outages. It does not establish the reason for the current mentor login failure. No current incident-time login HTTP status, account state or private Render/Neon logs were available. This workspace has no production credentials or VPS identity. Read-only probes of Render health and Pages `/api/auth/me` were blocked by the workspace proxy (`CONNECT tunnel failed, response 403`, HTTP 000). These are **not** production 403 responses.

Mentor flow: `pages/admin/Login.tsx` → generated `useLogin` / `customFetch` → same-origin POST `/api/auth/login` → Pages proxy → Express browser-session middleware → `routes/auth.ts` → users lookup/password comparison/status check → `issueBrowserSession` → Secure HttpOnly `ea_portal_session` cookie. Returning portal sessions use GET `/api/auth/me`. Client cookies use the separate `ea_client_session` and client approval/licence policy. MT5 is not a direct prerequisite in mentor login.

Confirmed source-level gaps:

- PR #129 upgrades the client app; `contexts/AuthContext.tsx` in the portal has its own 15-second restore deadline and 60-second interval/focus retry path. It preserves already verified state on outages, but initial loading can remain pending while session checking fails. Its existing SessionNotices Retry is a separate path. No replacement of that provider is included here.
- Generated login requests had no explicit request timeout. A held POST could leave the login button pending. Mentor/superadmin now use a bounded 30-second helper, with mutation retry explicitly disabled. It never automatically replays a credential POST whose outcome may be ambiguous.
- Portal login/GetMe catches previously returned generic 500 and logged raw wrapped database errors. New sanitized `portal_auth_unavailable` diagnostics identify login/restore and known database code/category, returning infrastructure 503. Incorrect credentials remain 401; account restrictions remain 403; auth rate limits remain 429. No password comparison, account policy, session issuer or credential is changed.

### How to diagnose the next occurrence

Capture only path, HTTP status, safe error code/request ID and time; never passwords, cookies, tokens or raw SQL. Use the existing public URL and omit credentials for anonymous probes.

| Observation | Supported interpretation |
| --- | --- |
| Pages build-info wrong/missing while API healthy | Frontend build/routing/deployment mismatch needs checking |
| Pages 502/503 with API_UPSTREAM_UNREACHABLE / API_UPSTREAM_UNAVAILABLE or edge 52x | Transport/backend availability; cannot alone prove sleeping vs restarting |
| Render health 200, readiness 503 | Database path unavailable; compare sanitized code with Neon compute/connection/quota metrics |
| SESSION_STORAGE_SCHEMA_UNAVAILABLE / 42P01 / 42703 | Wrong/missing schema, not a wrong user password |
| portal_auth_unavailable, database_credentials, 28P01 | Database-role credentials problem, not mentor credentials |
| POST login 401 | The running API rejected credentials; verify the intended account/database privately |
| POST login 403 | Pending/rejected/suspended/disabled account; do not grant access to work around it |
| POST login 429 | Auth limiter: 20 attempts/15 minutes/IP; verify trusted forwarding and avoid repeated attempts |
| POST login 200, then GET auth/me 401 | Inspect cookie host/path/Secure forwarding and database session row; do not reset the password |
| Generic 500/503 only | Insufficient evidence; collect the classified event before attributing cause |

`/api/healthz` is liveness; `/api/readyz` exercises a shared database query. Neither authenticates a user. The existing `scripts/check-client-startup.mjs` helps separate these paths; private portal login must be observed by the owner, not tested here with real credentials.

## Full backend compatibility audit

| Component / source | Existing requirement | Hosting implication |
| --- | --- | --- |
| API entry/app/build | Node 24, Express 5, native HTTP server, pino transports, bundled ESM plus external dependencies | A persistent Node service is the least change. This is not Fastify. Ship the full release/dependencies, not just index.mjs |
| DB / Drizzle | pg Pool max 10, SQL transactions/row locks, database-backed sessions; PR #128 release/error fixes | Keep same DB and TLS URI initially. Stateless adapters require connection-lifetime validation; do not remove transactions |
| Passwords | Existing users/app_access use the existing salted SHA-256 scheme | Retain bytes exactly. Legacy hash hardening is separate security work; never bulk-reset or silently replace it |
| Browser sessions | Random cookie tokens, hashed rows, credential-hash binding, 30-day idle/90-day absolute expiry | Same database rows + same public cookie origin preserve valid sessions; existing expiry/revocation and explicit login/logout rules still apply. Do not rotate SESSION_SECRET; encrypted MT5/API keys depend on it |
| Mentor/client authorization | Distinct portal/client sessions, approval, licence/subscription and role checks | Keep policies and 401/403 behavior; relocating the process grants no new permissions |
| WebSocket ws.ts | Native upgrade handling, process-local connection map, session revalidation | Need a persistent single API and upgrade forwarding. Worker/Edge WebSockets exist but process-local fan-out needs redesign |
| signal-worker / copy-engine | 2-second durable SQL polling, startup reconciliation, leases and execution bookkeeping | Not a per-request serverless task. Two API instances can interfere during startup reconciliation; no global cross-host startup lease is present |
| web-push | Five-second worker, persistent event/delivery leases, VAPID secrets | Preserve keys/DB and single owner; serverless scheduling needs a separately designed durable consumer |
| Scanner/Gemini | Server-side HTTPS, 55-second provider bound, CPU image parsing, locked entitlement/credit transactions | Preserve model/key/credits; do not replay analyses or execution requests. Free CPU/RAM budgets need actual benchmarks |
| EA toolkit builder | Node worker_threads, image/ZIP generation, 30-second worker bound | Cloudflare exposes a worker_threads stub, not a drop-in thread executor; cannot move this unchanged |
| Voice | Client Kokoro assets plus optional Gemini endpoint, memory/disk WAV cache | Preserve current profile/settings; moving hosts does not fix provider quota. Disk cache retention/space needs monitoring |
| Uploads | CWD/uploads, multer disk storage; up to 10 MB files | WorkingDirectory is persistent /var/lib/ea-cloud in the draft. Existing files must be inventoried/backed up before any cutover |
| Object storage | GCS helper expects Replit sidecar at loopback:1106; Pages also has R2 bindings | Those sidecar credentials do not magically exist on Ubuntu. Verify active paths and export/access strategy; no storage rewrite or credential change here |
| Email | nodemailer/SMTP and optional email integrations | Preserve exact configured secrets; verify provider networking. No mail is sent in these tests |
| MT5 bridges | Legacy copy sender has fixed plain-HTTP Windows-service destination; scanner/observer use separate authenticated HTTPS settings | Never contact the legacy destination in this audit. Do not enable real execution until endpoints/ownership/TLS and broker receipts are verified |
| Windows bridge | vps-mt5-service imports Windows-only MetaTrader5 Python package, one terminal/global lock | Wine terminal support does not establish compatible Python bridge, two-account isolation or broker routing; this is separate implementation/testing |
| Pages proxy / CORS | HTTPS BACKEND_ORIGIN; same-origin cookies; trust proxy=1; streaming and ws forwarding | Keep frontend URLs/cookie origin unchanged. Do not switch to cross-origin fetch with wildcard CORS and assume cookies work |
| Lifecycle | Startup seed/key backfills, stale-MT5 expiry, reconciliation, job start; migration-gated package start | Existing API startup is not read-only. Use only the new preflight on production DB before approval; never run bootstrap/schema push |

## Free options, using current official documentation

### Cloudflare Workers Free

Workers now support Express through `httpServerHandler`; "Express cannot run on Workers" would be outdated. However, the existing whole backend is not a drop-in Worker. Durable jobs, native worker threads, filesystem caches, process-local ws state and lifecycle assumptions still need substantial adaptation. Workers' filesystem is virtual/temporary, not a persistent uploads disk. PostgreSQL access is possible, but must be scoped and tested for that runtime; Hyperdrive/queue/Durable Object designs have their own limits.

The documented Free limits include 100,000 requests/day, 10 ms CPU/request and 128 MB/isolate. Short auth reads may fit after adaptation, but image/ZIP/crypto and the whole module graph are unbenchmarked. Cron/queues/alarms can support redesigned jobs; they do not turn the current setInterval worker into an always-on process. Recommendation: keep the existing Pages gateway, do not rewrite the trading backend just to claim a free host.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Express support](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/), [worker_threads stub](https://developers.cloudflare.com/workers/configuration/compatibility-flags/), [virtual filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).

### Supabase Free

Useful for PostgreSQL and bounded Deno/Edge functions. Current Free pricing lists a 500 MB database, 500,000 Edge invocations/month and inactivity pausing after one week. Edge limits are 256 MB memory, 150 seconds worker lifetime and 2 seconds active CPU/request. WebSockets/background tasks do not make those function workers permanent trading daemons.

Using Supabase PostgreSQL with the current custom API could preserve custom tables/hashes after a separately approved data migration. Adopting Supabase Auth is a different project: its supported password import formats do not directly match this SHA-256 scheme, and existing custom cookies are not Supabase sessions. No Auth replacement, record migration or Supabase project setup is included. Recommendation: consider DB-only later if database size and Free limits fit, with explicit migration approval; do not use Auth migration as a login repair.

Sources: [pricing](https://supabase.com/pricing), [function limits](https://supabase.com/docs/guides/functions/limits), [password import compatibility](https://supabase.com/kb/guides/migrate-from-auth0).

### Existing Rackzar KLX2

No additional API subscription, existing runtime compatibility and no Render HTTP inactivity sleep. Still one machine/one failure domain, operator-managed security/TLS/backups, shared CPU/disk/RAM with Wine, and no demonstrated application uptime guarantee. Use one unprivileged Node process with isolated persistent data and explicit resource bounds; do not build on the same CPU while MT5 is operating.

Proposed starting budget (not measured capacity): API MemoryHigh 384 MiB / MemoryMax 512 MiB, CPUQuota 50% of **one** core (0.5 of the host's 2 vCPU). Reserve at least 768 MiB for OS/proxy and 512 MiB uncommitted headroom, leaving roughly 2.25 GiB for both Wine terminals and their supporting processes if the guest really exposes 4 GiB. Real image/ZIP concurrency may exceed the API cap; a cap protects other services by failing the API, not by guaranteeing capacity. Reject rollout if either workload misses its budget. Start with two demo terminals, not five simultaneous broker installations. Broker coverage for Deriv, Exness, JustMarkets, XM Global and RCG is not verified by an API-host change.

Separate Linux users/cgroups for API and future Wine, no shared home/credential files. Disk inventory must include OS/Wine/terminal data, release copies, uploads, logs and voice caches; do not auto-delete records/files or treat swap as a latency guarantee. The owner's purchased specification overrides potentially changing advertised plan sizes. [Rackzar Linux VPS information](https://rackzar.com/virtual-private-servers/standard-vps/); [MetaQuotes Wine installation support](https://www.metatrader5.com/en/terminal/help/start_advanced/install_linux).

### Two remaining free-tier ceilings

Neon's current published Free allocation is 100 CU-hours/project/month and scale-to-zero after five minutes. At a continuously active 0.25 CU, a 30-day month uses 180 CU-hours. The existing two-second SQL signal poll prevents inactivity while running. This is an estimate from source and published limits, not measured usage for this account. Confirm the actual plan/dashboard allowance. Do not add keep-alive requests or silently alter trading polling. A separate, approved DB-only migration or measured worker redesign may be required for a sustainable zero-fee month; local PostgreSQL also needs migration approval, backups and a new RAM/disk assessment. [Neon plans and formula](https://neon.com/docs/introduction/plans), [Free allocation example](https://neon.com/blog/neon-free-plan-1-gb-per-project).

The existing Pages Functions proxy still shares Workers Free request quotas even when the API runs on a VPS. One continuously visible five-second activity poll is 17,280 requests/day, before snapshots, session checks and other calls. Background-hidden tabs skip that poll. Measure real usage; moving Render alone does not remove this independent gateway ceiling. No polling behavior changed here.

## What this branch implements

- A 30-second, non-retrying portal login helper/hook for mentor and superadmin; unchanged form design and authentication provider.
- Sanitized portal infrastructure-failure diagnostics, preserving bad-credential/approval/rate-limit paths.
- Optional API_LISTEN_HOST; unset keeps the existing listening behavior, future VPS config binds loopback.
- Optional Pages BACKEND_PROXY_TOKEN. Incoming spoofed origin-token headers are stripped; only the configured server-side token is forwarded. Invalid configured tokens fail closed with safe configuration error. No cookie/token response leakage, command replay or URL change. Absent configuration preserves the current Render proxy behavior.
- Disabled-by-default systemd and Nginx templates. Systemd requires an approval marker and bounds crash restarts; repeated failure remains failed with journal evidence. It does not conceal persistent failure with an endless restart loop.
- Read-only host/DB preflight, which never imports API startup, workers or migrations. DB mode explicitly opens READ ONLY, checks metadata only, rolls back, closes the connection and emits only resource counts / known codes. It does not diagnose passwords or approve production capacity.

Nginx requires a private matching token before forwarding protected API paths; the committed example has **no active trusted token entry**. It strips the secret before Node and forwards only the authenticated Pages client-IP chain, preserving the single trusted hop and rate limiter. Upgrade/streaming are retained and automatic upstream POST retries disabled. Only generic health is public; readiness is available through the authorized Pages gateway. Access logging is off; error logs remain private because Nginx may include request URIs. Validate every existing EA callback/public domain reaches this gateway before enforcing it. The legacy toolkit embeds another website origin: inventory it; do not assume it is an alias of this Pages project.

## Staged deployment instructions — future approval required

**Do not execute these against production from this draft.** Each phase requires the owner's approval; no approval is implied by opening a draft PR.

### 0. Evidence and inventory

Record frontend/API deployed commits, sanitized login outcome and DB readiness; inspect Render Events and Neon usage privately. Record all public website/callback domains, existing worker state, API/DB secret names and storage paths. Confirm recoverable database/file backups. Do not change passwords, keys, subscriptions, database contents or origins. Confirm the Neon/Pages quota gates above before committing to an always-on production worker.

### 1. Approved staging preparation only

On the VPS, after separate permission to install/configure Ubuntu dependencies, verify supported Node 24 and Nginx/systemd. Record the real Node executable path; the template uses /usr/bin/node and must match. Build a pinned reviewed release on another Linux machine/CI with the workspace's existing frozen lockfile:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server build
pnpm build:pages
```

No production DB or credentials are needed to build. Transfer the full compatible Linux workspace/runtime dependencies, dist worker files and required assets as `/srv/ea-cloud/releases/REVIEWED_SHA`; keep code root-owned/read-only and point `/srv/ea-cloud/current` to it. Exclude .env files, work/, .git and private exports. Do not build/scan large images on the future MT5 CPU during trading.

Use synthetic staging accounts/DB and no production MT5 endpoints or email destinations. Run the committed local tests. After permission for host-only setup, create the ea-cloud Linux service user and `/var/lib/ea-cloud` (0700), `/etc/ea-cloud` and release directories. Run:

```sh
node /srv/ea-cloud/current/scripts/check-api-host.mjs
systemd-analyze verify /etc/systemd/system/ea-cloud-api.service
```

These are inspections, not capacity acceptance. Keep `/etc/ea-cloud/CUTOVER-APPROVED` absent and the API unit disabled. Do not run its ExecStart/index.mjs with production DB credentials in staging.

### 2. Approved staging acceptance

Profile Node idle/auth/PNG/ZIP concurrency and logs, then separately profile two demo terminals under the intended Wine setup; verify resource headroom under combined peak load. Do not submit real trades in this audit. Wine/Windows Python interoperability, terminal isolation, broker exact symbols, HTTPS bridge authentication, idempotency and authoritative execution receipts need their own approved demo test plan. The current fixed HTTP copy destination must be resolved before real execution; no remote bridge was contacted here.

Verify local uploads/voice assets and any active Replit-sidecar-dependent storage path; retain current R2 bindings. If stored local files cannot be exported from the current Free service, that is a cutover blocker, not permission to lose them. Obtain backups through an authorized method first.

### 3. Approved production cutover, only after all gates pass

1. Obtain explicit approval to merge/deploy the reviewed code and change host settings. Account for Git auto-deploy: deploy compatibility changes while Render is still the sole owner. Do not activate the new unit yet.
2. Privately copy exact existing DATABASE_URL, SESSION_SECRET, Gemini/SMTP/VAPID and any active bridge/storage settings into `/etc/ea-cloud/api.env`, root-owned 0600, never git. Do not bootstrap users, rotate secrets or run db push. Exclude old host-specific PORT, NODE_ENV, NODE_OPTIONS and API_LISTEN_HOST from that file so the unit's bounded settings apply. PUBLIC_WEBSITE_ORIGIN and AUTH_ALLOWED_ORIGINS must still match the existing browser origin(s). No secrets in VITE_*.
3. After approval for DNS/TLS, configure a dedicated HTTPS API hostname and valid certificate/key paths. Never use a self-signed certificate or disable TLS verification. Render the private Nginx config from the example, inserting one newly generated **private base64url token** (32 random bytes → 43 characters). Configure that same value as Pages BACKEND_PROXY_TOKEN only after approval; BACKEND_ORIGIN still points to Render during preparation. Never share the value or reuse SESSION_SECRET, a VAPID key or an API key for it. Protect the rendered config root-owned 0600, run `sudo nginx -t`, and reload Nginx only after review. Deny inbound 18080; expose only approved SSH/HTTPS ports. Verify loopback binding with ss.
4. Before starting Node, an approved one-off metadata check can load the private EnvironmentFile through systemd without a shell printing/sourcing secrets:

```sh
sudo systemd-run --wait --pipe --collect --uid=ea-cloud --gid=ea-cloud \
  --property=EnvironmentFile=/etc/ea-cloud/api.env \
  --working-directory=/var/lib/ea-cloud \
  /usr/bin/node /srv/ea-cloud/current/scripts/check-api-host.mjs --database
```

It checks existing metadata, not migrations or account records. Failure is a stop condition. The service ExecStartPre repeats the same check. Package `pnpm start` is deliberately not used here: it applies DDL; the required schema must already exist from the approved existing deployment.
5. Confirm no live/unknown in-flight execution outcome needs investigation. **Suspend/stop Render and disable its automatic restart/deploy path through approved controls; verify it is no longer a worker owner.** Do not merely repoint Pages while both processes are running. Existing startup reconciliation is not a safe multi-owner test harness. Preserve a private record of the old origin/settings for rollback.
6. Only now install/reload the reviewed unit and create the marker to start exactly one API (commands below). Normal startup may perform existing key/backfill/stale-account maintenance and signal reconciliation; that is not a read-only action and requires the cutover approval. Check journal lifecycle/pool logs and local health/readiness. Do not trigger order endpoints.
7. After the new API is healthy, explicitly approve changing Pages BACKEND_ORIGIN to the new HTTPS origin and redeploying the gateway configuration. Keep public frontend URLs and cookie names/paths unchanged. No split active upstreams, load balancer round-robin or automatic fallback for POSTs.
8. Verify through the original public origin: anonymous auth/me is 401, existing portal/client cookies still authorize correctly, the owner's manual login works, approvals/licences remain enforced, ws upgrades work, historical images/history load, and no secrets enter logs. Verify quote/execution safeguards without placing orders. Physical iPhone PWA reopening and production resource observation are still necessary.
9. Enable boot startup only after acceptance. Keep the bounded unit limits and monitor RSS, event-loop lag, pool waiting, disk/cache growth, Neon CU usage and Pages invocations. Do not add keep-alive traffic to avoid free-tier policies.

After the phase-3 approvals and confirmed old-worker shutdown, the activation commands are:

```sh
sudo install -m 0644 deploy/vps/ea-cloud-api.service /etc/systemd/system/ea-cloud-api.service
sudo systemctl daemon-reload
sudo touch /etc/ea-cloud/CUTOVER-APPROVED
sudo systemctl start ea-cloud-api
sudo systemctl status ea-cloud-api --no-pager
curl --fail http://127.0.0.1:18080/api/healthz
curl --fail http://127.0.0.1:18080/api/readyz
```

Run from the reviewed release; adjust the unit executable path before installation if Node is not `/usr/bin/node`. Keep journal/error logs private. These commands start existing maintenance and trading workers: do not run them during an unapproved staging experiment. After acceptance only, `sudo systemctl enable ea-cloud-api` enables boot startup. DNS, certificate provisioning, the private Nginx token/config and Pages runtime values must be reviewed on the actual host; no executable script here changes them automatically.

### Rollback

- Stop the new API and confirm it has drained before resuming the old one. Remove its approval marker/disable the unit to prevent a second owner after reboot. Investigate unknown broker outcomes; do not replay execution requests.
- With approval, resume Render as the sole worker, restore the recorded Pages BACKEND_ORIGIN and deploy gateway settings. The optional proxy token may remain while Render ignores it; do not rotate session/encryption secrets. Keep DNS/certificate records available until rollback acceptance; no automatic DNS changes.
- Keep the **same live database** and valid browser session rows. Do not restore an old DB snapshot as routine host rollback: that could erase new account/history/trade changes. Reconcile any new local files created on the VPS before restoring old uploads service; preserve both copies until reviewed.
- Validate existing cookies, roles, history and original API health. No account deletion, password resets or session-wide revocation is part of rollback.

## Verification and honest limits

Tests use only loopback endpoints, synthetic accounts and disposable PostgreSQL. They verify one POST/no replay/timeout, safe diagnostic categories, unchanged 401/403, a valid cookie and identical stored password hashes across API listener replacement sharing one DB, read-only schema inspection, proxy anti-spoofing/token redaction and existing session security. They are not a production VPS/Wine load test or a real hosting migration.

Systemd syntax was checked locally with the installed Node path substituted into a temporary unit; the proposed VPS Node path is not installed in this workspace. Nginx is unavailable here and was not installed per instructions: real `nginx -t`, TLS/domain validation and systemd activation are outstanding. No production database/records, URLs, environment variables, DNS or running services were changed. No trades, Gemini requests or real emails were sent.

### Local results

51 focused tests passed, including the PR #128/#129 recovery regressions and new host/proxy/login checks. Twenty scanner/MT5 safety tests passed. The disposable PostgreSQL listener-replacement test passed with unchanged stored password hashes and the original cookie; it also executed the read-only preflight against real PostgreSQL metadata. The existing browser login/refresh/process-restart/portal/client/outage/logout/mobile suite passed. Website/API TypeScript checks, API build and combined Pages production build passed, with the existing bundle/sourcemap warnings. No real VPS/Wine benchmark, Nginx activation, live mentor credential check or production migration was performed.

### Changed files

API: `artifacts/api-server/src/index.ts`, `routes/auth.ts`, `lib/portal-auth-diagnostics.ts`. Portal: `artifacts/ea-cloud/src/lib/portal-login.ts`, `hooks/use-portal-login.ts`, `pages/admin/Login.tsx`, `pages/superadmin/Login.tsx`. Gateway: `functions/api/[[path]].js`. Preparation: `deploy/vps/ea-cloud-api.service`, `deploy/vps/nginx-api.conf.example`, `scripts/check-api-host.mjs`. Tests: `scripts/tests/pages.test.mjs`, `portal-hosting-recovery.test.mjs`, `vps-host-preflight.test.mjs`, `vps-session-continuity.test.mjs`. This audit is the remaining file. No DB schema/session issuer, password hash implementation, trading engine or UI stylesheet changed.
