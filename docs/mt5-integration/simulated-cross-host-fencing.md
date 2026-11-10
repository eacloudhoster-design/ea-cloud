# Simulated cross-host controller fencing — 2026-11-10

Branch: `feature/person2-simulated-cross-host-fencing-20261110`.
Base: `b5f8cc205625464b1fe94b1c36c1269c0f6972dd`.

**Offline simulation only. Not a distributed authority, broker fencing deployment,
Windows acceptance result or execution-enabled release.** The existing 348-case
offline baseline was reproduced before this development branch was created.

## Inspection and existing guarantees

CandidateEngine's controller grants, epochs, monotonic deadlines, nonce history,
idempotency receipts and original observer identity/ownership are durable within
one account journal. StateLease fences a local file/process; an independent host
with an independent journal can still believe it is the owner. The SDK adapter
adds another private intent/receipt/hold boundary, but a controller-side check
alone cannot fence a remote effect after ownership changes.

The new simulator therefore places all account effects behind one serialized
shared authority/gateway. Simulated hosts do not clone SDK state or perform
independent writes. The gateway uses the original AdapterEngine, original private
IPC message validation and signing, existing synthetic SDK, account binding,
reconciliation mappings and persistent holds unchanged. No existing implementation,
production worker/startup, deployment configuration or dependency pin was rewritten.

New files:

- `vps-mt5-service/shared_lease_simulation.py`: explicit fixture provisioning,
  shared lease authority, fenced gateway, signed host/client protocol and modeled
  partition/lost/corrupt-response transport.
- `vps-mt5-service/tests/test_shared_lease_simulation.py`: 51 offline cases,
  including a real spawned Linux process crash after a committed synthetic fill.

The service is a non-root Linux library fixture, not a listening daemon. No socket,
MetaTrader5 import, terminal discovery, credentials, real SDK or broker submission
path exists. Existing local workers are not silently turned into cross-host-safe
services. Only the simulator's clients/gateway exercise the new shared contract.

## Ownership and protocol

Each account is registered explicitly by the fixture operator with a strict
SimulationOnly Binding and a 32-byte account capability. Registration is not an
RPC and never adopts an unmarked existing fixture. Registry identity/digest and
broker/login/server are checked on lookup. A unique physical-account constraint
prevents registering the same synthetic broker/login/server under another tenant.
Different tenants use separate roots, keys, counters, quotas and journals. A capability
key cannot be reused for another account; internal SDK keys are additionally
scoped to the service identity and binding.

SharedEnvelope extends the existing strict authenticated Envelope with a service
identity and simulated host identity. Existing version, binding, controller,
request ID, nonce, issue/deadline, epoch/token, operation/body rules still apply.
The only operations remain acquire, renew, status and sync; password, backend and
root-path fields cannot enter execution. HMAC domains and strict response safety
flags are reused. SharedResponse additionally binds service and host identity.
Keys/tokens are never argv, environment, raw-frame or audit output. The authority
stores only key/token hashes; operator account keys live in memory and must be
re-provisioned explicitly on service restart.

A claim issues one opaque token and strictly increasing per-account integer fence
for that host/controller. An unexpired owner cannot be displaced, including by a
second controller with the same host label. Renewal requires the exact live token,
host/controller and epoch, and keeps the fence unchanged. Expired, wrong, stale or
conflicting grants are rejected. Counter exhaustion/invalid persisted numeric
state fails closed instead of wrapping/repairing it. Claims are conditional
ownership grants, never permission to override an emergency stop or start trading.

Lease lifetime is two seconds in authority time, with a separate monotonic deadline.
Client clocks cannot extend a lease or expire another owner's grant. Backwards
authority time latches an account hold. A server restart invalidates every existing
grant and advances durable fences; no old monotonic deadline is imported into a
new clock domain. Registered completed work, receipts, nonce history and holds are
not reset. No automatic lease takeover/renew/retry runs in a client.

## Sink enforcement and shared account state

The authority owns one SDK/reconciliation root per account. Handoff preserves
positions, fills, revisions, mappings, risk state and idempotency. A target already
reached on host A is reconciled against the same actual mock position on host B;
it is not opened again in a fresh per-host account copy.

A single local service ownership lock prevents a second simulator authority from
running on the same fixture. Its command critical section serializes all lease
changes and effects. Contending requests wait at most 250 ms for that section,
then fail unavailable; they cannot steal a grant while a prior operation remains
in flight. FencedEngine adds the current shared grant/authority/stop/command-deadline
check to the original local lease validation. The existing adapter samples that
permit again immediately before each mock send and after its final account read.

A request admitted before expiry can still be refused at the sink when a lease,
fence, stop or command deadline changes. A stale host cannot execute after another
owner is granted access. An unavailable authority is not permission to use cached
local authorization or a fallback SDK. The modeled gateway never falls back to
an unfenced host-local executor.

`shared-fence.sqlite3` is a separate account witness. It records service/account,
highest executed fence and holder/token hashes before a command can affect the
mock account. A stale central counter snapshot is refused rather than advanced
by guessing from a restored database. Equal fences must have the same holder and
token. Missing/corrupt witness or account files are not recreated as permission.
This witness detects the tested partial central-database rollback; it cannot
detect coordinated rollback of the entire fixture and all independent witnesses.

## Durable request and recovery contract

The authority commits an account/request ID + immutable binding/body fingerprint
as `processing` **before** entering the existing SDK engine. The SDK engine has
its own local lease, nonce, adapter intent/receipt and observer mapping checks.
A completed authority response is persisted with its completion audit record.

- Same request/body with a fresh nonce can return the saved validated response
  under a current grant, even from another simulated host, without another fill.
- Same request ID with another body is an idempotency conflict.
- Exact wire nonce replay is rejected durably, including after authority restart.
- Unknown/processing commands, missing completed responses, malformed cached
  safety flags or cached source/symbol mismatches cannot become a clear result.
- Uncertainty latches authority and existing observer/transport holds. A new grant,
  service recovery, SDK restart or fresh clear mock mirror never removes them.
- An actual process death after the existing mock commits a fill leaves an
  authority processing intent and original SDK/observer uncertainty. Restart
  fences old grants and blocks duplicate execution rather than inferring no fill.

There is deliberately no claim of a cross-file atomic transaction or automatic
exactly-once completion. Unknown outcomes sacrifice availability and remain held
for offline review. Known completed receipts enable safe explicit deduplication;
the client does not automatically resubmit a lost response.

## Emergency stops, outages and partition semantics

The default stop source is the existing account-scoped, expiring, strict
`mock-stop.json` in the private shared root. Missing, malformed, stale,
cross-account or unavailable evidence means stopped. Tests explicitly provision
synthetic clear mirrors; the authority never clears a mirror or production latch.
An injected stop callback is trusted fixture construction, not a request field.
Existing bridge-stop, adapter, observer and transport holds remain enforced.

A stop overrides both a live owner and a newly granted owner, including cached
receipt paths. Stop/authority loss during modeled execution blocks a mock send
and conservatively holds any admitted uncertain command. Acquiring a lease while
stopped does not authorize a fill. Status/lease messages retain financial_execution=false.

SimulatedLink has no network. It models:

- Partition before dispatch: no authority callback/effect; client receives uncertainty.
- Lost reply after accepted dispatch: an effect may already be durable. The client
  receives uncertainty; explicit same-ID retry can return the saved result safely.
- Corrupt reply: signature/response correlation fails; no permission/success is trusted.
- Authority availability loss: all claims/renewals/status/sync are denied, and the
  execution permit also checks availability during an already admitted command.

This does not pretend a real network partition can cancel an already accepted
broker submission. The single shared sink is the reason there is no independent
host-local duplicate path. Real RPC authentication, host credentials and transport
cancellation remain future acceptance work.

## Audit, bounds and storage

FULL-synchronous SQLite records static registration/restart/claim/renew/intent/
completion/cache events, binding digest, hashed host/controller, epoch and time.
No raw capability, token, request frame or SDK exception is logged. Ownership
changes and their audits commit together. Audit failure rolls back a claim; audit
failure after a mock fill leaves a processing command and persistent hold.
Nonce/audit capacity is bounded per account at 10,000 rows; one tenant's nonce
quota cannot consume another account's quota. No purge/reset removes replay history.

The fixture uses private canonical Linux paths and existing ownership checks.
SQL opens use existing-file modes after provisioning; lost account/authority files
are not auto-created on recovery. The original adapter's mock budgets, local lease
and process uncertainty checks remain active. Filesystem/kernel hangs and malicious
same-user code cannot be bounded by these Python timers; this is trusted-code offline
simulation, not an adversarial code sandbox or a replicated storage service.

## Reproduction

With the existing offline dependencies, from repository root:

```sh
python3 -m unittest discover -s vps-mt5-service/tests -p test_shared_lease_simulation.py -v
```

The fixture API is explicit: prepare_authority(new_empty_root), SharedAuthority(root),
operator register(binding, account_key), and separate SimulatedHost(SimulatedLink(...),
binding, key, host_label) clients. Host labels are simulated authenticated request
claims, not physical-machine attestation. Each client must acquire its own current
grant before sync. The default missing mirror remains stopped. No terminal or
real SDK needs to be installed.

Tests cover simultaneous claims, stale/expired/wrong grants, monotonic renewal,
clock reversal/skew, handoff and shared exposure, global receipts/nonces,
partitions/lost/corrupt replies, outage/expiry while an operation is in flight,
stop changes during ownership changes, tenant/physical-account isolation, registry
corruption, audit failure/capacity, missing state, partial snapshot rollback,
counter exhaustion, and a spawned process crash after a fill. The in-flight owner
contention case uses an explicit barrier, not a sleep-based assumption about
where the worker has reached.

## Remaining blockers

1. This is one serialized local authority/gateway with simulated hosts and links.
   It is not a consensus-backed highly available authority. Copying SQLite files
   onto separate hosts does not implement this contract. Production needs a
   linearizable authority, secure clock/epoch/rollback policy and durable gateway
   ownership without split brain.
2. Enforcement must remain at the execution resource. A future real MT5 SDK/broker
   path cannot gain fencing safety merely by checking a token in a controller.
   It needs a reviewed sole-executor/fenced-gateway design and unknown-outcome
   recovery. None is deployed or integrated here.
3. Real network/TLS, per-host identity/authorization, credential rotation, real
   host failure detection, storage failover and a complete rollback/restore policy
   remain unverified. Simulated host labels are not native machine identity.
4. Native Microsoft Windows, actual ACL/job/lock behavior, graphical MT5, real SDK
   compatibility and broker/financial execution remain unverified and excluded.
   No native or distributed compatibility claim follows from these tests.
5. Holds have no automatic resolution API. Kernel/storage failure can prevent a
   final durable write; unknown authority/receipt state remains closed. Existing
   final-check-to-submit and native-call cancellation limitations remain.

Recommended next task: review the sole-executor and linearizable authority contract,
then validate it with an independently isolated multi-process/transport fault harness
and eventually native Windows simulation acceptance. Do not deploy this local
fixture, add a live SDK or connect brokers from these results.

## Recorded verification

| Set | Baseline passed | Final passed | Final failed | Final skipped |
| --- | ---: | ---: | ---: | ---: |
| Backend/PostgreSQL/transport/copier | 39 | 39 | 0 | 0 |
| Pages/output/proxy | 14 | 14 | 0 | 0 |
| Ordinary-user Python | 280 | 331 | 0 | 0 |
| Root publisher/mirror, separate container | 6 | 6 | 0 | 0 |
| Existing Wine harness integrity/isolation | 9 | 9 | 0 | 0 |
| **Offline total** | **348** | **399** | **0** | **0** |

The 51 added cases run on Linux with simulated hosts/links. One case launches an
actual separate Linux process and kills that process via the existing mock's
post-fill crash injection; it is still not native Windows or distributed testing.
No existing tests were modified or skipped. The baseline ran before branch
creation, and the final suite ran on the candidate sources.

The two existing browser scenarios passed separately. Enrollment used the existing
PGlite fallback; its fixed PASS string says PostgreSQL and must not be interpreted
as a second native PostgreSQL browser fixture. Status recovery served only the
matching unchanged static build with intercepted APIs. Backend cases used fresh,
explicitly marked, loopback-only disposable PostgreSQL fixtures for baseline and
final verification. Generated test passwords were not production credentials.

The six existing Wine acceptance cases also passed in a fresh network-disabled
Wine 10.0/Windows Python 3.12.10 fixture. They test the existing Wine bridge, not
this shared-authority simulator or a native Microsoft Windows kernel. TypeScript,
Python compilation and whitespace checks passed. Native Microsoft Windows, real
network failover, SDK integration and broker execution remain unverified.

Evidence: [verification manifest](evidence/cross-host-fencing-20261110/verification.json),
[baseline Python](evidence/cross-host-fencing-20261110/baseline/workers.log),
[final Python](evidence/cross-host-fencing-20261110/validation/workers-final.log),
[Wine regression](evidence/cross-host-fencing-20261110/wine-regression/native-acceptance.log),
and [hashes](evidence/cross-host-fencing-20261110/evidence-sha256.json).
Raw logs, preliminary test captures, reproduction harnesses and generated test
bundles are preserved outside the checkout in `/workspace/work/cross-host-fencing/`.
Task-owned containers, generated database credentials, preview server and child
processes were cleaned up; no production prefix, latch or configuration was touched.

This checkpoint was committed locally without push, merge, deployment, broker
connections, real orders, emergency-stop removal or trading activation.
