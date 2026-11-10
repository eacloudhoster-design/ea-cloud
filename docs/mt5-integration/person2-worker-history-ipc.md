# Person 2: synthetic history through the guarded worker and private IPC

Branch: `feature/person2-worker-history-ipc-20261110`.
Base: `397d29b6de950e9bbc2ed7722ee0bc31110fd63b` on
`feature/person2-simulated-trade-history-20261110`.

## Integration

The 461-test baseline was reproduced before branching: 393 ordinary-user Python
cases, 39 backend cases, 14 Pages cases, 6 isolated root-refusal cases, and 9 Wine
harness cases. The existing full-fill SDK adapter, event reducer, history ledger,
shared lease authority and reconciliation implementation are reused unchanged.

`native_history_pipeline.py` joins these existing components. An explicitly
provisioned history worker uses `NativeWindowsSimulation` lifecycle management
and the same `native_windows_worker.py` subprocess entry, isolated interpreter,
minimal environment, verified source closure, challenge/response readiness,
framed binary stdio, vendor import ban, network ban and child-launch ban.

The launcher exposes a separate `trade-history` bootstrap protocol. The normal
absolute-target protocol remains the default. History and absolute-target fixtures
cannot be interchanged; the original full-receipt adapter contract is unchanged.
No backend, method, path, service, host, credentials or account capability can be
selected by an execution-event body.

After outer frame authentication, `HistoryWorkerEngine` derives a signed shared
frame with the immutable bootstrap account, persistent authority service ID, and
fixed worker host identity. Request IDs, nonces, controller identity, lease token,
epoch and deadline are preserved. The existing authority validates ownership,
expiry, fencing witnesses and stop state before invoking the same history book.
The signed reply is checked against the complete shared identity and mapped back
to the original response envelope. Parent-side success validation has a small
extension hook; full-fill responses retain their original strict validation.
History responses validate order identity and exact volume accounting or a
bounded reconciliation certificate. The standard status contract remains intact.

Create a new empty private fixture using
`prepare_history_worker(root, binding, key)`. On Linux only, select the reference
launcher explicitly with
`HistoryWorkerSimulation.linux_reference(root, binding, key)`. Refresh only the
synthetic account-bound `mock-stop.json` fixture; no production stop setting is
read or altered by this test path. Acquire a controller grant before sending
strict `sync` event bodies (`create`, `fill`, `modify`, `cancel`, `reconcile`).
Events still require contiguous global sequences, unique IDs and exact centilot
volumes. Existing source ownership, exposure reservations, duplicate checks and
SQLite durability rules remain in the original event book.

## Safety and recovery

Native lifecycle stop state and the fresh mock emergency-stop mirror gate the
shared authority. A missing, expired, unreadable or active mirror stops execution.
Existing bridge stops and account holds remain authoritative. A crash,
disconnection, deadline, invalid response or transport failure first stops the
process with bounded waits and then persists native and shared-account holds.
If process death or a hold write cannot be proved, the result remains uncertain.
No retry, activation, fill replay or hold-clearing operation is introduced.
An independent installation witness refuses recovery if a previously installed
native lifecycle database is missing. Both launcher and worker enforce protocol
mode, with a durable lifecycle mode witness preventing downgrade after marker
removal.

Clean shutdown/restart permits history verification and continuation of a known
active order under a new fenced controller grant. Failure recovery retains holds.
A sticky native lifecycle hold also stops reconciliation through that worker;
read-only offline diagnosis and an explicitly designed operator recovery policy
remain necessary. Reconciliation never resubmits fills or changes positions.

`history-pipeline.sqlite3` records REQUEST and RESULT events with request ID,
hashed controller, operation, static result code and child PID. These IDs match
book events and audit entries. The existing native lifecycle and authority audits
cover process and controller transitions. Missing/full/unwritable audit state
fails closed; a result-audit failure after an effect commits keeps both holds.
No account key, credentials or raw request body enters these pipeline logs.

## Validation and limits

Final results: 501 automated cases passed (461 existing and 40 new), with
0 failures and 0 skips. Two browser scenarios and all six existing Wine scenarios
passed. TypeScript, Python compilation and whitespace checks passed.

To rerun the 40 new Linux reference cases:

```sh
python -m unittest discover -s vps-mt5-service/tests -p test_worker_history_pipeline.py -v
```

Exact test counts, commands, dependency versions, source hashes and raw logs are
in `evidence/worker-history-ipc-20261110/verification.json`. Tests use actual Linux
subprocesses and signed stdio, not just calls to a mocked worker object. They
exercise multiple partial fills, modifications, partial/full position reductions,
cancellation, durable duplicates, out-of-order events, restart proof, process
crash/kill, lost reply, timeout before dispatch and after commit, stop changes,
controller conflicts/expiry, nonce replay, account/source conflicts, forged
signatures, corrupt or missing history, audit failures and protocol confusion.
The full existing suite, two browser scenarios, TypeScript/Python/whitespace
checks, and the six existing Wine acceptance scenarios are recorded separately.

Native Microsoft Windows acceptance is blocked: the reused shared authority and
history path inspection currently require Linux, and no isolated native Windows
runner is available. The history launcher explicitly refuses a native Windows
launch. Existing Wine scenarios validate the original Wine bridge source closure;
they do not establish Wine compatibility for the new integrated history mode.
There is no graphical terminal, real SDK, broker session, market matching or
financial execution. Mock fills remain explicit signed controller events.

The authority remains a single serialized local simulator, not a replicated
cross-host production service. Existing 2,000-event and 500 ms history bounds
remain. Whole-root rollback, hostile same-user writers, kernel/storage hangs,
external deal ingestion, actual broker fencing and an operator hold-release
workflow require separate designs and acceptance. No automatic migration of old
fixtures or completed journals is supported.

Recommended next task: review the integrated protocol and recovery evidence, then
port and validate the shared authority's filesystem/ownership assumptions on an
isolated native Windows runner. Do not introduce real SDK execution to unblock
that testing. This checkpoint is committed locally, without push, merge, deploy,
production changes or trading activation.
