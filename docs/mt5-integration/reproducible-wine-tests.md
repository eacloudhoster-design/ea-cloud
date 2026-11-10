# Reproducible isolated Wine simulation tests — 2026-11-10

Branch: `feature/person2-reproducible-wine-tests-20261110`.
Base: `b2ffb91f0fd3eb1474bb16eaed2af912c06a6eed` on
`feature/person2-linux-wine-simulation-bridge-20261110`.
The existing worker, bridge, safety gates and six native scenarios are unchanged.
No push, merge, deployment, production configuration change or trading activation
is included in this checkpoint.

## Implementation and reproduction

See [the harness instructions](../../tools/wine-simulation/README.md) for the
complete acquisition and execution commands. All files are under
`tools/wine-simulation/`:

- `runtime.lock.json`: immutable base image digest and SHA-256 pins/versions/URLs
  for 182 Debian, Windows Python and Python-wheel archives.
- `artifacts.py`: shared lock validation and streaming integrity verification.
- `run.py`: public-artifact acquisition, simulation source snapshot, local-only
  Docker launcher, bounded job and exact-container cleanup, evidence collection.
- `fixture.py`: non-root extraction to tmpfs, private runtime relocation,
  version/guard/interpreter probes and native-suite invocation.
- `sitecustomize.py`: independent vendor-import and IPv4/IPv6 connection/UDP guard.
- `suite.py`: unchanged native scenarios with explicit case-count/error reporting.
- `test_harness.py`: nine offline integrity/isolation boundary checks.

No vendor requirements are installed, and no production credentials are needed.
Wine package maintainer scripts are not run. The pinned runtime is extracted
only under a new container tmpfs and relocated there. The corrections address
Debian's absolute wineserver dispatcher, relative NLS lookup, Windows zlib DLL
lookup and Linux ELF library lookup. They reproduce the previously successful
manual diagnosis without changing the application or relaxing its minimal child
environment. Docker enforces `network=none`, non-root operation, read-only root,
capability removal, no privilege escalation, process/memory limits and an explicit
source allowlist. No home, credentials, production prefix, production stop state,
or Docker socket is mounted into the fixture.

## Clean validation

Acquisition began with an empty `/workspace/work/repro-wine/clean-cache` and fetched
all **182** hash-verified archives from public recorded URLs. Two separate Docker
runs then extracted fresh runtime trees and created new prefixes. Neither run
used the manual diagnosis's extracted Windows Python, installed Linux packages,
or an initialized Wine prefix. Both used the same verified archives, which are
inputs rather than mutable installed state.

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing backend/PostgreSQL/transport/copier cases | 39 | 0 | 0 |
| Existing Pages/output/proxy cases | 14 | 0 | 0 |
| Existing ordinary-user Python worker cases | 186 | 0 | 0 |
| Existing root publisher/mirror cases, separate container | 6 | 0 | 0 |
| **Existing offline baseline** | **245** | **0** | **0** |
| New harness integrity/isolation checks | 9 | 0 | 0 |
| **Combined offline cases** | **254** | **0** | **0** |
| Existing native Wine scenarios, each of two clean runs | **6** | **0** | **0** |
| Existing browser scenarios, separate | **2** | **0** | **0** |

The six native cases are six distinct scenarios, not twelve new tests. Both clean
runs also passed Windows Python startup, guard checks, Linux Python startup and
a minimal Windows command executable. Wine reports `wine-10.0 (Debian 10.0~repack-6)`;
Windows Python is `3.12.10` AMD64, Pydantic `2.13.4`, FastAPI `0.141.1`, and SQLite
`3.49.1`. The artifact lock records the full dependency closure. TypeScript and
whitespace checks passed. Frontend sources are unchanged and existing matching
built bundles were used for browser scenarios.

The core cases used a fresh marked disposable loopback PostgreSQL 16 server,
with a generated private test password and no production DATABASE_URL. The final
extra enrollment browser rerun used its existing PGlite fallback; its static PASS
message says PostgreSQL, so that message alone must not be read as proof of a
second PostgreSQL-backed browser run. Status-recovery browser used the loopback
static build with intercepted APIs and zero API writes. Root-gate cases ran as
root only in their separate networkless disposable container, with no host
safety paths; the Wine runtime itself always ran as UID 1000.

The first overlapping standard-suite attempt hit host Docker VFS disk exhaustion:
24 Python errors plus one assertion failure under resource pressure, and a blocked
root-container/browser start. After the database tests completed, the task's own
PostgreSQL container was removed and those checks were rerun successfully. These
initial logs are retained alongside final logs; they are not counted as successful
runs. The first capability-free root-gate bind also could not traverse a private
source directory; a minimal read-only source snapshot with readable permissions
fixed the test fixture without changing the source. Keep resource-heavy suites
sequential on this runner. No daemon storage settings or system packages changed.

## Evidence

[Verification manifest](evidence/wine-simulation-20261110/verification.json) records
counts and harness hashes. [Evidence hashes](evidence/wine-simulation-20261110/evidence-sha256.json)
bind the retained logs and structured results. Each clean run has an input hash
manifest and isolation metadata:

- [First clean native run](evidence/wine-simulation-20261110/clean-run-1/native-acceptance.log).
- [Second clean native run](evidence/wine-simulation-20261110/clean-run-2/native-acceptance.log).
- [Second Windows startup](evidence/wine-simulation-20261110/clean-run-2/windows-python-startup.log).
- [Harness checks](evidence/wine-simulation-20261110/harness-tests.log).
- Final standard-suite and browser logs: `evidence/wine-simulation-20261110/offline/`.

Full local cache, acquisition/rerun logs and generated test bundles are retained
under `/workspace/work/repro-wine/`; these artifacts are not committed. Task
containers and local preview server were stopped; no Wine prefixes persist.

## Remaining limits and next task

There is no current blocker to reproducing these **Wine simulation** checks on a
suitable Linux runner. Long-term public mirror availability is not guaranteed:
retain the byte-verified artifact cache in an approved development artifact store;
never resolve missing pins to newer packages automatically. Docker VFS resource
limits require sufficient free disk and memory. Headless font/display and missing
32-bit-helper warnings remain in startup logs; graphical and 32-bit operation are
not certified.

Actual Microsoft Windows ACL/DACL behavior, a graphical MT5 terminal, the vendor
SDK, broker connections and real execution remain unverified and excluded. The
existing check-to-submit/freshness limitations and sticky-hold operator recovery
requirements are unchanged. Passing this harness grants no execution permission.

Recommended next task: run this same committed harness on an independent clean
Linux runner and arrange a separate native Windows simulation-only acceptance job
for Windows-specific filesystem/security behavior. Do not begin real MT5 SDK
integration or clear any safety hold based on this Wine result.
