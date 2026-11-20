# Actual account-connection failure and application contract fixes

## Confirmed production failure

Render logs for ea-cloud-api show the Connect attempt at **20 November 2026 20:12:13 SAST (18:12:13 UTC)**:

- POST /api/app/mt5-connect received.
- `MT5_GATEWAY_NOT_CONFIGURED`, phase `account_connection`.
- HTTP 503 returned immediately.

At deployed main c98bacdcdc3013e82f936205eddf4b88b83c07a4 this code is raised while validating local Render transport configuration, before `fetch` to the VPS. The corresponding route response is `{ "error": "Account connection was not verified", "code": "MT5_GATEWAY_NOT_CONFIGURED" }`; the customer screen correctly maps it to its existing service-unavailable message. This attempt provides no broker-password, server-admission or worker-authentication result. It did not reach the queue/binding writes or the VPS.

The existing validator checks the remote MT5_VPS_URL, MT5_VPS_TOKEN, and optional/required MT5_ACCESS_REQUIRED + MT5_ACCESS_CLIENT_ID + MT5_ACCESS_CLIENT_SECRET. The current log does not identify which setting failed. Available Render tools do not expose a read-only environment-variable listing; no Render API key/private VPS access/customer session was available. No production secrets were read, printed, replaced or guessed. New private logs distinguish fixed setting-name issues without values. Hosted loopback addresses are rejected instead of contacting the Render container itself.

The same logs show authenticated request-list HTTP 503 responses at 18:07 and 18:11 UTC, with capability GETs returning 200. Those request statuses alone cannot distinguish a disabled submission flag from unavailable queue storage. No accessible Render-hosted Postgres instance was discovered; production schema/data and queue flags remain unverified. No migration or database reset was attempted.

## Implemented, without changing the interface

- Preserve submitted customer login strings, including leading zeros, in the form-to-API contract, owned queue, profile, API response and status restoration. Keep exact string comparisons in the browser.
- The existing SDK/relay contract uses numeric MT5 identities. Convert only at that private boundary, verify exact numeric/server/owner evidence, and keep the submitted representation in application records. The existing provisioner accepts canonical digit strings; its adapter uses that format while request ID retains correlation to the original owned queue row.
- Canonicalize only physical-account locks/ownership comparisons and duplicate-request checks, preventing `91` and `00091` from acquiring separate account authority. No schema rewrite or existing data migration.
- Add optional, independently scoped Cloudflare Access service headers to the existing provisioning POST and status GETs. Credentials remain distinct from the status gateway token. No redirect following, credential retransmission during polls, uncertain retries or trading activation.
- Reject new assignment acceptance if the existing provisioning transport is unconfigured, instead of storing an intent the consumer cannot dispatch. Existing flags and authorization gates remain required.
- Log fixed configuration issue names privately; remove account login/server/balance from connection-success logs. Customer messages, layout, CSS, assets and navigation are unchanged. Engine/Wine/VPS files are untouched.

## Exact existing runtime contract / handover

| Hop | Existing endpoint and authentication | Required review/action; not applied |
| --- | --- | --- |
| Render → account relay | MT5_VPS_URL + POST /observer/account-status; Authorization: Bearer MT5_VPS_TOKEN; CF-Access-Client-Id/Secret from MT5_ACCESS_CLIENT_ID/SECRET when required | Person 1 must inspect the existing Render values and reuse the approved relay token/Access service token. The previously intended hostname is mt5-gateway.eacloudhoster.online, forwarding through the existing tunnel to 127.0.0.1:8005; current routing was not verified. No replacement credentials/tunnel should be created. |
| Render → private provisioner | MT5_PROVISIONER_URL + POST /v1/provision; GET /v1/provision/{requestId}; Bearer MT5_PROVISIONER_TOKEN | Existing service URL/token and MT5_SELF_SERVICE_PROVISIONING / MT5_PROVISIONING_CONSUMER approvals must be verified. If that URL is Access-protected, use MT5_PROVISIONER_ACCESS_REQUIRED=1 and the approved MT5_PROVISIONER_ACCESS_CLIENT_ID/SECRET with this adapter. Never reuse an unrelated token or bypass Access. |
| Existing VPS provisioner/terminal | Existing private-service and dedicated-worker-driver contracts | Only if this hop subsequently rejects: operator checks the configured tokenFile and existing /etc/ea-cloud/private-provisioner/worker-driver.json. An eligible unused slot must have broker `justmarkets` and contain the customer's exact server in `slots[].servers`. Preserve both stop files, admission/ownership controls, credential permissions and held allocations. Do not reinstall or enable orders. |
| Connection proof | Private relay → existing account-bound terminal snapshot | Account login/server/mode/owner and real non-simulation response must match before binding or displaying connected. Request acceptance or worker-prepared status alone is insufficient. |

No Person 2 defect or configuration change is established by the observed failure: the first failed hop is still inside Render, before contacting Person 2. The per-account assignment/server acceptance and private service reachability remain UNKNOWN, not assumed broken or complete. Actual demo account verification has not been performed. The failed attempt's password is not recoverable from logs and was not queued by that route; any later retry must use the existing secure app after the configuration is reviewed, never a password supplied through chat.

## Focused validation

- Existing engine-integration and mt5-engine-client suites: **6 passed, 0 failed**. Covers exact leading-zero round trips/persistence, padded-alias ownership rejection, queue identity, worker proof, missing transport without queue insertion, authorization/safety checks, and configuration issue names without secrets.
- Existing test-provisioner-port.cjs: passed with mocked HTTP, including both-hop Access headers, missing/partial auth rejection, canonical numeric bridge, GETs without passwords and no uncertain replay.
- Existing MT5 browser harness customer mode: **3 scenarios passed** at 390×844, 320×740 and 1280×900, now using `00091`; pending restoration, fresh proof, account type, disconnect and unchanged customer copy. Offline fixtures only.
- API/app TypeScript, production builds and whitespace checks passed. App built at /ea-app/ with unchanged public assets linked locally to avoid duplication; existing bundle-size warning remains.

Raw local evidence: /workspace/work/mt5-contract-20261120/. Review branch only; automatic preview builds suppressed. No merge, deployment, production secret/configuration change, SDK call, broker connection or order was performed.
