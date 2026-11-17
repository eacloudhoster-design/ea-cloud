# Hosted connection diagnosis and exact operator pages

Observed2026-11-17 16:23:58UTC. No security policy, DNS record, credential, hosted deployment or broker trading setting was changed. This is not successful hosted acceptance.

## Verified findings

* `eacloudhoster.online` resolves to Cloudflare IPv4/IPv6, with Cloudflare authoritative nameservers. A default trusted TLS connection verifies hostname/certificate and negotiates TLS1.3; the Google Trust Services certificate expires2027-01-26. There is no observed public DNS/TLS fault to repair. The status/gateway hostnames are still unknown, so their individual DNS/TLS state cannot be verified.
* Python's default client received403 with `error code:1010`, Ray `a5c015426d718c8b-JNB`. Cloudflare documents1010 as browser-signature rejection associated with Browser Integrity Check. This does not identify a particular custom rule or prove invalid Access credentials.
* An honest `EACloudEngineDiagnostics/1.0` User-Agent with JSON Accept received429, Ray `a5c015430f7a73d4-JNB`. This is a distinct response and is not successful connectivity. The rate-limit source (edge versus forwarded origin) needs the matching security/origin logs; a Cloudflare Ray header alone cannot distinguish them. No additional public requests were sent after this rate-limit observation.
* Local status8005 and gateway8004 both return200 with their own Bearer credentials and401 without. Gateway reports six standbys, zero owned accounts. This proves local authentication, not the Render-to-Access-to-tunnel path.
* The existing connector is active with four edge connections, zero proxied requests and zero origin proxy errors in its current metrics. Its tunnel ID is `e6a25dc1-d10a-4881-9e13-a34f519c3489`. A connector token authorizes that connector; it is not a Cloudflare dashboard/API management token. Zero requests on this connector does not exclude another connector or another deployed upstream.
* Plugin discovery lists Render installed/enabled, but no Render operations are exposed in the available callable tool set. No Cloudflare plugin result or browser/dashboard tools are exposed. No Render/Cloudflare API environment binding, provider CLI/login configuration or Cloudflare account certificate was found. The Render runtime/service environment, Access policies, rules and actual Pages bindings therefore remain uninspected; they were not assumed absent or misconfigured.

## Safe code repairs in PR138

MT5 status/observer transports now identify themselves as `EACloudMT5Gateway/1.0` and request JSON, rather than depending on generic HTTP-library headers. This is an explicit service identifier, not a browser impersonation, policy exception or security bypass. It does not replace Access, Bearer or original-user authentication. The connectivity probe uses its own explicit diagnostic identifier.

The GET-only probe now distinguishes1010,429,401/403 and unexpected statuses, retains validated Ray IDs/numeric Retry-After and suppresses raw upstream bodies/credentials. After1010/429 it skips further requests to the same origin, with no automatic retry. It still requires exact healthy JSON contracts and does not count an edge response as backend success. Five focused probe/startup/transport tests passed. Hosted deployment of these changes is still pending authorized service access.

## Dashboard steps, in dependency order

### 1. Locate the actual deny/rate rule; do not disable protection

Cloudflare dashboard → select `eacloudhoster.online` → **Security → Analytics → Events** (Security Events). Set the UTC window around2026-11-17 16:23:58 and filter **Ray ID**:

* `a5c015426d718c8b` for the1010 request.
* `a5c015430f7a73d4` for the429 request.

Inspect **Service**, **Action**, matched **Rule ID**, hostname and path `/api/healthz`. If the event is not sampled into Security Events, use **Observability → Logs**/Log Explorer where available and the same Ray ID. Absence of an event is not evidence no Cloudflare action happened.

The relevant controls are **Security → Settings → Browser Integrity Check**, and **Security → Security rules → Rate limiting rules** for a matching rate rule. Leave protections enabled. No specific rule change can be justified until its matching event/configuration is read. Do not add an IP/Everyone bypass, impersonate browser headers, disable BIC/WAF, increase rate limits blindly or remove Access. If the explicit service client is still rejected under the approved policy, obtain operator review of the authenticated machine-to-machine route; the diagnostic cannot grant itself an exception.

### 2. Verify existing tunnel routes and service identities

Cloudflare dashboard → **Networking → Tunnels** → choose tunnel ID `e6a25dc1-d10a-4881-9e13-a34f519c3489` → **Routes → Published application**. Inspect or edit only the approved status/gateway routes:

| Route | Service field |
| --- | --- |
| Approved status HTTPS hostname | `http://127.0.0.1:8005` |
| Approved gateway HTTPS hostname | `http://127.0.0.1:8004` |

Use the exact path allowlists in HOSTED_CONNECTION_RUNBOOK_20261117.md and terminal404 fallback. Preserve the website/apex/Pages route, per-account port isolation and root provisioner10040 isolation. Do not invent a hostname. In the zone's **DNS → Records**, the approved tunnel hostname must refer to this tunnel (normally proxied CNAME `e6a25dc1-d10a-4881-9e13-a34f519c3489.cfargotunnel.com`); verify the deployed route before changing records. No public website DNS/TLS change is indicated by these results.

Cloudflare Zero Trust → **Access controls → Applications** → select each status/gateway self-hosted application → **Policies**. The intended machine policy has **Action: Service Auth**, **Include: Service Token**, selecting only the corresponding Render service identity. Avoid Everyone, Any Service Token and Bypass. Its hostname/path coverage must include every admitted endpoint. Keep the engine's separate `Authorization: Bearer` header intact; Access must accept its normal `CF-Access-Client-Id`/`CF-Access-Client-Secret` pair rather than consuming Authorization as its single-header service-token field.

For token existence/expiry, Zero Trust → **Access controls → Service credentials → Service Tokens**. Use the exact approved status and gateway identities in Render, separately. Do not rotate existing credentials just to diagnose1010. Check failed service-token authentication in the Access authentication logs;1010 alone is not such a log.

### 3. Verify the Pages proxy split

Cloudflare → **Workers & Pages** → the existing EA Cloud Pages project (repository config name `ea-cloud-website`; verify the actual selected project) → **Settings → Variables and Secrets → Production**:

* `BACKEND_ORIGIN`: existing actual Render API HTTPS origin, without `/api` or a path. Preserve the original app/API relationship.
* `BACKEND_PROXY_TOKEN`: preserve the secret matching that backend's optional `EA_API_ORIGIN_TOKEN`.
* If the isolated MT5-management split is in use, `MT5_MANAGEMENT_ORIGIN`: approved private management HTTPS origin targeting8006; `MT5_MANAGEMENT_PROXY_TOKEN`: secret matching `/etc/ea-cloud/management-api/origin-token`.

These are server runtime bindings, not VITE variables. Do not repoint the whole backend to the management-only API. Current Pages proxy code does not inject Access service-token headers to the management origin; if that route requires them, an explicitly reviewed proxy transport integration is required. Render's observer credentials do not configure Pages automatically.

### 4. Verify/deploy the existing Render backend

Render dashboard → select the existing EA Cloud API web service (historical runbook name `ea-cloud-api`; confirm repository `eacloudhoster-design/ea-cloud` and current service URL).

* **Settings → Build & Deploy**: confirm the reviewed integration is actually in the deployed revision. PR138 is draft/unmerged; environment settings cannot add its missing code. Preserve the existing dependency-install build prerequisites, then build with `pnpm --filter @workspace/api-server run build`. Set **Start Command** to `pnpm --filter @workspace/api-server run start:engine-source` only with the complete external-consumer profile.
* **Environment**: preserve original `DATABASE_URL`/`SESSION_SECRET`; apply the exact runbook table. In particular, `EA_MT5_MANAGEMENT_ONLY=0`, `EA_SIGNAL_WORKER_MODE=external`, `MT5_PROVISIONING_CONSUMER=0`, `OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE=gateway`, and separate real status/gateway HTTPS origins, Bearer secrets and Access credential pairs. Unset the two static assignment variables and `EA_RELEASE_MODE`. Never set VPS loopback URLs on Render.
* **Shell**: run `pnpm --filter @workspace/api-server run check:engine-connectivity`. This uses existing environment values without printing secrets. Expected: exit0, both authenticated health contracts200, assignment/session metadata200 and edge-authenticated requests without Bearer401. Zero active receiving sessions still means no execution acceptance.
* **Logs**: inspect sanitized diagnostic check codes and lifecycle mode. For429 respect Retry-After and inspect its matching rule; do not repeatedly rerun the probe. No schema push, admin bootstrap, session rotation or broker order is part of this procedure.

## Remaining production blockers

No authenticated hosted-to-VPS transport has been verified. Actual provider settings/hostnames remain unavailable. PR138 is not deployed to the hosted API. Original-owner bindings and active receiving sessions are zero. Per-account approved risk/symbol/source policies and explicit execution sessions remain prerequisites. Existing external-alert destination, offsite recovery, low disk headroom and whole-host reboot acceptance also remain outstanding. Broker order execution is unverified and no orders were submitted.

## Official references checked

* [Cloudflare1010](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)
* [Security Events](https://developers.cloudflare.com/waf/analytics/security-events/)
* [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
* [Tunnel routes](https://developers.cloudflare.com/cloudflare-one/networks/routes/add-routes/)
* [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)
* [Render environment](https://render.com/docs/configure-environment-variables)
