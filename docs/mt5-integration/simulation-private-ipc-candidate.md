# Person 2 simulation-only SDK/private IPC candidate — 2026-11-10

Base: `8e5b6c7732feee5e694932e8e3054e5a8efdd953`.
Branch: `feature/person2-simulation-private-ipc-20261110`.

## Scope and reuse

This is an offline library candidate, with a synthetic SDK and a real isolated
Python subprocess/pipe. It is not an execution-capable release. There is no
MetaTrader5 import or Wine/vendor launcher in the candidate, no listener/HTTP
endpoint, no production configuration, and no integration into financial routes.
All binding servers must be exactly `SimulationOnly`, with explicit
`simulation=True` and client role. Every response declares simulation and
`financial_execution=False`.

Inspection found existing `demo_worker`, `account_dispatch`, `AccountWorkers`,
`StateLease`, `SyncJournal`, observer reconciliation, stop mirroring and risk guards.
These are reused rather than replaced. The existing `Account`/`SimulatedBroker`
definitions were moved unchanged from `account_workers.py` to `simulation_sdk.py`;
AST comparison verified unchanged class behavior. `account_workers` re-exports
those imports, preserving its existing callers. The move removes the candidate's
dependency on that module's Linux-only `fcntl` import.

`private_ipc.py` implements the wire contract. `sdk_ipc_candidate.py` implements
the single-thread worker, explicit controller, leases, ledger and audit trail.
Existing stop, journal, ownership, reconciliation and backend implementations are
unchanged. No production dependency was added.

## Protocol, ownership and state

- Private `multiprocessing` spawn/inherited-handle pipe; request/response traffic
  uses `send_bytes`/bounded `recv_bytes`, never untrusted-object `recv`/pickle.
  Standard-library spawn bootstrap remains trusted local process setup.
- Canonical JSON plus HMAC-SHA256 with separate request/response domains and a
  per-account bootstrap key of at least 32 bytes. No broker password crosses IPC.
- A 16 KiB frame maximum; duplicate JSON keys, non-finite numbers, unknown fields,
  coercions, wrong bindings/roles/accounts, unsupported versions and commands are
  rejected. Responses are authenticated and correlated to binding, controller,
  request ID and nonce, then checked against command-specific success schemas.
- Controller pipe timeouts are 50–5000 ms; envelopes expire within five seconds.
  The controller bounds the entire pipe exchange
  using a supervised I/O thread, so a blocked write or partial read cannot block
  its caller indefinitely. Process termination/kill and thread cleanup have
  separate bounded waits. Existing SQLite busy timeouts are also bounded; the
  configured request timeout is not a promise that OS cleanup finishes instantly.
- The existing `StateLease` exclusively owns the journal. A durable binding also
  includes tenant/account/broker/login/server/role/simulation/protocol identity.
  Cross-tenant rebinding and adoption of unmarked/nonempty state are refused.
- Explicit lease acquisition/renewal only: 2-second grants, random token hashes,
  increasing epochs, wall-clock and monotonic expiry. No expired-lease renewal,
  automatic acquisition, request retry, worker restart or hold-clearing API.
  Worker restart invalidates grants while retaining safety holds.
- Durable nonce rejection and request ID/payload-hash idempotency supplement the
  existing observer revision/request-hash/absolute-target journal. Exact wire
  replay is rejected; a fresh nonce for an identical completed semantic request
  returns the stored receipt only under a currently valid lease and safe gates.
- Stop, SDK identity/demo mode, lease and deadline are rechecked immediately
  before each simulated SDK send, after audit I/O. Uncertain submission and
  external-reduction holds remain blocked. A timeout/crash causes confirmed child
  shutdown, exclusive lock reacquisition and a durable transport hold. The hold
  also survives failure before first worker initialization.
- If child death cannot be confirmed or a transport hold cannot be recorded, the
  controller reports `WORKER_STOP_UNCONFIRMED` or `TRANSPORT_HOLD_UNRECORDED`, stays
  failed and never claims successful recovery. Operator investigation is required.
- Structured append-only SQLite audit records contain event/time/epoch and hashed
  request/controller references. They exclude keys, lease tokens, credentials,
  raw bodies and arbitrary SDK exception text. Replay/audit capacity exhaustion
  blocks progress rather than evicting protection or silently losing audit data.

## Stop behavior and simulation injection

The default checker is the existing `demo_worker.emergency_stop_active`, including
the verified missing-directory fix and fixed-path, freshness-checked mirror.
An unavailable checker or any value other than exact `False` stays stopped.
No host latch, mirror, execution grant or production service is changed.

Tests explicitly inject synthetic stop state and fault controls into the mock-only
candidate. That fixture injection cannot select a real server or load a real SDK.
It is not an approval mechanism for the existing execution workers. Recovering
synthetic stop metadata or renewing/reacquiring a controller lease never clears a
stored observer/IPC/transport hold. `status` can expose the retained hold while all
subsequent `sync` commands remain blocked.

## Validation and evidence

Baseline was reproduced before edits: **164 automated cases, zero failures/skips,
and both existing browser scenarios passed**.

| Existing/new set | Passes | Failures | Skips |
| --- | ---: | ---: | ---: |
| Core backend/PostgreSQL/transport/synthetic copier | 39 | 0 | 0 |
| Pages routing/output | 14 | 0 | 0 |
| Python worker suites excluding root publisher | 155 | 0 | 0 |
| Root publisher/mirror suite | 6 | 0 | 0 |
| **Distinct automated cases** | **214** | **0** | **0** |
| Existing browser scenarios, separately counted | **2** | **0** | **0** |

The Python total includes the 105 existing ordinary-user cases plus **50 new IPC
cases**. Coverage includes unauthorized/tampered/malformed requests and responses,
cross-tenant/account claims, nonce/revision replay, durable receipts, concurrent
semantic retries, lease conflicts/expiry/fencing, clock reversal, stop changes,
SDK identity changes, crash after a committed synthetic fill, pipe timeout,
unconfirmed termination, audit failures and recovery with holds preserved.

Tests use only temporary private directories, synthetic SDK/account data and the
existing marked disposable loopback PostgreSQL fixture. Python vendor imports
and non-loopback Python/Node test connections are blocked by the external harness.
Root publisher tests use a network-disabled container with read-only source and
disposable `/tmp`, as in the previous safety-fix report. Workspace TypeScript and
whitespace checks pass. Existing browser scenarios use matching unchanged frontend
bundles; no physical-device, native Windows, Wine or remote CI acceptance is claimed.

Focused reproduction from repository root, with existing Python dependencies:

```sh
python3 -m unittest discover -s vps-mt5-service/tests -p test_private_ipc.py -v
```

Full baseline reproduction follows the exact core list and marked PostgreSQL/
PGlite fixtures in `person2-release-readiness.md`, plus all Python tests (root
publisher suite separately), the Pages suite and the two existing browser scripts.
Local raw evidence and harness: `/workspace/work/ipc-candidate/baseline/`,
`/workspace/work/ipc-candidate/after/`, `/workspace/work/ipc-candidate/run.py`.
The external `/workspace/work/stop-fix/python-suite.py` selects every ordinary-user
Python case while the six root publisher cases run separately. Log/source hashes,
exact baseline SHA and final commit are recorded in
`/workspace/work/ipc-candidate/verification.json`.

## Remaining blockers and safety limits

1. Windows/Wine runtime, inherited-handle behavior, native filesystem locking and
   ACL protection have not been exercised. Spawn/byte-pipe semantics are portable
   source choices, not proof of Wine acceptance. The current controller/child run
   in one Python platform. A Linux-controller-to-Wine-runtime launch/handle bridge
   is not implemented or accepted by this candidate.
2. There is no real SDK adapter, credential enrollment, terminal startup or broker
   path. Integration with an actual SDK would require separate review and offline
   adapter/runtime acceptance; no execution permission is implied here.
3. Locks/epochs fence this local journal, not a distributed multi-host controller.
   Per-account key provisioning and a trusted local OS principal are prerequisites.
   HMAC authenticates integrity; it does not encrypt process memory or protect
   against a compromised parent/worker/OS account. Windows ACLs need validation.
4. Existing mirror freshness can extend to three seconds when direct reads are
   unavailable. A final check cannot undo an already committed operation. Synthetic
   fill timing does not establish broker latency, margin, liquidity or execution
   correctness. OS/SQLite corruption and resource failures require operator review.
5. Replay/audit stores deliberately fail closed at their bounds. Safe archival,
   lifecycle retention and an independently reviewed hold-resolution workflow are
   future work; deleting state is not a recovery procedure.

No push, merge, production configuration change, deployment, broker connection,
real order, stop removal or automatic trading activation is part of this commit.
