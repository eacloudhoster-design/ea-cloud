# Simulation-only SDK adapter candidate — 2026-11-10

Branch: `feature/person2-simulation-sdk-adapter-20261110`.
Base checkpoint: `89638db7487a49977d2ebd2c4e056d106d672439`.

**Synthetic candidate only. No real SDK, broker or native Windows acceptance.**
There is no vendor import, backend registry, terminal initialization, account
login, real order submission, deployment or execution-enabled release here.

## Inspection and reuse

The original `simulation_sdk.py` already supplies a durable SQLite mock with
positions and fills. `observer_sync.synchronize` already creates immutable operation
references/mappings before dispatch, performs absolute-target reconciliation and
risk checks, and retains uncertain/reconciled/external-reduction holds. The
existing history reconciliation module can collect real terminal history, but
that credential/terminal-dependent path is not invoked or represented as tested.
The original IPC engine already validates strict authenticated frames, tenant/
account binding, replay nonces, controller leases/fences and durable request IDs.

Those components remain unchanged. The adapter adds a strict boundary around the
existing mock rather than reimplementing its positions/fills or reconciliation
logic. `AdapterEngine` subclasses CandidateEngine, wraps the already-created
SimulatedBroker, extends held-state reporting and provides a scoped execution
permit derived from the original authenticated request's lease/stop/deadline.
It inherits the original request dispatch and request-receipt persistence.

The existing candidate worker now selects AdapterEngine explicitly after installing
its vendor/network/process guards. Its bootstrap source hash closure includes the
adapter. There is no request/environment setting to select a real backend.
The older Wine bridge, SDK mock, production/demo entry points, controller protocol,
reconciliation journal and deployment files are not rewritten.

## Changed implementation files

- `vps-mt5-service/sdk_adapter_candidate.py`: structural reconciliation SDK
  protocol, strict synthetic adapter, additive durable adapter ledger/audit and
  AdapterEngine extension.
- `vps-mt5-service/native_windows_worker.py`: hardcoded AdapterEngine selection;
  existing environment/SDK/network guards remain first.
- `vps-mt5-service/windows_simulation_security.py`: add the adapter to the exact
  trusted source closure, retaining all existing path/DACL checks.
- `vps-mt5-service/tests/test_sdk_adapter_candidate.py`: 50 new offline contract,
  signed-engine and real Linux-reference worker tests.

Documentation and hash-bound evidence accompany those files. The original branch
and verified commit are retained; no push or merge is included in this checkpoint.

## Interface and synthetic-only backend

`ReconciliationSdk` describes the narrow interface consumed by synchronize:
account_info, symbol_info/select/tick, positions_get and send. The adapter exposes
only the immutable numeric constants needed by that reconciler; initialize,
login, order_send, terminal_info and arbitrary SDK methods are absent. Session/
terminal lifecycle and real history collection are deliberately outside this
reconciliation-only protocol, not silently provided by an implicit connection.

SyntheticSdkAdapter accepts only the exact existing SimulatedBroker type, a strict
SimulationOnly Binding, the matching private root and the engine's live StateLease
for observer.sqlite3. It verifies the actual SQLite file path and mock account
identity. It cannot accept a module, injected real backend or backend name. It is
not a production plug-in mechanism. The code uses only the already available
Pydantic and Python standard library; no dependency installation was required.

The child worker's existing guard rejects MetaTrader5 imports (including a
preloaded vendor module), TCP connections, UDP sends and subprocess/os.system
launches. It runs with the existing minimal environment, isolated source, signed
startup, private binary stdio and scoped ownership/stop controls. Trusted code and
runtime artifacts remain a prerequisite; these Python guards are not a sandbox
for hostile same-user native code. Native acceptance still requires an isolated,
no-egress VM. No OS firewall/ACL/production settings are changed by the adapter.

## Account, symbol and order contract

Only exact SimulationOnly client bindings are accepted. Broker/account/login/
server/role are matched against the bound mock descriptor and rechecked on reads.
Account snapshots must have the exact login/server, synthetic demo mode and
hedging margin mode, and finite positive equity. The mock's internal send delay
must be zero; all latency injection occurs *before* the final adapter gate, not
inside an uninterruptible delayed mock submission. Disconnected/unknown runtime
profiles are refused. This is a fixed synthetic profile, not broker discovery.

Only explicit fixture symbols `EURUSD` and `XAUUSD` are approved. No suffix guessing,
case normalization, automatic symbol mapping or arbitrary symbol discovery occurs.
Their mock specifications are validated for finite positive point/volume bounds,
ordered min/max and exact step-aligned min/max. Quotes must be finite, positive
and non-crossed. Position snapshots must be complete tuples with bounded size,
unique positive tickets, exact approved symbols, valid sides/magic and finite
step-aligned volumes/levels. An unavailable or malformed snapshot latches a hold.
The synthetic quote/point values are not evidence of real broker market data.

Requests use exact action-specific field sets. Boolean numeric impostors, NaN/
infinity, off-step/subminimum/oversized volumes, unsupported actions/sides,
unknown credential/backend fields, mismatched symbols and uncorrelated comments
are rejected. Operation comments retain the original `EC:` + 28 hexadecimal
reference so existing reconciliation mappings remain correlatable.

Creation, SL/TP modification, partial reduction and closure reuse SimulatedBroker.
Position modification/closure must match the same ticket, symbol and source magic;
closure must be opposite-side and cannot exceed the observed position. Protective
levels must be on the appropriate side of the synthetic quote. Exact duplicate
closure can return its saved receipt after the position has disappeared; it does
not create a replacement position. Only a validated full synthetic DONE receipt
is accepted. Rejected, partial/unsupported or inconsistent receipts remain held/
uncertain rather than being converted to full success. Pending-order/partial-fill
emulation and real market/session semantics are not implemented.

The original reconciler still supplies exposure caps, max trades, daily-risk
checks and final absolute-target reconciliation. Direct contract tests use an
explicit mock permit; no IPC client can supply its own permit, callbacks or SDK.

## Durable identity, idempotency and recovery

The existing observer journal remains the authority for account identity, request
receipts, allocation revisions, mappings and prior exposure. Completed work from
that engine can be wrapped additively: a regression test reuses its cached receipt
without a new fill or mapping. No existing fills/positions/receipts are rebuilt.

The adapter adds:

- `sdk_adapter_installation` in observer.sqlite3: a binding/version witness.
- `sdk_adapter_state`, `sdk_adapter_operations` and `sdk_adapter_audit` in the
  existing simulated-broker.sqlite3: persistent hold, operation fingerprints/
  phases/receipts and structured audit respectively.

The operation key hashes binding + correlation reference. An immutable request
fingerprint must match for a duplicate to return its stored receipt. A different
payload with the same operation is held. A processing/unknown operation or missing
receipt during recovery latches a hold. The original IPC request ID and nonce
rules remain independent, so exact wire replay and payload conflicts are also
rejected before an additional SDK fill.

An intent is committed before calling the mock backend. The existing backend
commits positions/fills; only a validated receipt then marks the adapter operation
done. These are deliberately **not** falsely described as one cross-journal atomic
transaction. A crash between them leaves a processing intent, which is never
inferred as no-fill from an empty snapshot or automatically replayed. The original
observer dispatching state, IPC processing state, adapter hold and native lifecycle
holds provide independent refusal paths. Adapter holds are also propagated to
the original observer/transport hold so reopening with the older mock engine
cannot bypass an adapter failure. There is no automatic hold-clear API.

A cross-file installation witness prevents deleting an installed adapter ledger
and recreating it as fresh authorization. Missing SDK files, missing observer
witness files or partial adapter schemas are refused. An interrupted first-time
installation may therefore require offline operator review rather than being
silently repaired. The adapter never drops/truncates prior tables or resets held.

## Deadlines, emergency stops and audit

AdapterEngine derives a private per-reconciliation permit from the existing
controller lease/fence, emergency-stop result and authenticated request deadline.
Every SDK send requires that permit and an open journal owner. The gate is sampled
again after synthetic latency and after the final account lookup. A stop/fence
change during either read/delay blocks the fill. Existing bridge-stop and native
account mirror semantics remain active; fresh clear mock metadata cannot clear an
adapter/observer/native persistent hold.

The adapter budget defaults to 250 ms, configurable only by trusted construction
within 10–1000 ms, and is capped by the request/lease deadline. Controlled synthetic
latency sleeps only up to the remaining budget; timeout then refuses submission.
Reads are checked against the SDK budget and writes are checked before/after the
known mock call. The outer worker/IPC launcher retains its bounded timeout/stop/
quiescence behavior. This cooperative mock deadline does not promise cancellation
of an arbitrary hung native SDK/kernel/storage call; a future real adapter must
remain isolated and provide independently verified termination/uncertainty rules.
The existing final-check-to-submit scheduling window also remains; this mock
result does not establish broker-safe stop latency. No unkillable SDK thread or
automatic resubmission mechanism is introduced.

FULL-synchronous SQLite audit records only static event, binding hash, hashed
operation reference and timestamp. It has a 10,000-entry capacity. Audit failure
or exhaustion blocks progress and holds. Raw SDK exceptions, requests, keys and
credentials are not returned/logged by this adapter. Storage failure cannot be
promised away; unreadable state is held and existing observer/IPC intents remain
an independent crash boundary. Real power-loss durability remains unverified.

## Dependency and native compatibility review

The simulation uses the existing Python 3.12/Pydantic/FastAPI environment and no
MetaTrader5 distribution. The old service pin MetaTrader5==5.0.45 has no published
cp312/cp313 Windows wheel or source distribution in the recorded official release
metadata. The separate infrastructure profile mentions Python 3.13/Wine 11 and
pins 5.0.6231; its cp312/cp313 wheel availability is not SDK/terminal acceptance.
Neither pin/profile was changed, selected or installed for this candidate.

Metadata sources reviewed in the prior environment investigation:
https://pypi.org/project/metatrader5/5.0.45/
https://pypi.org/project/metatrader5/5.0.6231/
https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py

Do not install service requirements or call vendor initialize as a simulation
probe: it can launch a terminal and use saved account credentials.

## Offline reproduction and evidence

From repository root with existing offline development dependencies:

```sh
python3 -m unittest discover -s vps-mt5-service/tests -p test_sdk_adapter_candidate.py -v
python3 -m unittest discover -s vps-mt5-service/tests -p test_native_windows_candidate.py -v
python3 tools/wine-simulation/test_harness.py
```

The full ordinary-user discovery excludes only the six root-publisher cases,
which run separately in a network-disabled container. Backend cases use the
existing exact release-readiness list with a new marked disposable loopback
PostgreSQL server. Pages, browser and Wine checks retain their existing fixtures.
No production startup command or database is used.

See the adjacent hash-bound evidence and recorded results below. Linux reference
processes and simulated Windows policy cases are not native Microsoft Windows
verification. The older Wine acceptance script still tests its original bridge;
it is a separate regression result, not native Windows or real SDK acceptance of
this adapter.

## Remaining blockers and next task

1. No native Windows runner is attached. Actual Win32 ACL/job/handle/lock behavior,
   native stop handling and recovery remain blocked. Run the adapter-backed
   candidate in the dedicated no-egress Windows simulation fixture before making
   any native compatibility claim.
2. The only backend is synthetic. Real SDK integration, terminal startup,
   connectivity, authentication, symbol discovery and order submission remain
   excluded. A protocol is a future seam, not an execution grant or completed
   production adapter.
3. A future adapter needs a reviewed matching Python/SDK/NumPy/terminal build,
   account + terminal-instance identity, authoritative/fresh market specifications,
   filling policies, partial/rejected/pending outcomes, coherent order/deal history
   snapshots and bounded isolated native-call failure handling. Reuse the existing
   mapping/history review semantics; never auto-clear uncertainty or infer no-fill.
4. Protected artifact/NTFS checks and name-to-handle race/power-loss acceptance
   remain native test requirements. No production emergency-stop provider or
   execution-enabled release is supplied.

Recommended next task: execute simulation-only contract/worker acceptance on an
isolated native Windows runner, then review the real-SDK interface requirements as
a separate design. Do not connect a broker or start real integration from these
Linux/Wine results.

## Recorded validation

All new adapter and candidate-worker results were produced on Linux using offline
synthetic data and explicit reference subprocesses. They do not certify native
Microsoft Windows or a real SDK/terminal.

| Set | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing backend/PostgreSQL/transport/copier | 39 | 0 | 0 |
| Existing Pages/output/proxy | 14 | 0 | 0 |
| Python discovery: 230 existing + 50 new | 280 | 0 | 0 |
| Existing root publisher/mirror, separate container | 6 | 0 | 0 |
| Existing Wine harness integrity/isolation checks | 9 | 0 | 0 |
| **Offline automated total** | **348** | **0** | **0** |
| Existing browser scenarios, separate | **2** | **0** | **0** |
| Existing Wine acceptance, separate | **6** | **0** | **0** |

All previous 298 offline cases remain passing. TypeScript, Python compilation and
whitespace checks passed. The final additional case confirms that an adapter hold
is also honored by the original mock engine, with no automatic hold removal.
Core tests used a new explicitly marked disposable PostgreSQL fixture with only
loopback access and generated test credentials. Browser enrollment used its
existing PGlite fallback; its static PASS message says PostgreSQL and must not be
read as proof of another native PostgreSQL browser run. Status recovery served
only the matching unchanged static build with intercepted API responses.

The Wine regression rebuilt a fresh network-disabled fixture with Wine 10.0 and
Windows Python 3.12.10 and passed the **existing** Wine bridge cases. It does not
execute the new adapter-backed native candidate. No native Microsoft Windows job
or real SDK/terminal test was run. The Python distribution metadata check found
no installed MetaTrader5 package on this development host.

Evidence: [verification manifest](evidence/simulation-sdk-adapter-20261110/verification.json),
[complete Python log](evidence/simulation-sdk-adapter-20261110/workers-final.log),
[existing Wine regression](evidence/simulation-sdk-adapter-20261110/wine-regression/native-acceptance.log),
and [file hashes](evidence/simulation-sdk-adapter-20261110/evidence-sha256.json).
Local raw logs, test harnesses and preserved generated test bundles remain under
`/workspace/work/sdk-adapter-candidate/`. Task containers, generated database
credentials, preview server and workers were cleaned up. No production Wine
prefixes, host emergency-stop files or production settings were modified.

No push, merge, deployment, broker connection, real order, emergency-stop removal
or trading activation is included. This is a local simulation-only review checkpoint.
