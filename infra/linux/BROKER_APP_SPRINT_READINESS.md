# MT5 broker and app integration sprint

Continues merged PR #132 and the read-only relay in draft PR #133. Existing primary checkout/index, working JustMarkets accounts, financial acceptance artifacts, both emergency stops and production data are preserved. This sprint authorizes verified non-trading deployment; it does not authorize broker orders or PR merges.

## Broker evidence

| Broker | Verified result |
| --- | --- |
| JustMarkets | Prior two-account demo acceptance reused. No connection/copy acceptance repeated. Existing terminal PIDs unchanged during relay rollout. |
| Deriv | Actual Windows SDK verifies exact authorized login/server, DEMO mode, connection, portable paths and market data. Initialization/shutdown and terminal restart acceptance pass; AutoTrading remains off. |
| XM Global | Actual Windows SDK verifies exact authorized login/server, DEMO mode, connection, portable paths and market data. Terminal/API restart and SDK reconnection pass; AutoTrading remains off. |
| Exness | Exact supplied combination rejected by broker as `Invalid account`; SDK -6. New failed instance stopped, private bundle retained. No successful authentication claimed. |
| RCG Markets | Broker discovered through MT5's own company catalogue. Exact supplied combination rejected as `Invalid account`. Initial SDK -10005 preceded catalogue resolution; no authenticated DEMO proof exists. New failed instance stopped, private bundle retained. |

All four new bindings were enrolled under separate root-only bundles, users, prefixes, data directories, displays and ports. Existing official executable hashes match across prepared terminals; the verified binary was reused without a new installer or third-party download. Catalogue search, not another identical IPC retry, enabled XM server bootstrap. The proprietary IPC readiness condition is not decoded; native title/login text alone was deliberately not accepted as authentication evidence.

The new per-account launcher keeps the service alive during MT5's child-process live-update handover. It sends systemd READY only after a native terminal process appears, so the SDK cannot race Wine bootstrap into the wrong service group. A 300 MiB SDK-group OOM discovered during pinning is addressed with a bounded 600 MiB limit on the two new adapters; original service limits are unchanged. Only new account units use it. Linux reads LoadCredential in its own namespace; the private bootstrap remains mode 0600 in the account's private home. No password is passed in argv/environment or arbitrary vendor output logged. No strategy/EA was enabled.

## Implemented app/backend changes

- Client broker selection covers all five profiles, exact server and login entry, protected password entry, cancel, reconnect and disconnect. The existing glass/red presentation now has backend-gated “Connecting to MT5…”, “Connected Successfully”, “MT5 Account Connected” and green/red indicators. Newly added broker names use explicit text rather than fabricated logos.
- Saved-account restoration reads the owned engine status. Logical disconnect remains disconnected after refresh while retaining encrypted credentials/mappings for reconciliation; it does not silently close positions or terminate the retained terminal.
- Trading controls and mentor connection routes use real browser sessions instead of forgeable base64 identity hints. Broker mismatch is rejected after exact credential proof. Source credentials are AES-GCM encrypted using the existing unchanged SESSION_SECRET mechanism; no ciphertext/password appears in connection history or status responses. Mentor status performs a fresh role/account proof; disconnect invalidates the owned connection records without erasing credentials/history. Source ownership claims are serialized and another mentor cannot claim an existing binding.
- Mentor policy editor lists assigned clients and supports pause/request, fixed or proportional source-lot sizing, allocation percentage, maximum lots per position, gross account lots, position count and daily equity-drawdown limits. Backend rejects unsupported/nonfinite/inconsistent limits, rechecks ownership and appends policy audit records atomically. Percentage means source lots, not an unverified cash-capital promise. Risk-percent/stop-distance sizing remains unsupported and is not silently approximated.
- An explicit mentor policy is required and is combined with stricter client caps. Persisted position mapping/scale and symbol pinning remain in use. Worker risk checks enforce gross lot exposure before increases while reductions remain permitted. Fresh client ownership is rechecked before observer dispatch. Status cannot advertise permission when the mentor allocation is absent/paused/invalid, the client is disconnected, worker safety proof is contradictory or stops/holds block execution.
- The authenticated observer V2 path retains opening, SL/TP modification, partial/full closing, duplicate prevention, uncertain-submission holds and recovery. Legacy OPEN dispatch is intentionally refused because it cannot enforce the new account exposure contract; this is a behavior change requiring review before any future execution release. Pausing copying does not automatically close existing broker positions; separately authorized reconciliation/cleanup remains necessary.
- Read-only canary GET allowlists include owned mentor connection status/history and client policy/status. Mutations remain rejected before broker/DB actions, and session checks do not refresh/revoke records.

## Tests and limits

Targeted coverage includes real cookie authentication/ownership, encrypted source credential persistence, duplicate source binding refusal, policy audit/validation, stopped/disconnected/held status, read-only mutation refusal, broker display/transport safety, supervisor handover, gross exposure, partial closes, SL/TP, restart replay and uncertain outcomes.

The changed copier ran through the real queue/Drizzle backend and five synthetic HTTP/process workers using disposable PostgreSQL as well as PGlite. Timing excludes production queue scheduling, Windows SDK order submission and broker fills. BROKER_SPRINT_POSTGRES_COPIER_SIMULATION.json on the VPS records the final measurement; a simulated result below 15 seconds is not broker latency acceptance. No broker orders were submitted. Existing successful financial simulations were repeated only where dispatch/risk/schema changes required regression coverage.

API/shared/client/portal TypeScript checks, combined two-app build, backend/read-only builds and targeted tests are release gates. Compiled UI and API contracts are not production-browser acceptance against real ownership rows. Original production database/key compatibility remains unverified until the original bindings are securely available.

## Non-trading deployment

The new Deriv/XM SDK adapters now load their launcher and read-only modules from a separate root-pinned release rather than the working checkout; credentials remain private stdin, and original JustMarkets controllers are unchanged.

A root-pinned, loopback-only status relay is deployed on 127.0.0.1:8005. It has four private bindings: the unchanged JustMarkets source/receiver and verified Deriv/XM demos. Exness/RCG are excluded. A separate strong relay token and broker credentials are delivered using LoadCredential, outside Git. There are no financial routes, capability requests return 503, and unknown journal/stop metadata stays null. Health alone is not broker authentication proof.

The deployed relay passed real Deriv/XM credential/account proof, unauthenticated rejection, financial-route refusal and restart acceptance without changing existing terminal PIDs. The ea-demo-status.target boot configuration includes only the verified read-only services; no VPS reboot was performed. Actual pinned paths and SHA256s are in root-side BROKER_SPRINT_READONLY_DEPLOYMENT.json and BROKER_SPRINT_DEPLOYMENT_ACCEPTANCE.json. The supplied service file is a template: render its release alias to the approved immutable path; never deploy a mutable checkout.

The app/backend changes and migration are NOT deployed. No original production secret was replaced and no production records were changed. PR #133 remains unmerged; the sprint follow-up includes its relay dependency and does not merge either PR.

## Exact outstanding requirements

1. Identify the authorized backend hosting service and obtain its ORIGINAL DATABASE_URL and unchanged SESSION_SECRET through private runtime access, including correct schema/role/TLS/CA/network settings. Prior authorized VPS discovery found no usable pair; do not substitute fixture keys. Complete the bounded read-only compatibility audit against nonempty original encrypted records and verify existing ownership/licence/account mappings.
2. Verify consistent backups/restore access, then apply the reviewed additive `migrations/20261106_mentor_copy_policies.sql` through the authorized backend workflow. It creates policy/audit tables and adds nullable encrypted mentor credentials. The proposal passed only in a disposable PostgreSQL database. No production migration or backfill has run. Existing clients need an explicit mentor policy before future copying; never enable policies or financial flags as a migration side effect. Existing source rows without encrypted proof require authorized reconnection, not fabricated credentials.
3. Confirm the existing Cloudflare Pages/backend deployment access and actual HTTPS/VPN/private route from that backend to the new loopback relay. Bind both MT5 transports correctly; never expose plaintext credentials publicly or point execution to the synthetic gateway. Deploy matched app/API artifacts after the original configuration/schema gates pass. Do not run normal API startup/backfill/migrations as a read-only canary.
4. Accept real deployed client/mentor cookies, ownership, unavailable/disconnected/read-only/held states and the connection page against original data. No more successful JustMarkets broker tests are needed for this UI/configuration gate. Self-service worker enrollment beyond the provisioned demo accounts is not operationally accepted. Actual new-account ownership/mentor roles must be explicitly provisioned; authenticated broker availability does not authorize an arbitrary user to bind an account.
5. Correct/confirm the Exness and RCG MT5 demo credentials/server/account-active status through the broker's private account channel. Do not send passwords in reports or chat; no speculative server/password substitutions or repeated failed login attempts.
6. Configure the approved external alert destination/receipt and off-VPS restore acceptance. Existing monitoring/alert tooling and local journals remain available; no external delivery or offsite restore is claimed. Cold reboot acceptance and capacity testing at larger account counts remain outstanding.
7. Financial execution remains a separate explicit approval with current account ownership/allocations, risk/cost/margin checks, exact reviewed hashes, bounded openings/retries, cleanup and broker-confirmed latency. Both stops, disabled manifests and AutoTrading-off remain unchanged during this release. No live-account trades are permitted.

## Recovery

To roll back this non-trading rollout, stop/disable only ea-demo-status.target and the new relay/Deriv/XM instance units; restore their prior new-instance unit overlays from the root-owned recovery copy if needed. Do not stop the original JustMarkets/preparation/SSH services. Preserve new private bundles, broker/catalogue evidence and audit logs. Restore no stale DB, key, journal, account identity or financial state, and clear neither stop. The original app deployment remains unchanged. Existing root SSH-password and on-VPS-only backup risks remain; do not disable access without a verified independent recovery path.

Current outcome: verified non-trading VPS integration deployed; broader app release and actual broker copying are NOT production-ready.
