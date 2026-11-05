# MT5 engine application contract

All browser routes pass the existing verified cookie session middleware. Legacy base64 identity strings alone are not credentials. App routes additionally require an approved, entitled client; mentor routes are scoped to the signed-in mentor, including for superadmin users.

| Route | Behavior |
|---|---|
| POST `/api/app/mt5-connect` | `{login,password,server}`; existing encrypted storage; verifies only a pre-provisioned DEMO client binding. Does not provision Wine, enable execution or accept a generic success page. |
| POST `/api/client/mt5/connect` | Alias of the same guarded handler; no separate legacy account write path. |
| POST `/api/app/mt5-disconnect` | Pauses copying and marks app disconnected; retains identity/ciphertext for reconciliation. Never closes broker positions. |
| GET `/api/app/engine/status` | Owned account, fresh credential-proven status, requested/permitted copier state, emergency latch, unresolved journal count, 50 retained mappings and 20 recent execution summaries. |
| GET `/api/app/mt5-health` | Same account-scoped snapshot contract, not global terminal health or stored-connected proof. |
| GET `/api/admin/engine/clients` | Up to 100 owned client summaries. |
| GET `/api/admin/engine/clients/:id` | Owned client status, mappings and recent outcomes with backend read-only credential proof; excludes other mentors' history and never returns credentials. |
| POST `/api/admin/mt5/connect` | Requires a provisioned mentor-role DEMO worker; stores sanitized source verification. Current signed-32-bit source login limit is explicit. |

`copier.requested` is the user's setting. `executionPermitted` also requires stored connection, fresh demo proof, worker permissions and no journal holds. `endToEndAcceptanceVerified` remains false. An HTTP 200 status document may truthfully report unavailable/unverified connection; it is not an executable permit. Errors use codes and sanitized messages; never raw upstream debug bodies.

Internal service contract: router authenticates its service token and pins account to loopback worker. POST `/observer/account-status` (alias `/connect-mt5`) requires broker credential proof and exact demo/server/login/role/profile/journal response. Worker route `/v1/account-status` accepts no order request. `/observer/sync-position` remains the durable absolute-target copier path and rejects mentor bindings. Simulation results cannot establish demo execution. All credential transports refuse redirects.

No user-supplied worker URL, prefix, journal, role or execution flag is accepted through these APIs. Unprovisioned accounts require the existing secure enrollment mechanism. General runtime execution remains disabled; both stop files stay active. The simulation gateway must never be configured as either production MT5 endpoint.

New connection uses advisory transactions to prevent duplicate account claims. Supported application writers must use this handler; manual SQL or old releases do not inherit its locks. Rebinding an account with retained allocations requires offline reconciliation, never deleting an allocation just to bypass the check. Disconnect is not credential erasure; use a separately reviewed retention/removal procedure after financial state is reconciled.

The strict status-only canary is documented in infra/linux/READ_ONLY_RELEASE_READINESS.md. It has no mutation/login/queue routes and accepts existing cookies without session writes.
