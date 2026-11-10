# Person 2: one authoritative execution path per physical account

Decision: the initial launch uses one assigned execution gateway and durable state
per physical MT5 account. There is no active/active or automatic cross-host
failover design and no distributed coordination platform is added.

Branch: `feature/person2-single-authority-assignment-20261110`.
Base: `b261167ee02be360b1357c15229d865dc072ae8a`,
`feature/person2-multiprocess-ownership-recovery-20261110`. The clean checkpoint
and recorded evidence were verified before implementation.

## Existing enforceable controls

- Application enrollment and client/mentor account binding share PostgreSQL
  transaction/advisory-lock ownership checks. Disconnected identities and pending
  enrollment still reserve accounts. Binding does not automatically activate
  financial execution or release another owner's assignment.
- The shared authority has one root owner and serialized gateway, durable physical
  account uniqueness, account-specific capabilities, server-owned leases,
  monotonic fence witnesses, nonce protection and durable command receipts.
  Missing authority, stale grants and unverified cached evidence fail closed.
- The history authority preserves partial fills, duplicate prevention and its
  event/projection/intent proof. Unknown outcomes remain held; reconciliation
  never repairs positions, replays effects or clears holds automatically.
- Native simulation and Wine bridges use explicit fixture identity, immutable
  bootstrap account/service data, source/readiness verification and bounded
  process shutdown. Sticky stops and recovery holds survive failed requests.
- The configured account router uses an exact login/server route, distinct
  account-bound credentials and dedicated loopback worker origins. It rejects
  duplicate accounts/endpoints, unknown accounts, mentor execution, unsafe
  forwarding and contradictory worker identity/safety replies. It does not fall
  back to an arbitrary alternate worker after an uncertain outcome.

Those controls remain unchanged. Local root locks, SQLite registries and journals
are not cross-host ownership guarantees.

## Confirmed local recovery gap and correction

The older **simulation-only** `AccountWorkers` pool checked duplicate accounts in
its current manifest and persisted identity inside each alias directory. It did
not check other durable alias directories when starting an account.

A disposable reproduction completed a synthetic SDK fill and crashed before its
acknowledgement. The original journal remained `dispatching`. After closing that
pool, a new pool in the **same root** using a different alias for the same account
created a new journal and returned success. The old uncertainty had not been
resolved; changing the alias had changed the effective execution/journal domain.
This is a local assignment bypass, not a real broker execution result.

Only `vps-mt5-service/account_workers.py` changed at runtime:

1. Startup checks the existing version-1 account-binding markers in that pool
   root before creating a new account directory. A physical account already
   reserved by another durable alias is rejected, even if that alias is absent
   from the current manifest or its previous execution completed normally.
2. Unknown, malformed, redirected or unsupported assignment metadata requires
   offline review; it is not treated as evidence that an account is unassigned.
3. A small in-process assignment mutex serializes binding inspection/creation
   across concurrent starts. The existing root owner lease still excludes another
   pool process; per-account execution serialization remains unchanged.

The comparison retains this pool/router's existing exact login/server routing
key; immutable marker metadata also includes broker and role. No new database,
lock service, manifest version, migration, send path, credential export, hold
release or activation was introduced. Missing or malformed state is not repaired.
Alias migration requires an explicit offline reconciliation/state-transfer
procedure; deleting a marker or choosing a fresh alias is not that procedure.

The five added cases in `tests/test_account_assignment.py` cover unresolved and
completed alias reuse, missing/malformed other assignment evidence, and continued
operation of a different account after a known alias conflict. The unresolved
case checks original journal bytes and phase remain unchanged and no new alias
folder is created.

## Execution/provisioning path inventory

| Path | Existing boundary | Required initial-launch restriction |
| --- | --- | --- |
| Enrollment, `bind-client-account.ts`, mentor connect | One app-database owner/reservation; account identity verified through the bound status contract | One application database and reviewed provisioning handoff. Database user ownership alone is not worker placement |
| `account_dispatch.py` / prepared account-router service | Fixed authenticated registry; one dedicated loopback endpoint per registered account | One approved execution route per physical account; consistent observer origin/registry across backend replicas; no alternate executor fallback |
| `SharedAuthority` / `HistoryAuthority` preparation and registration | One local registry/root and owner, strict capabilities/fences and held recovery | Provision one protected canonical state root for that account domain. Do not prepare another independent root as a replacement |
| Standalone SDK simulation `CandidateEngine` / `AdapterEngine` / controller | One bootstrap binding and local observer ownership, authentication and holds | Test-only components must not be run in parallel as alternative account executors or exposed as production broker services |
| `prepare_history_worker` and native simulation launcher | Creates a new private history root; mode guards and lifecycle ownership | Only the assigned fixture/runtime may be started. Native Windows history remains unverified and blocked where unsupported |
| `prepare_prefix`, `WineBridge`, `prepare_wine_history` | Private state/prefix and authenticated child; process and prefix quiescence proof | One assigned prefix/state pair; a fresh prefix/root must not silently replace unresolved state. Synthetic acceptance is not a trading release |
| `AccountWorkers` / `account_gateway.py` | Explicit simulation; current-manifest uniqueness, root lease and now durable alias reservation | Remains simulation-only, never a production MT5 endpoint. Keep its root dedicated to verified account state |
| `demo_worker.py`, private-binding launch and prepared Wine account/terminal units | Credential-bound account, per-journal lease, portable identity, demo-only/approval/stop gates | Not validated for real SDK launch. Approved alias, journal, terminal prefix and worker credentials must be unique; no other unit or manual terminal may execute for that account |
| Legacy `main.py` and raw trade routes (`execute-trade`, `close-trade`, `modify-trade`, legacy observer registration) | Separate older SDK path; does not participate in the shared-authority assignment model | Exclude from initial execution deployment and network routing. Do not run legacy and assigned workers for the same account. Source inspected only; never imported or started in this task |
| Direct SDK/terminal access, ad hoc scripts or another host with account credentials | Outside the authenticated gateway's control | Restrict credentials and OS/service permissions to the sole assigned executor; repository locks cannot stop independently privileged software |

The source tree contains reusable test/provisioning factories and older paths;
the decision does not make all of them one authority. No public execution body
may choose its own root, gateway URL, worker identity or SDK implementation.
Existing authenticated pipeline schemas and router destination selection enforce
that distinction at their public boundaries. Privileged local code and direct
broker credentials still require deployment controls.

## Required deployment controls, not applied here

- Maintain one approved physical-account-to-gateway/host/alias/journal/prefix
  assignment. Use the exact verified broker/server identity; do not infer server
  aliases or normalize identities without broker/runtime acceptance.
- Provision account credentials only to that executor identity. Worker API tokens
  are available only to the assigned router; application callers get only the
  approved gateway capability. Restrict worker ports to loopback/private access
  and prevent other service users from reading state or credentials.
- Keep observer execution routing pinned to the approved gateway. Separate
  status-only services may remain read-only; they must not be accepted as
  execution substitutes. Preserve capability checks, no redirects, no replay of
  uncertain submissions and no automatic alternate-host fallback.
- Exclude legacy/raw SDK services, duplicate terminal units, manual execution and
  second-host credential copies for the same account. This repository review does
  not prove any deployed host already meets those restrictions.
- A host move requires stopping and proving the old effect path cannot act,
  transferring the authoritative journals, deduplication state, binding/fencing
  metadata and stop/hold state, then explicit review. Lease expiry or a clean new
  local root is not proof that an old terminal cannot execute.
- Unknown ownership, missing safety state, unavailable authority or incomplete
  recovery means no execution. Existing non-trading release and approval gates
  remain in place. No enablement, cutover or production setting was changed.

An HA service, global counter, NFS lock or replicated journal is not implemented
or claimed. A future cross-host failover requirement needs its own approved
coordination and effect-side fencing design.

## Validation and readiness

Final results: 545 automated cases passed (all 540 existing cases and five new
assignment cases), with 0 failures and 0 skips. Both browser scenarios, TypeScript,
Python compilation and whitespace checks passed.

Exact counts, raw logs, source hashes and before/after reproduction are recorded
in `evidence/single-authority-20261110/verification.json`. The existing regression
suite includes duplicate assignment/role races on isolated PostgreSQL, conflicting
process ownership, stale grants, process termination and unresolved partial fills,
missing authority, emergency-stop failover, authentication and cached receipts.
All testing is synthetic/offline; real SDK/broker paths were inspected as text or
exercised only through existing mocks.

Wine/native worker code and the pinned artifact lock were not changed. Their
previous 6 + 17 Wine results remain prior-checkpoint evidence; these scenarios
were not repeated for this simulation-pool-only change. Native Microsoft Windows
and real MT5 compatibility remain unverified. This is suitable for GitHub review
after validation, not a financial execution release or proof of deployed
single-authority enforcement. The branch is committed locally and not pushed.
