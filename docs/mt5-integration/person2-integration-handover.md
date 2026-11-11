# Person 2 → Person 1 integration handover

Base checkpoint: `4e3e115989882a467e5524fc36bec1e7153e9845`.
Branch: `feature/person2-engine-handover-20261111`.

**Person 2 code is complete for the existing guarded demo/hedging market-copying
scope, ready for hosting integration review. This is not a production-trading
acceptance or permission to connect a terminal.** Native Windows, real SDK/broker
operation, broker constraints and MT5 source compilation still require approved
acceptance. Live-money mode, netting, pending-order copying and automatic release
of recovery holds are not enabled or claimed by this handover.

## Existing flow and final corrections

Existing mentor observer/relay → signed `/api/robots/events` → authorized,
licensed follower routing/risk policy → explicit account assignment → pinned
private account router → serialized account worker → existing durable reconciler
→ real SDK adapter → execution records and owner-specific WebSocket updates.
Account status and bounded broker history are already connected to the existing
MT5 screen. No replacement UI, execution engine or distributed service was added.

This checkpoint adds signed native Windows stop-path configuration (preserving
legacy Wine/Linux behavior), optional strict/fresh native mirroring, edge
credentials on both capability and execution requests, a non-SDK process health
endpoint, WebSocket-triggered authorized status refresh/history invalidation,
strict credential-reference bootstrap validation, and case-insensitive control-
secret reference exclusion. Unavailable authorization/credential delivery now
reports session unavailable rather than an incorrect-password diagnosis.

## Application environment / secrets — supplied by Person 1

| Name | Required contract |
| --- | --- |
| `DATABASE_URL` | Private PostgreSQL connection; existing reviewed schema/migrations, sessions, account ownership, policies, signal queue, executions and allocations. No production DB was used here. |
| `SESSION_SECRET` | Existing persistent high-entropy application/session and MT5 encryption secret. Do not regenerate on redeploy or expose to frontend. |
| `PORT`, optionally `API_LISTEN_HOST` | Application HTTP listener approved by hosting. |
| `PUBLIC_WEBSITE_ORIGIN`, `AUTH_ALLOWED_ORIGINS` | Approved public origin(s), cookie/CSRF/WebSocket policy; preserve authenticated session cookies through proxy. |
| `EA_RELEASE_MODE=nontrading` | Keep set during this integration phase. Do not unset to activate execution without separate authorization. |
| `MT5_VPS_URL`, `MT5_VPS_TOKEN` | Approved private gateway origin and its `router-token`, used for account verification/history. HTTPS off-host; loopback HTTP only locally. |
| `OBSERVER_MT5_VPS_URL`, `OBSERVER_MT5_VPS_TOKEN` | Assigned execution gateway origin and matching router bearer token. Never a direct worker/legacy service. |
| `OBSERVER_MT5_ACCOUNT_ASSIGNMENTS` | JSON array of exact `{login,server,broker,gatewayOrigin}` records. `login` positive integer ≤2147483647, exact canonical broker server, supported broker ID, `gatewayOrigin` equal to execution origin; no duplicates. Must match private router receiving assignments exactly. Values come from approved inventory, not browser requests. |
| `MT5_ACCESS_REQUIRED`, `MT5_ACCESS_CLIENT_ID`, `MT5_ACCESS_CLIENT_SECRET` | If using the existing Cloudflare Access boundary, require `1` and supply both private service credentials. Both reads and execution now send these headers. Edge credentials are pinned to `MT5_VPS_URL`'s HTTPS origin; use that same approved origin for execution. Foreign origins fail before fetching. No credentials in URLs or frontend build variables. |
| `CREDENTIALS_DIRECTORY` | Native process-specific local absolute NTFS directory of private files; different worker/router directories and service identities as approved. No password values in environment or command arguments. |

Supported broker IDs: `deriv`, `exness`, `justmarkets`, `xm`, `rcg`. Labels and
seeded server lists are not identity proof; provision the exact broker identity.
Do not point any of these URLs at disabled `vps-mt5-service/main.py`.

## Windows account worker — private provisioning contract

Person 1 supplies Windows x64, compatible CPython/NumPy/official MT5 wheel, an
isolated portable demo hedging terminal, service identity, private NTFS ACLs and
persistent storage. Dependency profiles currently differ: legacy SDK 5.0.45 versus
existing Wine SDK 5.0.6231 / Python 3.13.17. Select and verify an approved native
profile; `expected_sdk_version` must match the installed package. Wine validation
is not native Windows/SDK acceptance. No package was installed or SDK invoked here.

Each worker's private directory contains:

- `account.json`: `broker`, `login`, `server`, `terminal_path`, `journal_path`,
  `account_mode` (`demo`), `role` (`mentor` or `client`), `expected_sdk_version`,
  `credential_ref`, `enabled`, `execution_approved`, `native_stop_directory`, and
  optionally `native_stop_mirror`. Unknown fields/raw embedded credentials are
  rejected. Execution flags default false. Paths/identities come from inventory.
- `gateway-id`: opaque assigned 32-lowercase-hex gateway identity;
  `api-token`: distinct account-worker bearer token, at least 32 characters;
  `credential_ref`'s file (default `broker-password`): only that account's password.
  Control filenames cannot serve as passwords, including Windows case aliases.
- `mt5-session-verifier-key`: separate 32-byte key encoded in hex;
  `mt5-session-authorization`: existing authenticated frame signed by the approved
  private issuer. Schema: protocol `ea-mt5-demo-session-v1`, scope `connect-read`
  or `connect-execute-demo`, unique 32-hex `authorization_id`, `assignment_digest`,
  `issued_ms`, `expires_ms` (future expiry, ≤1-hour lifetime). Issuer uses existing
  `real_mt5_adapter.assignment_digest(DemoAccount, gateway_id)` and
  `private_ipc.sign(payload,key)`. Issuer approval, key custody, separation from
  bearer tokens, rotation/revocation and secret export remain Person 1 decisions;
  no production issuer or secret store was invented.

Native paths must be canonical local drive paths without aliases/reparse points,
with protected private NTFS directories and existing private files accepted by
`Win32Inspector`. Pre-create the empty journal file only on **initial** approved
provisioning. Never replace, reset or delete journals, `.owner`,
`.real-sdk-binding`, `.real-sdk-hold` or associated SQLite files to recover/start.
Credentials and private artifacts must stay outside the application checkout,
public downloads, browser responses, logs and follower-visible master data.

`native_stop_directory` is required for an ordinary native host without Wine's
`Z:` mapping. It must already exist and be protected: either existing latch name
`XAUUSD.STOP` or `XAUUSD.CLEANUP_STOP` stops **all symbols**, including case aliases.
Missing/unreadable/replaced/untrusted directories remain stopped. If a mirror is
configured, it is an additional required gate: bounded JSON
`{observed_at,expires_at,stops_active}` using epoch seconds, ≤3-second freshness,
and explicit boolean false to clear. It cannot override a latch/missing directory.
Person 1 must propagate global/operator stops into **every assigned worker's**
protected paths using the approved writer/publisher. The worker never creates or
clears stops. Omitting native fields preserves the prior fixed Wine/Linux reader
and old grant digests; it does not invent a native `Z:` directory or permit SDK
access when the legacy directory is missing.

Configuration/key fingerprint/paths bind durable session identity. Choose the
approved immutable configuration before first SDK session. Scope-only changes
use a fresh explicit grant with the same approved binding. Editing execution
flags, paths or keys after claiming state is not a hot-reconfiguration mechanism;
review an offline, quiescent handover instead of deleting state. Grant expiry or
lost receipt requires fresh approval; restarts never clear existing holds.

From the reviewed checkout, native worker startup (substitute approved paths/port;
do not run without native-session authorization):

```text
python -m uvicorn demo_worker:from_environment --factory --app-dir <checkout>\vps-mt5-service --host 127.0.0.1 --port <assigned-worker-port> --no-access-log --no-server-header --log-level warning --timeout-graceful-shutdown 8
```

`from_environment` loads private metadata/authorization and acquires journal
ownership; it does not import/invoke the vendor SDK or read broker credentials.
Use authenticated `GET /livez` for process-only hosting probes. It explicitly does
not claim connection/execution readiness. **`/healthz` is an active SDK/broker
probe**, not process liveness; do not probe it before native-call approval.
SDK initialize is bounded to 15 seconds; execution has a 15-second request budget.
An already running native call cannot be safely cancelled in Python. Preserve its
intent and hold after timeout, terminate/quiesce old processes and terminal work
before ownership handover, and review history instead of retrying uncertain orders.
SDK shutdown disconnects Python IPC; it does not prove that MT5 has terminated.

## Private router and application contract

Router's separate private directory: `registry.json` with `accounts` entries
`{login,server,broker,mode:"demo",role,url,token_credential}`, `router-token`, and
one referenced worker-token file per entry. Each `url` is a distinct dedicated
`http://127.0.0.1:<worker-port>` origin. Account/endpoint/token conflicts fail
startup; no fallback or on-demand account provisioning exists. Maintain private
OS ACLs on registry/token files. Current reviewed capacity is **two workers total
per router**, not two followers plus unlimited mentors; load acceptance is needed
before lifting it.

```text
python -m uvicorn account_dispatch:from_environment --factory --app-dir <checkout>\vps-mt5-service --host 127.0.0.1 --port <assigned-router-port> --no-access-log --no-server-header --log-level warning
```

Person 1 provides private HTTPS ingress to this router, bearer/edge protection,
firewall isolation of worker ports, approved service supervision and shutdown.
Do not expose raw worker or credential/export endpoints publicly. Existing Linux
service files are templates, not configured native Windows deployment units.

| Existing interface | Contract / consumer |
| --- | --- |
| `/observer/account-status`, `/observer/account-snapshot` | Router bearer; exact account proof from backend-held encrypted credentials; fixed bound worker. Static safe errors, projected status and 24-hour/200-row history. |
| `/observer/capabilities`, `/observer/sync-position` | Router bearer + configured edge boundary; strict receiving assignments/readiness, absolute targets, durable deduplication. Ambiguity stays uncertain/non-retryable. |
| `/api/app/mt5-enrollment`, `/api/app/mt5-connect`, `/api/app/mt5-disconnect` | Existing licensed session, ownership and encrypted storage. Enrollment requests need private operator provisioning; connection verification does not enable copying. |
| `/api/app/engine/status`, `/api/app/engine/history` | Owning licensed session; request selectors cannot choose another account. Mentor status endpoints retain mentor ownership checks. |
| `/api/robots/heartbeat`, `/api/robots/events` | Existing private source package/token, exact source registration, sequence/deduplication, licensed mentor/follower and risk policies. Review source package and MetaEditor/relay compilation on approved demo terminal. |
| `/api/ws`, execution/activity REST | Preserve cookies, trusted origin and WebSocket Upgrade. Only owner-specific execution/activity notifications; UI re-reads authorized state, never infers SDK readiness from a socket success. REST remains recovery source. |

## Deployment ownership and acceptance gate

Person 1 owns account inventory/physical-account alias mapping, origins/ports,
credentials/issuer policy, runtime/service identities, ACLs, journal/stop durability,
backups, ingress, PostgreSQL migrations and hosting. Enforce **one authoritative
execution domain per physical account**; never run a copied journal, old executor
or competing independently provisioned host. SQLite/file locks only coordinate
one local domain. No cross-host exclusion mechanism is claimed.

Application WebSocket fanout is in-process and best-effort. Person 1 must account
for scheduler/WS placement when choosing replicas or accept existing REST polling
fallback; no new pub/sub infrastructure was added. Keep nontrading mode, approval
flags, stops and recovery holds active until the separately approved acceptance.

Person 2 owns any defects revealed by genuine Windows/MT5 acceptance. Still needed:
native ACL/process ownership, official SDK session/identity, source compilation,
broker fills/partial closes/stops/constraints, disconnect/restart/quiescence,
complete history and real PostgreSQL deployment acceptance. These require an
approved environment and explicit SDK/broker/order authorization. Linux mocks,
PGlite and browser fixtures below do not satisfy this gate.

Final validation/results and exact source hashes:
`evidence/engine-handover-20261111/verification.json`. No SDK import/call, real
credential, broker, real order, deployment, production config change, push or
merge occurred in this task.
