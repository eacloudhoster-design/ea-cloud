# Person 2: integrated history mode across the Linux-to-Wine bridge

Branch: `feature/person2-wine-history-acceptance-20261110`.
Base: `b77572d5bd908e4167337cdc689dcc331c978fe1` on
`feature/person2-worker-history-ipc-20261110`. Its clean checkout, recorded
501-test checkpoint, evidence hashes and source hashes were verified before
branching. The original checkpoint remains unchanged.

## Integration and safety boundary

`WineHistoryBridge` extends the existing `WineBridge`, using the same disposable
prefix preparation, trusted runtimes, process groups, binary framing, signed
readiness, bounded requests/shutdown and prefix-quiescence proof. The explicit
`trade-history-wine` bootstrap selects the existing `HistoryWorkerEngine`, which
runs the existing shared lease authority and SQLite event book in **Windows
Python under Wine**. Both signed outer frames and the derived signed authority
frames retain account, controller, nonce, request ID, deadline, lease and fence
identity. Pure history receipt validation is shared with the Linux-reference
native-worker candidate. No order reducer, fill implementation, history algorithm,
or fencing implementation has been recreated.

`prepare_wine_history` only provisions a new empty private synthetic fixture.
A bound Wine-only marker keeps absolute-target, native-worker and Wine-history
fixtures separate. The default bridge protocol is unchanged; it refuses history
roots. The native history launcher refuses Wine-marked roots. No execution body
can select a runtime, filesystem path, SDK, service or arbitrary method.

The Linux controller validates the complete private fixture tree before startup
and each request and retains a Unix authority lock throughout the child lifetime.
The Windows process independently uses its existing Windows file lock. Neither
lock is assumed to fence the other platform. The Linux lock is released only
when both the worker process and that exact disposable Wine prefix are proven
quiescent; otherwise ownership remains quarantined. Reference-mode tests use the
Linux child's authority lock, avoiding a false double acquisition of one Unix
lock.

The scoped `WineMappedInspector` checks canonical Z-drive paths, root containment,
reserved names, reparse points and fixture identity. It is available only inside
the explicit Wine worker scope; ordinary Linux permission checks and default
Windows rejection stay in effect outside that scope. The trusted Linux bridge
attests the Wine launch and enforces Unix permissions. This scope is **not** an
NTFS ACL inspector and is not a native Windows compatibility claim. Child-created
files inherit a private Unix umask. The runtime is still the existing pinned
Wine 10.0 and Windows CPython 3.12.10 extraction.

A fresh account-bound synthetic stop mirror, the sticky top-level bridge stop,
existing account holds, controller leases and monotonic fences all gate history
execution. A sticky bridge stop blocks execution independently of a shared hold.
No reconciliation, restart, successful probe, duplicate request or restored
mirror clears a hold. Transport failure stops the child and prefix before the
host latches shared account state; unproven shutdown or hold writes remain
uncertain. No production stop, Wine prefix, configuration, terminal or trading
account is read or modified.

The same REQUEST/RESULT audit IDs correlate IPC responses with durable event-book
records. Acceptance exports per-scenario synthetic positions, sequence/digest,
hold state, worker platform and request/result IDs in
`history-scenarios.jsonl`. Startup refusal diagnostics contain exception type and
bounded source locations, with no bootstrap key or request payload. Diagnostic
files have private permissions and bounded startup capacity.

## Reproducible acceptance

Use the existing harness and verified artifact cache:

```sh
python tools/wine-simulation/run.py run --cache /path/to/verified/cache --evidence /new/evidence/directory
```

The source allowlist includes the complete integrated history dependency closure.
The artifact lock is unchanged: no system package installation or privileged
runtime change is required. Each invocation creates a new network-disabled,
read-only-root, non-root container and disposable prefixes, then destroys them.
The harness preserves the original six scenarios and runs the new history suite
in a separate invocation with separate counts, logs and blocked-case accounting.
Missing runtimes, class-setup failures, missing cases or skips fail the job.

The new real-Wine scenarios cover partial fills and multiple deals, pending order
modification, partial closure and cancellation, durable event/RPC duplicates after
restart, out-of-order and conflicting events, committed-fill crashes, owner
conflicts and stale fences, active/missing/sticky stops, stop changes during worker
delay, IPC disconnection, timeouts before dispatch and after commit, read-only
restart reconciliation, corrupt history, bad signatures, replay, account identity,
mode separation and audit correlation. Linux reference tests are reported
separately from real Wine execution.

Final offline results: 526 automated tests passed (all 501 existing cases and
25 new cases), with 0 failures and 0 skips. Both browser scenarios passed. The
Wine suites are counted independently: 6 existing and 17 new history-mode cases.

Final exact results, source hashes, commands and dependency versions are recorded
in `evidence/wine-history-20261110/verification.json`. The complete existing
501-test suite, new offline tests, both browser scenarios, TypeScript/Python/
whitespace checks, six original Wine cases and new history Wine cases have
separate evidence.

## Runtime diagnosis and remaining blockers

Initial history startup was safely refused because an unused native inspection
import eagerly loaded `_ctypes`. The pinned minimal Wine runtime reports
`DLL load failed while importing _ctypes: Module not found`. The embedded archive
contains `_ctypes.pyd` and `libffi-8.dll`; the loader dependency failure was not
repaired or declared resolved. Native ACL/job APIs now import ctypes only when
constructed and still require it; they are never replaced by mocks in the native
Windows path. History mode uses host-validated mapped files and does not require
those native APIs. The runtime startup evidence records this remaining limitation.
Existing nonfatal Wine font/32-bit rundll32 warnings remain visible in raw logs.

This acceptance certifies only the synthetic history mode in the pinned Wine
fixture. Native Microsoft Windows, native ACL/job behavior, graphical MT5,
MetaTrader5 SDK calls, brokers and real execution remain unverified and excluded.
A native Windows runner and a fully functional native API runtime are required
before any native Windows compatibility claim. There is no release activation.

The authority remains a local serialized simulator. Whole-root rollback, hostile
same-user writers, kernel/storage hangs, larger histories, external deal ingestion,
replicated cross-host coordination and operator hold-release policies require
separate designs. Existing event bounds, two-second leases and request deadlines remain unchanged.
Wine mode has a fixed 1.5-second operation budget because Windows file checks
exceeded the original 500 ms budget on a multi-deal lifecycle; the existing Linux
mode retains 500 ms. Neither budget can be selected by an event body. Tests prove
that Wine budget exhaustion and lease expiry still roll back effects and hold. Recovery
never replays effects or repairs/clears a safety hold automatically.

Recommended next task: review the Wine acceptance evidence and separately diagnose
the optional ctypes/native API dependency chain, then validate filesystem and
ownership behavior on an isolated native Windows runner. Do not introduce real
MT5 integration to unblock those checks. This branch is committed locally only;
no push, merge, deploy, production change, broker connection or trading activation.

## Changed files

- `tools/wine-simulation/run.py`: require both complete, well-typed suite results.
- `tools/wine-simulation/test_harness.py`: reject missing, blocked, skipped, failed
  and malformed acceptance summaries.
- `tools/wine-simulation/artifacts.py`: explicit complete simulation source closure.
- `tools/wine-simulation/fixture.py`: separate history job and runtime diagnostics.
- `tools/wine-simulation/suite.py`: independent counts and blocked-case accounting.
- `vps-mt5-service/framed_stdio.py`: explicit Wine history bootstrap and hashes.
- `vps-mt5-service/history_authority_simulation.py`: trusted bounded policy hook;
  existing default stays 500 ms.
- `vps-mt5-service/native_history_pipeline.py`: reuse pure receipt validation and
  engine authority factory; refuse Wine fixtures in the native launcher.
- `vps-mt5-service/shared_lease_simulation.py`: scoped Wine-only private inspector.
- `vps-mt5-service/windows_simulation_security.py`: defer native ctypes import;
  native ACL/job APIs still require the actual library and checks.
- `vps-mt5-service/wine_bridge.py`: protocol guard, private child umask and bounded
  static startup diagnostic capture.
- `vps-mt5-service/wine_worker_entry.py`: explicit history factory, scoped mapping,
  sticky stop enforcement and static startup refusal locations.
- `vps-mt5-service/wine_history_candidate.py`: history bridge, ownership and audit
  integration, fixed Wine budget and persistent fail-closed holds.
- `vps-mt5-service/wine_history_paths.py`: scoped mapped-path validation.
- `vps-mt5-service/tests/test_wine_history_candidate.py`: offline regressions.
- `vps-mt5-service/runtime_tests/wine_history_acceptance.py`: new real-Wine cases.
- This report and `evidence/wine-history-20261110/`: validation records and hashes.
