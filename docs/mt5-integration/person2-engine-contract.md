# Person 2 → Person 1: application / engine contract

Reviewed 2026-11-08. Main: `e3076477fcdf4a687a019f96f9d9a70b23801815`.
Application baseline: PR #134 `72bd2de038819dca4d6e25ec34402d1d29e45921`, which includes PR #133.
This describes checked-in implementations, not a claim that any public endpoint is deployed.
No live trading, provisioning, stop changes or execution-worker changes are authorized by this handoff.

## Transport and identities

Backend → status gateway: `MT5_VPS_URL` is an HTTPS origin (loopback HTTP allowed only locally), no URL credentials/path/query/fragment. Every request carries `Authorization: Bearer <MT5_VPS_TOKEN>` (at least 32 characters), `Content-Type: application/json`. Redirects are rejected; account reads time out after 20 seconds. Optional paired server-only `MT5_ACCESS_CLIENT_ID` / `MT5_ACCESS_CLIENT_SECRET` generate Cloudflare Access headers. `MT5_ACCESS_REQUIRED=1` requires both; partial/malformed configuration fails closed. These are separate from session secrets, robot tokens and Pages proxy tokens.

Execution transport has SEPARATE `OBSERVER_MT5_VPS_URL` / `OBSERVER_MT5_VPS_TOKEN`. Its implementation currently sends Bearer only: Access headers supported by the status transport must not be assumed supported by this transport. Execution remains gated off. Never send any of these tokens to browsers or store private identities in Git/logs.

A broker account is the exact `(login, server)` pair; broker is one of `justmarkets|exness|deriv|xm|rcg`, not a server-name heuristic. Numeric engine login must be a positive safe integer; current mentor DB connection schema additionally limits it to signed int32. Event account/ticket identifiers are digit strings, 1–20 digits, to avoid floating-point loss. Server is exact and case sensitive. Role is `mentor|client`; role alone does not establish app ownership.

App ownership comes from persistent cookie sessions and DB mappings: `users.id` → `app_access.mentor_id` → `app_access.id` → `client_settings.client_id`; licences/EA permissions are checked again before dispatch. Portal reads filter by the current mentor, including retained allocations/history. App account binding serializes same-account and same-client claims and refuses rebinding while allocations exist. Mentor account reservations use the same account advisory-lock namespace. Person 1 must give every account a separate private binding/credentials/terminal/journal; the gateway must refuse unknown identities and incorrect passwords before probing. A shared demo account is not general enrollment.

## Implemented status gateway calls

| Method/path (no `/api` prefix) | Request | Response / meaning |
| --- | --- | --- |
| `POST /observer/account-status` | `{login:number,server:string,password:string}` | Exact demo account evidence below; successful HTTP alone is insufficient |
| `POST /connect-mt5` | Same | Alias in the status-only relay; application uses account-status |
| `GET /healthz` | Bearer only | Relay `{status:"ok",read_only:true,execution_enabled:false,accounts:number}`; process health, NOT broker proof |
| `GET /observer/capabilities` | Bearer only | Read-only relay deliberately returns **503**, `{success:false,read_only:true,execution_enabled:false,persistentJournal:false,absoluteTargets:false,message:string}` |

Required account status response:

```json
{"success":true,"connected":true,"simulation":false,"account_mode":"demo","login":91,"server":"FixtureDemo","broker":"justmarkets","role":"client","execution_enabled":false,"read_only":true,"protocol":"EA_READ_ONLY_STATUS_V1","financial_routes":false,"journal_bound":false,"journal_holds":null,"emergency_stop_active":null,"open_positions":0,"pending_orders":0,"currency":"USD","balance":1000,"equity":1000}
```

Values are illustrative only. Counts must be nonnegative safe integers. Cash is finite number or projected as null; currency is three uppercase letters or null. Read-only protocol MUST return the exact false/null markers above; stop can instead be a known boolean. Unknown journal state is never zero. Non-read-only worker mode instead requires `journal_bound:true`, integer `journal_holds>=0`, boolean stop and execution flags. Execution true with a stop/holds or mentor role is rejected. Wrong login/server/broker/role, live/simulated mode, malformed JSON or transport failure cannot verify a connection. Extra upstream fields are projected out, never returned to the browser.

Relay errors currently use `{success:false,message:string}`, not stable machine codes: 401 wrong/missing service auth; 403 unknown account/password; 422 invalid account request; 503 incomplete/unavailable evidence. Financial paths return 404. App errors below are separate. A proposed gateway error-code standard requires Person 1 agreement; do not assume it exists.

## Existing application APIs (all prefixed `/api`)

These use existing HttpOnly persistent client/portal cookies, database session verification and origin/CSRF middleware. A browser-provided base64 identity hint is not authentication. Reads use no-store. Do not call writes automatically after timeout.

| Method/path | Body / response |
| --- | --- |
| `POST /app/mt5-connect` | `{login:string,server:string,password:string,broker?:string}`; exact credential-bound proof then encrypted ownership binding; `{connected:true,status:"connected",login:string,server,broker,accountName:null,balance,equity,connectedAt}` |
| `POST /app/mt5-disconnect` | No required body; `{connected:false,copyingEnabled:false,credentialsRetainedForReconciliation:true}`; pauses preference, retains credentials/mappings/history; does not close positions or stop a terminal |
| `GET /app/engine/status` | Authenticated client's own account and diagnostics, shape below |
| `GET /app/mt5-health` | `{mt5_initialized,connection,copier,observedAt}`; normal backend only, not management allowlist |
| `GET/PATCH /app/trading-controls` | Client-owned risk/preference fields (see source route); `copyingEnabled` is intent, not activation |
| `POST /admin/mt5/connect` | `{login:number,server,password,broker?:string}`; mentor-role proof, encrypted saved connection; int32 login limit |
| `GET /admin/mt5/connections` | Up to 50 owned connection records; no password/ciphertext |
| `GET /admin/mt5/status` | Fresh mentor proof or `{connected:false,verified:false,code}`; never permits execution |
| `POST /admin/mt5/disconnect` | `{id:number}`; only owned ID; marks all matching owned connection attempts disconnected; retains ciphertext/positions |
| `GET /admin/engine/clients` | Up to 100 current mentor-owned clients |
| `GET /admin/engine/clients/:id` | Owned client status; cross-owner 404 before engine probe |
| `GET/PATCH /admin/engine/clients/:id/policy` | Owned audited allocation; writes are configuration only, `executionEnabled:false` |

Policy PATCH requires `{enabled:boolean,lotMode:"fixed"|"proportional",fixedLotSize:number,allocationPercent:number,maxLotSize:number,maxExposureLots:number,maxOpenTrades:number,maxDailyDrawdown:number}`. Fixed/max lots `[0.0001,100]`, exposure `[0.0001,1000]`, fixed<=max<=exposure; allocation `[0.01,100]`, integer max trades `[1,100]`, drawdown `[0.01,25]`. Lots allow four decimals, percent/drawdown two. Extra/missing fields fail validation. Client risk limits further restrict it. No dedicated remote enable/disable endpoint exists. Never invent `/copy/start` or `/accounts/provision`.

Status response: `{clientId,observedAt,account:{login,server,broker,storedConnected}|null,connection:{code,verified,mode?,positions?,pendingOrders?,currency?},copier:{requested,state,mentorAllocationApproved,executionPermitted,unresolvedJournalHolds,emergencyStopActive,endToEndAcceptanceVerified:false},mappings:[{id,symbol,scale}],recentExecutions:[{id,signalId,status,symbol,kind,ticket,attempts,retryable,updatedAt,errorCode}],limitations:string[]}`. History limit 20, mapping limit 50. `observedAt` is APPLICATION observation time, not a broker freshness guarantee.

Connection codes: `ACCOUNT_NOT_CONFIGURED`, `ACCOUNT_DISCONNECTED`, `NOT_PROBED`, `ACCOUNT_VERIFICATION_UNAVAILABLE`, `VERIFIED_DEMO`, `VERIFIED_DEMO_READ_ONLY`. Copier states: `paused`, `disconnected`, `unverified`, `read_only`, `review_required`, `blocked`, `allocation_blocked`, `worker_permitted`. Permission is not acceptance or proof that a trade occurred.

App errors: 400 malformed input; 401 session absent/expired; 403 wrong role/origin/read-only deployment; 404 unowned/missing resource; 409 `ACCOUNT_ALREADY_BOUND` or `ACCOUNT_REBIND_REQUIRES_RECONCILIATION`; 422 `MT5_BINDING_UNVERIFIED` or `BROKER_BINDING_MISMATCH`; 503 `ENGINE_STATUS_UNAVAILABLE` / `MENTOR_VERIFICATION_UNAVAILABLE` or storage failure. Legacy routes sometimes return `{error}` without code. Session storage faults return safe 503 codes, never invalidate a valid cookie as if credentials were wrong. Proxy uses `API_BACKEND_NOT_CONFIGURED`, `API_UPSTREAM_UNREACHABLE`, `API_UPSTREAM_UNAVAILABLE`, `API_UPSTREAM_HTML`.

## Event ingestion and execution reporting

Use existing `POST /api/robots/events`, header `x-ea-robot-token: eacr_<64 lowercase hex>`; scoped/revocable credential is hashed, robot/mentor approval and source binding checked. This is not the gateway Bearer token. Strict schema (no extra properties):

```json
{"eventId":"position-100-seq-2","sourceAccount":"700","sourceServer":"FixtureSource","accountMode":"HEDGING","kind":"SNAPSHOT","entry":"SNAPSHOT","sourceMagic":"12345","sequence":2,"dealId":"0","orderId":"0","positionId":"100","symbol":"EURUSD","side":"BUY","volume":0.1,"price":1.1,"stopLoss":0,"takeProfit":0,"timestampMs":1794168000000}
```

`eventId` 1–160 `[a-zA-Z0-9:._-]`; server 1–100, symbol 1–64. `accountMode`: NETTING/HEDGING/EXCHANGE. `kind`: DEAL/POSITION/SNAPSHOT; `entry`: IN/OUT/INOUT/OUT_BY/POSITION/SNAPSHOT. Finite nonnegative prices/stops/volume (volume<=1e7); integer timestamp 2000–2099. Optional `mixed:boolean`. SNAPSHOT requires positive safe-integer sequence, magic (nonnegative signed-int64 digit string), nonzero position ID and SNAPSHOT entry. DEAL needs nonzero deal ID, positive volume and deal entry; POSITION requires POSITION entry. Full schema: `src/lib/ea-builder/contracts.ts`.

Idempotency is the database unique tuple `(mentor_id,source_account,source_server,event_id)`, NOT an Idempotency-Key header. Same parsed payload returns 200 duplicate; conflicting payload returns 409; new event returns 201. Response `{received:true,execution:boolean,eventId,duplicate:boolean,copyState:string}`. `execution:true` means signal linkage/enqueue, NOT broker fill. This branch fixes duplicate replies to retain stored copyState/execution and avoid a second worker wake. 400 invalid event; 401 revoked/missing token; 403 unapproved mentor; 409 source/magic/sequence/idempotency conflict; 429 limiter; storage failures fail closed. Retain local event queue until acknowledged. Never create a fresh event ID to bypass a conflict.

`POST /api/robots/heartbeat` uses the same token; observer body `{sourceAccount,sourceServer,sourceMagic,inventoryCount:0..10000,queueDepth:0..256,lastSequence:0..MAX_SAFE_INTEGER,historyHealthy:boolean}`. Reply `{received:true,execution:false,robotId}`. Sequence cannot move backwards. Heartbeat is not trade-event acknowledgement. Mentor event history: owned `GET /api/admin/ea-builder/robots/:id/events`; client execution reporting uses engine/status. There is NO implemented generic worker callback `/execution-status`; application stores outcomes from synchronous dispatch.

Execution-only existing contract (documented, NOT enabled): `GET /observer/capabilities` must return `{version:2,persistentJournal:true,absoluteTargets:true,simulation:false,account_mode:"demo",execution_enabled:true,emergency_stop_active:false,journal_holds:0}`. `POST /observer/sync-position` body `{login:number,password,server,sourceKey:string,revision:number,symbol,target:number,sl:number,tp:number,maxVolume:number,maxOpenTrades:number,maxExposureLots?:number,maxDailyDrawdown:number}`. Signed target is absolute exposure, zero means flat. Idempotency binds account/sourceKey/revision and journal; no ambiguous broker replay. Response success requires `{success:true,simulation:false,account_mode:"demo",data:{ticket?,retcode?},message?,uncertain?,retriable?}`. Uncertain submissions require reconciliation and must remain held. Read-only gateway rejects this path. Legacy execute/close/modify calls are non-idempotent and must not be replayed after ambiguous outcomes.

## Agreement required from Person 1 / release owners

1. Confirm exact status origin, private authentication provisioning and supported demo role/account bindings. General independent enrollment is absent; define a separately reviewed provisioning lifecycle before claiming it works.
2. Agree on broker observation timestamps/max-age and stable gateway error codes. Current app poll bounds UI age but cannot prove freshness of upstream cached evidence.
3. Confirm whether a later execution origin needs Cloudflare Access authentication; current observer transport does not implement it. Do not reuse a status-only endpoint as execution service.
4. Confirm durable journal/revision, uncertain-submission and reconciliation semantics against actual demo workers before any separate execution acceptance. No callback endpoint or remote stop/control API is assumed.
5. Retain separate account credentials/ports/journals and both existing emergency stops. Do not expose worker SDK routes publicly. No automatic role reassignment or shared account substitution.
6. Deployment owners must resolve the management entry's loopback binding, health/start configuration, proxy enforcement and original DB/SESSION_SECRET compatibility. This sprint neither provisions infrastructure nor deploys.
