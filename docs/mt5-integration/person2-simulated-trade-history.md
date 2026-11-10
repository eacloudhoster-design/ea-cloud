# Person 2: simulated trade-history reconciliation and partial fills

Development branch: `feature/person2-simulated-trade-history-20261110`.
Base: `feature/person2-simulated-cross-host-fencing-20261110`,
`6f67c49f75e4dbf956b572d254bd0168b9293bb1`.

This candidate is an isolated Linux offline simulation. It cannot connect to a
broker, load a vendor SDK, discover a terminal, or place financial orders. Native
Microsoft Windows compatibility and real MT5 integration remain unverified.

## Inspection and design

The existing `SimulatedBroker.send` commits one complete synthetic fill per call.
`SyntheticSdkAdapter` deliberately accepts only a fully validated complete
receipt. The observer commits dispatch intent before SDK access and holds
uncertain outcomes. `history_reconcile.assess` is a read-only terminal-order
assessor that always requires a hold; its real history collector is outside this
simulation path. These completed components remain unchanged.

`synthetic_trade_history.py` adds a synthetic event backend, separate from the
absolute-target adapter. It uses the existing strict protocol models and approved
symbol fixtures. `history_authority_simulation.py` reuses authenticated shared
host frames, nonce protection, server-owned lease expiry, fencing witnesses,
account registry, exclusive authority ownership, structured lifecycle audit, and
persistent account holds. The shared authority gained only a validation hook and
a mode guard. It rejects history-mode roots through the older absolute-target
protocol. No existing accounts or journals are migrated or silently adopted.

Provision a new private development root with `prepare_history_authority`, then
register explicit simulation-only account bindings and independent account keys.
The existing `SimulatedHost` and `SimulatedLink` send `sync` frames containing one
strict action: `create`, `fill`, `modify`, `cancel`, or `reconcile`. There is no
backend-selection, arbitrary SDK method, credential, or path field in that body.
Default stop checks require a fresh account-bound mock stop mirror; an absent,
expired, ambiguous, or unreadable mirror stays stopped. A sticky bridge-stop file
also stops this backend. Supplying a stop callback is a trusted offline test
fixture capability, not a request-controlled option.

## Implemented behavior

- Order IDs correlate multiple unique fill events. Requested, executed, remaining,
  active remaining, and cancelled volumes are tracked separately. Original
  requested volume survives modifications. All volume arithmetic uses integer
  centilots; unsupported precision, nonfinite values, overfills, and close
  overbooking fail closed.
- Opening fills accumulate on one synthetic position. Closing orders require the
  same source, symbol and opposite direction and can partially reduce or remove
  that position. Cancellation removes only the unfilled reservation; executed
  exposure remains. Modification changes pending total quantity and order SL/TP;
  it does not retrospectively modify already executed deals or position stops.
- One active order per source, source/symbol pinning, magic collision checks,
  gross exposure reservations and position-count limits constrain the fixture.
  Multi-host coordination remains serialized at the existing simulated authority.
- Event, deal, order and position projection updates commit together in SQLite
  with `synchronous=FULL`. Exact duplicate events return the prior receipt without
  another deal. Changed duplicate payloads and conflicting RPC IDs latch holds.
  The authority stores independent immutable event-intent witnesses.
- Global event sequence must be contiguous. Out-of-order events are rejected and
  held; this candidate deliberately does not reorder or buffer missing history.
- Every operation verifies the hash-chained event log by deterministic replay and
  compares the complete materialized projection and receipts. Reconciliation also
  checks independent authority witnesses and unresolved command IDs. Deleted,
  conflicting, unwitnessed, corrupt or incomplete evidence stays held.
- Recovery never resends a recorded fill or infers no-fill from absent evidence.
  A crash after a committed fill can be proved by reconciliation, but the shared
  hold remains active. A pending command with no committed evidence remains
  unresolved. Reconciliation writes audit/certificate metadata only and never
  repairs positions, replays execution, or clears any hold.
- Permission, deadline, lease, authority availability and stop checks occur during
  replay and immediately before transaction commit. A 500 ms operation budget,
  100 ms SQLite lock timeout, 2,000-event history cap and existing frame/nonce
  bounds constrain this development fixture. Rejection reasons are structured
  audit records; no secrets are logged.

## Verification

See `evidence/trade-history-20261110/verification.json` and the raw logs beside it
for exact counts, commands, dependency versions, source hashes and boundaries.
The independently reproduced base consists of 331 ordinary-user Python cases,
39 backend cases, 14 Pages cases, 6 root refusal cases in a network-disabled
container, and 9 Wine harness cases: 399 total, no failures or skips.

The final automated suite has 461 passing cases (399 existing and 62 new),
0 failures and 0 skipped. Both browser scenarios and all six existing Wine
acceptance scenarios pass. TypeScript, Python compilation and whitespace checks
pass.

The new tests exercise multiple partial fills, exact decimal accounting, partial
and full closures, cancellation, modification, duplicate events and RPCs,
out-of-order events, history/receipt/projection corruption, authority-witness
rollback detection, missing or insecure ledgers, stop failures, sticky holds,
controller conflicts and expiry, tenant isolation, network/reply simulation,
transaction and audit failures, bounded deadlines, restart and actual isolated
process exit after a committed synthetic fill.

The complete offline suite, two existing browser scenarios, existing six Wine
acceptance scenarios, TypeScript checks, Python compilation and whitespace
checks are recorded separately. Wine checks cover the unchanged existing worker
source closure; they do not establish Wine or Windows acceptance for this new
history backend. Browser database mode is recorded explicitly in the manifest.

## Remaining blockers and next task

This is a deterministic, single-authority synthetic event backend. There is no
real market matching, external history ingestion, distributed authority service,
production database, broker history mapping, fee/P&L accounting, market calendars,
or terminal lifecycle integration. The original full-fill adapter and worker
launchers do not automatically select this backend. Enabling asynchronous fills
in those paths requires a separately reviewed protocol/lifecycle design; the
existing full-receipt safety contract must not be relaxed implicitly.

History is bounded and verified within a short deadline; larger books require
reviewed checkpointing rather than increasing limits blindly. The authority and
ledger reside on one host; backups or coordinated whole-root rollback, filesystem
failure, and hostile same-user writers require stronger external durability and
trust controls. No API clears holds; recovery approval/remediation remains an
explicit future operator workflow. Native Windows tests still require an
isolated Windows runner. No production, broker or trading configuration changed.

Recommended next task: review this event contract and add a separately scoped,
offline asynchronous-worker transport acceptance candidate before any real SDK
integration. This branch is committed locally only, with no push, merge or deploy.
