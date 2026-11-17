# Connect the existing hosted application to this VPS

Inspected 2026-11-17. This supplements the completed engine runbook; it does not authorize execution. No frontend change, new owner record, session fabrication, stop removal or order is required. Existing private API/gateway/provisioner and tunnel services are active. The original ownership audit has zero account associations; six managed demo accounts await their original owners. An active tunnel process does not establish a verified hostname or Access policy.

## Minimum original-owner action

The actual owner logs into the existing application. Client identity uses `ea_client_session`; mentor identity uses `ea_portal_session`. Preserve the original `DATABASE_URL` and `SESSION_SECRET`: the latter also protects stored broker passwords. An arbitrary user ID, legacy bearer identity hint, VPS alias or broker password alone cannot authorize ownership.

Use existing Connect if the hosted backend already supports it. Otherwise, without deploying the frontend, the owner supplies their existing Cookie header through an approved private channel into `/run/private-original-owner-cookie` on this VPS. Store only the Cookie header value, not the literal `Cookie:` prefix; root-owned regular file, mode0600. Never paste it into chat, Git, shell arguments or logs. The owner must actually own the selected broker account. Use one alias and its corresponding owner's session at a time:

```sh
CURRENT=/opt/ea-cloud/releases/engine-api-9aff0426c5e1
chmod 600 /run/private-original-owner-cookie
chown root:root /run/private-original-owner-cookie
python3 "$CURRENT/infra/linux/enroll-authenticated-account.py" \
  --alias ACCOUNT_ALIAS --session-cookie-file /run/private-original-owner-cookie --check-only
python3 "$CURRENT/infra/linux/enroll-authenticated-account.py" \
  --alias ACCOUNT_ALIAS --session-cookie-file /run/private-original-owner-cookie --confirm-account-owner
/opt/ea-cloud/infra/linux/.venv/bin/python \
  "$CURRENT/infra/provisioning/engine-enrollment.py" --consume-owned-inventory
rm -f /run/private-original-owner-cookie
```

Aliases: `jm-demo` requires its original mentor session; `jm-client-demo`, `deriv-demo`, `xm-demo`, `exness-demo`, `rcg-demo` require their original client sessions. This is role information, not a claim about which user owns them. The helper authenticates before decrypting broker credentials and verifies broker identity before linking. Successful binding creates owned standby state; it does not enable execution. The timer subsequently maintains ownership automatically.

For a new terminal, authenticated POST `/api/app/mt5-provisioning/requests` (client) or `/api/admin/mt5-provisioning/requests` (mentor), using a JSON body with `requestKey` (stable UUID), `broker` (`deriv|exness|justmarkets|xm|rcg`), `login` (decimal string), exact `server`, `password`, `accountRole` (`follower` client, `master` mentor), `accountMode` (`demo|live`), `ownershipConfirmed:true`. Poll GET the same collection until `awaiting_verification`; do not replay uncertain outcomes with new keys. Then POST the account route below. Capacity admission reflects actual host resources; it is not an account quota.

Account API base: `/api/app/mt5-accounts` or `/api/admin/mt5-accounts`. GET lists the authenticated owner's accounts. POST links with `{login,server,password,broker?}`; no owner-ID parameter. GET `/:id/status`; POST `/:id/select`; POST `/:id/disconnect`. Mutations require `Origin: https://eacloudhoster.online` and the genuine session cookie. Selection does not authorize execution.

## Hosted backend environment (Render)

Apply these to the existing API service, never the frontend build. Use the current accepted backend plus completed integration changes, not the historical whole repository. The local management build uses accepted base `7d68249aa149513fa71dbda31bd0eb40ee911aa2` and recorded overlays; its management-only launcher is NOT the hosted entry. Hosted entry is `artifacts/api-server/dist/index.mjs`. On this integration branch, set Render Start Command to `pnpm --filter @workspace/api-server run start:engine-source`; this validates the external-consumer profile before loading that entry. Keep the default management start command unchanged. Build Command remains `pnpm --filter @workspace/api-server run build` after the existing workspace dependency installation. Environment alone cannot add missing compiled routes or external-consumer behavior to an older deployment.

| Setting | Required value / secret source |
| --- | --- |
| `DATABASE_URL`, `SESSION_SECRET` | Preserve original values; same original database/key as VPS |
| `PUBLIC_WEBSITE_ORIGIN` | `https://eacloudhoster.online` |
| `AUTH_ALLOWED_ORIGINS` | Preserve approved origins; include `https://eacloudhoster.online` |
| `EA_MT5_MANAGEMENT_ONLY` | `0` |
| `EA_SIGNAL_WORKER_MODE` | `external` (VPS owns financial queue consumption) |
| `EA_RELEASE_MODE` | Unset for the hosted source-ingestion backend; VPS remains nontrading |
| `COPY_ENGINE_MULTI_ACCOUNT` | `1` |
| `MT5_ACCOUNT_INVENTORY` | `1` |
| `MT5_SELF_SERVICE_PROVISIONING` | `1` |
| `MT5_PROVISIONING_CONSUMER` | `0` (VPS private API already consumes this shared database queue) |
| `MT5_LIVE_READONLY_ACCOUNTS` | `1` (connection management only; no execution permission) |
| `MT5_VPS_URL` | Approved HTTPS status origin, no path; **hostname not verified/available** |
| `MT5_VPS_TOKEN` | Securely transfer `/etc/ea-cloud/readonly-relay/relay-token` |
| `MT5_ACCESS_REQUIRED` | `1` |
| `MT5_ACCESS_CLIENT_ID`, `MT5_ACCESS_CLIENT_SECRET` | Cloudflare service identity authorized only for the status origin |
| `OBSERVER_MT5_VPS_URL` | Approved HTTPS gateway origin, no path; **hostname not verified/available** |
| `OBSERVER_MT5_VPS_TOKEN` | Securely transfer `/etc/ea-cloud/engine-router/router-token` |
| `OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE` | `gateway` |
| `OBSERVER_MT5_ACCESS_CLIENT_ID`, `OBSERVER_MT5_ACCESS_CLIENT_SECRET` | Complete separate pair authorized for the gateway origin |

Unset `OBSERVER_MT5_ACCOUNT_ASSIGNMENTS` and `OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_FILE` on Render. Never use VPS loopback URLs or `/run` files from Render. Do not configure `MT5_PROVISIONER_URL/TOKEN` on Render in this profile: the private VPS consumer uses `http://127.0.0.1:10040` and its own credential. Do not run a second provisioner consumer.

The VPS origin on port8006 additionally requires `x-ea-cloud-origin-token`, supplied by a trusted proxy/server from `/etc/ea-cloud/management-api/origin-token`. That header does NOT authenticate an owner. `EA_API_ORIGIN_TOKEN` on a hosted API is optional in code, but if configured every non-health request needs the matching trusted proxy injection. Preserve the existing hosted origin-auth arrangement; never enable this flag without configuring its upstream or send the token in browser JavaScript. Cookie authentication and trusted-Origin checks remain required independently. This is separate from the Bearer and Cloudflare Access transport credentials above.

## Cloudflare ingress and authentication

An authorized Cloudflare operator must verify the existing remotely managed tunnel configuration and approved hostnames. No approved concrete status/gateway hostname or policy was recoverable from local configuration. Do not invent DNS records or assume the status-only example is an execution ingress.

* Status origin: Access Service Auth restricted to the exact Render status service identity; route `^/(healthz|observer/capabilities|observer/account-status|connect-mt5)/?$` to `http://127.0.0.1:8005`.
* Gateway origin: separate Access Service Auth policy restricted to the Render gateway service identity; route `^/(healthz|observer/(assignments|receiving-sessions|workers|account-status|account-capabilities|size-position|sync-position|sync-pending|account-snapshot))/?$` to `http://127.0.0.1:8004`.
* End ingress in `http_status:404`; keep all origins loopback. Never expose per-account ports,10040, or an unrestricted origin. Access policy must cover every admitted path; no Everyone/Bypass policy. Each application also requires its independent Bearer credential.

Gateway financial paths remain denied without actual ownership, approved risk policy, emergency-stop clearance and a bounded explicitly authorized execution session. Adding ingress grants none of those permissions.

The current readonly relay does not implement `/observer/account-snapshot`; do not add that path to status ingress or describe snapshot support as verified. Any hosted feature relying on that optional status route needs separate compatibility work; Connect uses `/observer/account-status` and remains the enrollment path.

## Nontransactional acceptance

```sh
systemctl is-active ea-engine-management ea-engine-gateway ea-readonly-account-relay \
  ea-private-provisioner ea-engine-enrollment.timer ea-mt5-status-tunnel
systemctl --failed --no-legend
curl --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8004/healthz
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  http://127.0.0.1:8006/api/app/mt5-accounts
```

Both unauthenticated requests should return401; even gateway health requires its Bearer credential. Authenticated loopback gateway health and assignment discovery returned200 during inspection. After external settings are applied, verify authenticated GET `/observer/assignments` from the actual Render runtime using server-side secrets without printing them, unauthenticated denial at both origins, original-owner GET account list and successful Connect. Do not POST financial gateway routes as a connectivity test. No full test suite or financial execution is needed for these checks.

Missing manual inputs are: (1) each actual owner's session/Connect action, (2) authorized Render API service access and accepted backend deployment, (3) authorized Cloudflare hostname/Access/ingress bindings and service identities. Existing GitHub access and the running connector do not supply Render or Cloudflare management authority. No repeated VPS installation is required.
