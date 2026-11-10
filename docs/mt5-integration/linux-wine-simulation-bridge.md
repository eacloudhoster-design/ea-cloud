# Person 2 isolated Linux-to-Wine simulation bridge — 2026-11-10

> Historical implementation checkpoint. The runtime blocker below was subsequently
> resolved in isolation. See [reproducible Wine validation](reproducible-wine-tests.md)
> for the later six-case native results and repeatable testing setup.

Base commit: `4f40c556fbb85c146f98f25a182e0d7090a91c11`.
Branch: `feature/person2-linux-wine-simulation-bridge-20261110`.

**Status: bridge implementation and Linux reference validation complete; actual
Windows/Wine acceptance is BLOCKED before worker startup. Do not infer Wine or
production readiness from the reference results.**

## Inspection and reuse

The previous candidate's inherited multiprocessing handles require a common
Python platform. They cannot simply be handed from Linux Python into Windows
Python under Wine. The new bridge therefore carries the same authenticated byte
messages over private subprocess stdin/stdout with a four-byte network-endian
length prefix. It does not introduce sockets or untrusted pickle decoding.

`WineBridge` reuses `SimulationController.request`: HMAC verification, request IDs,
nonces, binding checks, response schemas, leases, fencing, deadlines and timeout
handling remain the existing implementation. `CandidateEngine`, the synthetic SDK,
observer synchronization and durable journal remain the worker implementation.
`record_transport_hold` factors the existing hold SQL so a Linux bridge that already
owns the journal lock can preserve a hold without reacquiring its own lock.

New source files: `framed_stdio.py`, `wine_worker_entry.py`, `wine_bridge.py`.
Existing source changed: `sdk_ipc_candidate.py` (hold helper/hook plus sticky bridge
stop awareness). New validation: `tests/test_wine_bridge.py` and the explicit
`runtime_tests/wine_bridge_acceptance.py` job. No existing account worker, backend
route, production startup or deployment configuration is replaced.

## Implemented lifecycle contract

- Only explicit `Binding(simulation=True, server='SimulationOnly', role='client')`
  is accepted. No vendor SDK is installed/imported/selected by this code. The
  stdio worker also blocks vendor imports and Python TCP connections. All existing
  responses retain `financial_execution=False`.
- Linux-only controller, separate private account state and marked prefix, no
  adoption of unmarked/nonempty prefixes. `prepare_prefix` creates a marker in an
  empty fixture only; it does not run Wine or initialize an existing installation.
- Absolute canonical paths; ambiguous Windows components, traversal, symlinked
  inputs, untrusted ownership/modes, non-ELF launchers and non-PE Windows Python
  are rejected. Wine uses an explicitly verified `Z:` mapping to `/`. Spaces are
  passed as separate argv elements; no shell interpretation occurs.
  The Linux reference fixture permits only the exact already-running interpreter
  with non-writable mode when a managed sandbox maps system ownership to nobody;
  Wine binaries and source files retain root/current-user ownership checks.
- Source hashes pin the child entry and its dependency closure. A random startup
  challenge is authenticated in READY together with binding, actual platform,
  interpreter hash/version, stop and hold state. READY is not an execution grant.
- Bootstrap keys travel only through the private pipe, never argv/environment.
  The child sets Windows stdio to binary mode and reserves stdout for frames;
  CRLF translation and arbitrary text cannot be mistaken for protocol data.
- Startup is bounded (default 15 s, maximum 30 s), request I/O reuses the existing
  50–5000 ms bound, and shutdown waits are separately bounded (default 2 s, maximum
  5 s per phase). A supervised thread also bounds partial reads/blocked writes.
- A lifecycle lock fences each prefix and account. Wine mode additionally holds
  the existing Linux journal flock while the Windows worker retains its native
  msvcrt journal lock. These lock namespaces are not assumed interchangeable.
  Their intended cross-runtime behavior remains an actual-Wine acceptance gate.
- A busy prefix is refused using bounded `wineserver -w` before launch; it is not
  killed to make startup succeed. Child processes use a new process group and a
  minimal environment. Cleanup targets only that group and that marked prefix's
  explicit wineserver binary. No global Wine kill/process-name sweep is used.
- Graceful EOF precedes termination/kill. Prefix shutdown always requires bounded
  `-w` confirmation, even if `-k` reports an already-exited server. Unknown shutdown
  retains ownership and a sticky stop; close is idempotent and cannot terminate a
  later owner. Request/audit/close operations are serialized by the bridge lock.
- A crash, timeout, invalid READY or lost reply creates `bridge-stop.json`, fsyncs
  file and directory, stops the owned runtime, and records the existing SQLite
  transport hold after confirmed quiescence. The sticky marker is independently
  honored by standalone/recovered candidates, including immediately before sends.
  Recovery never removes the marker, clears journal holds or retries a command.
- Private, bounded, fsynced `bridge-lifecycle.jsonl` records only static events,
  time, binding hash and PID. Keys, lease tokens, raw frames and arbitrary child
  exception text are excluded. Audit failure blocks further progress.

The default worker uses the existing fail-closed emergency checker and mirror.
Tests can explicitly select expiring **mock-only** stop metadata in their private
simulation state; malformed, missing or stale metadata remains stopped. No host
acceptance latch, production mirror or execution grant is modified.

## Verification results

The 214-case checkpoint and both browser scenarios were reproduced before source
edits. The complete standard offline set after implementation is:

| Set | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing backend/PostgreSQL/transport/copier | 39 | 0 | 0 |
| Existing Pages/output/proxy | 14 | 0 | 0 |
| Ordinary-user Python discovery | 186 | 0 | 0 |
| Root publisher/mirror tests in isolated container | 6 | 0 | 0 |
| **Standard automated total** | **245** | **0** | **0** |
| Existing browser scenarios, separate | **2** | **0** | **0** |

The 186 Python cases include all 155 baseline cases and **31 new reference-process
cases**. New coverage includes binary/partial framing, strict bootstrap, Windows
path rules, execution failure, startup timeout, forged startup challenge, early
exit, crash after synthetic fill, lost completed reply, IPC timeout, expired stops,
ownership conflicts, concurrent idempotent requests, uncertain shutdown, busy
prefix refusal, permissions, key redaction and persistent recovery holds. TypeScript
and whitespace checks pass. Frontend source is unchanged; both browser scenarios
use matching existing bundles.

### Actual Wine job — blocked, not a passing or skipped test set

The explicit six-case Wine acceptance job was attempted in a disposable,
network-disabled container as UID 1000, with read-only source/runtime mounts and
private tmpfs Wine/state directories. It reported **0 cases executed, 1 setup
error, 0 skipped**. Fixture preparation exited **53** before Windows Python/worker
startup. The independent loader probe reports:

```text
wine: ... unimplemented function user32.dll.CreateDialogParamW ...
wine: could not load kernel32.dll, status c0000135
```

These are development runtime/environment failures, not passing Windows tests.
The native job does not silently skip absent/broken prerequisites.

Attempted artifacts: Debian 13 Wine `10.0~repack-6` and its downloaded dependency
closure; official embedded Windows Python `3.12.10` x64; binary-only Windows
FastAPI `0.141.1` and Pydantic `2.13.4` dependencies. Artifact SHA-256 values are
retained in the local verification manifest. No MetaTrader5 package was present.
The container base was
`python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b`.

The first full Wine image could not start because Docker's VFS copy exhausted
workspace disk. Only the image and exact build-cache entry created for this task
were removed. Subsequent attempts extracted Wine/dependencies into container tmpfs,
fixed executable mount/library/home prerequisites, and reached the loader failure
above without exhausting disk. No production host/runtime was accessed or changed.

## Reproduction and evidence

From repository root with existing Python dependencies:

```sh
python3 -m unittest discover -s vps-mt5-service/tests -p test_wine_bridge.py -v
```

The complete standard set uses the existing marked disposable PostgreSQL/PGlite
fixtures and core list in `person2-release-readiness.md`, all ordinary-user Python
tests, the six root publisher cases separately, Pages tests and both existing
browser scripts. The exact external harness remains in
`/workspace/work/wine-bridge/run.py` and `/workspace/work/stop-fix/python-suite.py`.

For a known-good isolated Wine development environment, explicitly prepare a new
marked prefix, then run the native job with canonical paths to verified binaries:

```sh
EA_WINE_EXE=/verified/wine64 EA_WINESERVER=/verified/wineserver64 \
EA_WINDOWS_PYTHON=/verified/embedded-python/python.exe \
python3 vps-mt5-service/runtime_tests/wine_bridge_acceptance.py
```

The job creates only disposable marked prefixes, initializes them using the
synthetic runtime, and never connects a broker. Its planned cases cover signed
win32 readiness/default stop, mock SDK idempotency across restart, Linux and native
Windows lock conflicts, crash/stop recovery, timeout/quiescence and prefix-scoped
cleanup preserving another worker. **None of those six cases is accepted yet.**

Local evidence: `/workspace/work/wine-bridge/baseline/`,
`/workspace/work/wine-bridge/after/`, `runtime/probe.log`, and
`/workspace/work/wine-bridge/verification.json`. The manifest binds logs, source
hashes, baseline/fix SHAs and downloaded runtime artifacts. Setup/probe scripts
and dependency archives remain under `runtime/` for investigation.

## Remaining blockers and limits

1. Supply a known-good, approved **development-only** Wine/Windows Python runtime
   that starts successfully; resolve the observed loader failure before accepting
   real cross-runtime compatibility. No production access or broker credentials
   are needed for this gate.
2. Execute all six native cases. Windows binary stdio, path resolution, native
   msvcrt locking alongside Linux flock, Wine helper quiescence and private-prefix
   isolation remain unverified. Native Windows ACL/DACL acceptance also remains
   separate from Linux permission/reference checks.
3. Bounds apply per startup/I/O/cleanup phase, not to an instantaneous total stop.
   OS refusal to terminate, filesystem/audit failure or unconfirmed quiescence
   retains a failed controller and sticky stop for operator review. No automatic
   hold-resolution workflow exists.
4. Existing mirror freshness and final check-to-submit windows remain. This code
   only exercises a synthetic SDK and does not establish broker execution, fill
   correctness, real latency, or an execution-enabled release.

This branch is a local review checkpoint. No push, merge, deployment, production
configuration change, broker connection, real order, stop removal or trading
activation occurred. Further compatibility acceptance remains blocked as above.
