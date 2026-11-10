# Private MT5 session/read-only preparation

Base: `ab1dc8d07b16e8c93e48864dea66c74bf019b2cb`, verified clean on the expected
branch. Development branch:
`feature/person2-private-readonly-session-preparation-20261110`.

## Smallest construction seam

`CandidateEngine` already acquires the observer journal lease, binds account
identity, restores sticky holds and invalidates old grants before constructing
its synthetic broker. That construction is now an internal `_construct_sdk()`
method. `AdapterEngine` uses the same hook to wrap the same `SimulatedBroker` in
`SyntheticSdkAdapter`, before recording successful worker startup. Backend failure
closes its database; the existing parent exception path closes the observer DB
and releases ownership. No module name, SDK object, factory or backend selector
was added to IPC or public configuration.

Default behavior is still hardcoded simulation. `FencedEngine`, authenticated
stdio workers, stop checks, leases, request signatures, durable receipts, SDK
installation witnesses and replay protection keep their existing implementation.
The new hook is not a working real-backend plugin interface: simulation bindings,
result literals, journal assumptions and native loader restrictions remain.
No execution engine was added or copied.

## Independently safe private contracts

`vps-mt5-service/mt5_readonly_preparation.py` is deliberately **not imported by the
execution worker, exposed over IPC/HTTP or installed as a backend**. It contains:

- Frozen, strict private metadata: a preparation-protocol identifier, tenant,
  account, broker, exact login/server, Windows terminal/journal paths and an opaque
  credential selector. No password or enabled/approval flag is accepted. Paths
  reuse the existing lexical validator and reject executable/journal collisions;
  this does not inspect actual files, DACLs, provenance or assignment ownership.
- Pure dictionary projections using official read-field names for account,
  terminal, symbol, tick, position, active order, historical order and deal data.
  Additional fields such as account names/passwords are omitted. Missing reads,
  malformed numbers and duplicate collection tickets are rejected. Empty
  collections remain empty observations, never proof of no execution.
- Demo/hedging-only identity comparison against the immutable configuration,
  including exact account/server and portable terminal/data directories. Matching
  supplied data is not evidence that any terminal was contacted or authenticated.
- A read-only structural SDK shape and a preparation lifecycle with only
  `prepared` and `closed` states. Evidence review stays bound to that configuration,
  rejects mismatch/closed state and reports `sdk_runtime_verified:false` and
  `execution_authorized:false`. It never changes connected state.
- `connect`, `read` and `send` are **unconditionally unavailable**, including when
  environment variables request real mode. There is no SDK injection, vendor
  import, authorization issuer, activation flag or shutdown call. Closing only
  closes the preparation object because no initialized SDK session exists.

This is configuration/evidence preparation, not a fake SDK, connected session or
real adapter. It must not be used as terminal attestation or execution permission.
Python-level immutability is not a sandbox against malicious same-process code.

## Read mapping and remaining I/O

| Official operation | Prepared projection | Remaining authorized worker implementation |
| --- | --- | --- |
| `account_info` | login, server, demo trade mode, hedging margin mode, finite positive equity | Collect from an approved session and recheck account identity/permissions at actual I/O boundaries. |
| `terminal_info` | connected, installation/data paths, build | Collect and validate trusted executable/data paths, OS security and immutable terminal binding. |
| `symbol_info` | name, visibility, digits, point, volume limits/step, filling and execution modes | Broker symbol selection and complete grid/protective-level policy remain in existing adapter validation/future real mapping. No automatic Market Watch mutation is introduced. |
| `symbol_info_tick` | finite bid/ask, spread consistency, millisecond timestamp | Actual quote collection, freshness policy and bounded native-call handling. |
| `positions_get` | tickets, stable identifiers, magic, direction, symbol, volume, SL/TP | Collect complete account-owned evidence and enforce existing allocation ownership. Manual magic zero is retained as evidence, not adopted as a managed position. |
| `orders_get`, `history_orders_get` | order/position IDs, type/state, magic, symbol/comment, initial/current volumes | Actual collection, history windows, correlation and completeness rules. |
| `history_deals_get` | deal/order/position IDs, type/entry, magic, symbol, volume | Actual collection and durable duplicate/partial-fill reconciliation. This projection does not classify fill finality. |

No `initialize`, `login`, `shutdown`, `symbol_select`, `order_check` or `order_send`
operation can run through these read mappings. Actual initialize may start a
terminal and authenticate using saved credentials; it is not an offline probe.
The existing `ReconciliationSdk.send` contract and synthetic adapter remain intact.
No relaxed receipt, guessed ticket, fabricated fill or automatic recovery occurs.

## Validation

Results: **501 ordinary-user Python worker tests passed, 0 failed, 0 skipped**,
including 13 new tests. **Two existing application copying integration tests
passed**, 0 failed/skipped. Python source compilation and whitespace checks passed.
Unchanged root-only publisher cases were excluded; this is not a new whole-project
Node/browser/native acceptance count.

Evidence: `evidence/private-readonly-preparation-20261110/`.

Thirteen new focused tests cover immutable/missing/invalid configuration, lexical
paths, identity/mode mismatches, read projections, omitted private fields,
None-versus-empty history, duplicate tickets, disabled real access regardless of
environment, session switching refusal, constructor order and failure cleanup.
They also verify a preparation/real binding or initialize operation cannot enter
the existing simulation execution protocol.

Because the construction seam is shared, ordinary-user Python worker regressions
were run across existing simulation, IPC, gateway, fencing, stop, adapter, native
candidate/Linux-reference and history/recovery tests. Application regressions run
the existing guarded-gateway and five-worker synthetic copying paths. These use
PGlite and mock SDK effects, not real PostgreSQL concurrency or broker operation.
No UI/browser or real SDK/native acceptance was run. The worker source closure
changed, so earlier Wine acceptance results are historical, not a new Wine result
for this refactor. Native Windows acceptance also remains unverified.

## Runtime/protocol decisions still blocking real session I/O

1. Person 1 must approve the private authorization/bootstrap contract and trusted
   assignment/credential delivery. No boolean flag or this metadata digest is an
   authorization grant. The existing simulation-only binding/result types and
   NoVendor guards must stay strict; a future approved demo contract needs explicit
   separation and review.
2. Select one Windows x64 Python/official SDK/NumPy/terminal-build profile. The
   simulation candidate pins CPython 3.12.10; the service requirement pins SDK
   5.0.45, while infrastructure lists SDK 5.0.6231 with a Python 3.13/Wine 11
   comment. These are not interchangeable or accepted native profiles. No package
   was changed, installed or imported here.
3. Provide the approved Windows VM, trusted terminal/runtime, protected NTFS state,
   credential storage, process containment and account-bound session lifecycle.
   Prove initialization/shutdown and bounded failure handling separately. Killing
   a worker does not prove a broker-side request was cancelled.
4. The guarded engine still assumes synthetic bindings/state/results. The internal
   hook alone does not authorize attaching a vendor module. Real lifecycle I/O,
   validated SDK-to-dictionary conversion, session ownership and read-only RPC
   semantics remain intentionally unimplemented pending those decisions.
5. Preserve the assigned authoritative path and journals during integration. A
   real session must not become a second controller/HTTP fallback. Local leases
   cannot exclude copied credentials or independent authority roots on other hosts.
6. Real action-specific receipts and authenticated order/deal history integration
   remain later work. The existing synthetic partial-fill protocol is not an SDK
   event feed, and matching supplied history is not permission to release a hold.

Next implementation task after those approvals: private worker-owned initialization
and read collection using the existing construction seam and an approved demo
binding, first with offline test doubles and then separately authorized read-only
native acceptance. Financial execution stays unavailable throughout that milestone.

This checkpoint is preparation for GitHub review only. No push, merge, deployment,
production configuration changes, broker connections, actual SDK calls, real
orders, trading activation or disabling of emergency stops occurred.
