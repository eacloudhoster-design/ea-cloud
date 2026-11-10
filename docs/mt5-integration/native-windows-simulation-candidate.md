# Native Windows simulation launcher candidate — 2026-11-10

Branch: `feature/person2-native-windows-simulation-20261110`.
Base: `7f99fbb79ef3b5976c6640bda34b1ab5607b37e8`.

**Candidate only. Native Microsoft Windows execution has not been verified.**
The implementation uses synthetic accounts and the existing SQLite simulation SDK.
It contains no terminal launcher, vendor API integration, release activation,
production configuration changes, emergency-stop removal or account credentials.
The default constructor refuses Linux; its separately named `linux_reference`
factory is an offline test backend, not Windows compatibility evidence.

## Inspection and reuse

The existing WineBridge intentionally requires a Linux controller, Wine ELF
binaries, a Z: mount, POSIX ownership checks, process groups and a scoped wineserver.
The existing Windows stdio worker already demonstrates binary stdio/authenticated
framing under Wine, but that is not Microsoft Windows acceptance. Existing
`StateLease` already selects msvcrt non-blocking byte locking on Windows. Shared
CandidateEngine, SimulationController.request, request/response HMAC domains,
strict schemas, leases/fencing, deadline checking, replay protection, journal
identity and durable idempotency are reused unchanged.

The native candidate adds four files:

- `windows_simulation_security.py`: lexical Windows path policy, decoded ACL
  policy, read-only Win32 security/volume inspection and an unnamed Windows Job.
- `native_windows_candidate.py`: isolated stdio launcher, signed bounded startup,
  inherited shared request handling, controller ownership, account-scoped stop
  mirror verification, durable lifecycle audit/holds and bounded shutdown.
- `native_windows_worker.py`: synthetic worker, guarded entry, shared engine,
  signed readiness and authenticated request handling.
- `tests/test_native_windows_candidate.py`: Linux reference subprocess and
  simulated Windows policy tests. These are deliberately not a Windows job.

No existing IPC, simulation SDK, Wine bridge, root stop publisher, default emergency
checker, production launcher or existing test implementation was rewritten.

## Launch and isolation contract

The native path requires CPython 3.12 x64 and an application-local trusted runtime.
Use the existing pinned 3.12.10 AMD64 distribution for the eventual native test
fixture. The host's Linux reference interpreter version is recorded separately;
passing those tests does not establish behavior of the Windows interpreter.

Only the existing strict `Binding(simulation=True, server='SimulationOnly')` is
accepted. There is no configurable SDK backend. The worker imports the existing
NoVendor guard before creating CandidateEngine and refuses a preloaded vendor
module. It blocks Python TCP connections, UDP sends, os.system and subprocess
launches, and creates only the existing synthetic SDK. The child gets an explicit
minimal environment, no inherited broker/database credentials, no PYTHONPATH,
private TEMP/TMP/HOME, the verified interpreter via argv (no shell), `-I -u`, and
closed unrelated handles. On Windows SystemRoot comes from GetWindowsDirectoryW,
not an inherited environment override. Bootstrap keys travel only over the private
pipe and do not appear in argv, environment or audit records.

Runtime and source are trusted development artifacts. The parent inspects source
files and the application-local runtime tree, including dependency/DLL files.
This is not a sandbox for malicious same-user Python code or hostile native DLLs.
A no-egress VM remains required for native acceptance; the candidate does not
change Windows firewall/network policy or provision credentials/ACLs itself.

The worker uses binary stdio on win32 and existing bounded length-prefixed frames.
NativeBootstrap adds a literal backend to the shared strict bootstrap and pins
its full source closure, including the new security/launcher/worker files. A
random challenge, binding, interpreter hash, actual platform, version and default
stop/hold state are HMAC-authenticated in READY. No request is issued until this
handshake is validated. READY is never an execution grant.

## Native path, NTFS and account policy

- Only local absolute drive paths, bounded to 200 characters. UNC/device paths,
  drive-relative paths, traversal, ADS, reserved names (including superscript
  COM/LPT aliases), trailing dot/space, short-name aliases and ambiguous characters
  are rejected. Paths are checked canonically and every component is inspected for
  reparse points. GetDriveType must report a fixed disk and the filesystem must
  report NTFS. No long-path registry change is made.
- GetNamedSecurityInfo/GetAclInformation inspect owner and DACL facts. Unknown,
  null/empty or unsupported ACLs fail closed. Private state allows full owner
  control and optional SYSTEM access, not broad Users/Everyone or other-account
  access. The state root must have a protected DACL. Its allowed inheritable
  owner/SYSTEM ACEs may flow to child files; existing children are checked rather
  than assumed private from chmod bits. No DACL is created or changed by this code.
- Source/runtime may have read-only ACEs for other users but no untrusted write,
  append, deletion, delete-child, DACL or owner-change access. Non-volume ancestors
  must also pass the no-untrusted-write policy. This intentionally strict candidate
  expects a dedicated `C:\EA-SIM` tree; an ordinary shared/profile installation can
  be refused. SYSTEM/admin compromise and malicious same-user mutation are outside
  this development fixture's trust boundary.
- A separate native-controller StateLease fences launchers before lifecycle state
  changes. The existing worker's observer journal lock and immutable binding fence
  account/tenant identity independently. A conflicting owner cannot stop or mark
  the existing owner. Closing an already-closed launcher cannot modify a later
  owner's lifecycle state. Existing journals without native lifecycle metadata
  are refused for offline review, not silently adopted or reset.

The decoded ACL policy and permission-failure behavior are tested on Linux. The
ctypes ABI, Windows SID/ACE enumeration, actual DACL inheritance/denial, NTFS
reparse/race behavior, handle inheritance and msvcrt locks still need native tests.
Name-based inspection is not a substitute for native adversarial handle/reparse
race acceptance before any broader use.

## Windows simulation stop contract

The original Wine emergency-stop paths remain untouched. This new simulation
candidate does not invent a Z: mapping or use production credentials/stop files.
Its stop mirror is the existing explicit mock-only `mock-stop.json` inside the
validated private account root, with the existing strict schema:

`simulation=true`, exact binding digest, boolean `stopped`, integer `observed_ms`
and `expires_ms`, with at most three seconds freshness/lifetime. Missing, active,
stale, malformed, cross-account, replaced, redirected or unreadable metadata means
**stopped**. The private tree/ACLs and durable native lifecycle state are checked
again in the worker's stop checker, including the shared engine's final guard
before a mock send. A lifecycle hold, inactive/unavailable state, or missing audit
schema also means stopped. Stop checks never create missing lifecycle authorization.
Existing bridge-stop and original observer/transport holds remain enforced by the
unchanged CandidateEngine.

The candidate never writes a clear mirror, clears a latch, clears a hold or starts
trading. Tests explicitly write short-lived synthetic mirror fixtures to exercise
mock fills. A fresh synthetic clear mirror cannot override a persisted hold. This
is not a native production emergency-stop publisher or a production execution
approval mechanism. No such provider has been implemented or validated here.

## Lifecycle, recovery and audit

Startup readiness is bounded (default 10 seconds, max 30); request I/O retains the
existing 50–5000 ms bounds; graceful wait/terminate/kill phases are independently
bounded (default two seconds, max five per phase). Preflight, filesystem, OS launch
and individual Win32 calls are synchronous OS operations: these phase bounds are
not a guarantee against a kernel/storage call that never returns.

An unnamed Job Object is configured kill-on-close, with no breakaway, and the
child is assigned before sending bootstrap secrets/commands. Failure to contain
refuses startup and stops the child. Graceful EOF precedes terminate/kill; job
termination covers contained descendants. Quiescence requires the direct process
exit and zero active job processes. Unknown job shutdown retains controller
ownership and a strong quarantine reference for explicit later close/review; no
automatic restart/hold resolution runs. Linux reference mode has no Windows job;
its unconfirmed-job test uses explicit API mocks and is not real containment proof.

A FULL-synchronous SQLite lifecycle database records only static event names,
binding hash, timestamp and PID. Audit capacity is bounded to 10,000 entries;
audit/security failure stops progression. It records an active session before
launch. Startup/crash/disconnection/timeout failures latch `held=1`; an interrupted
active session latches a hold during the next launch. A confirmed failure also
reuses the original observer transport-hold function. If that write or its audit
cannot be confirmed, the shared response reports TRANSPORT_HOLD_UNRECORDED with
uncertainty rather than claiming a recorded observer hold; independent native
holds and fail-closed stop checks remain active. Clean close can mark only
its own active session inactive; it never resets held. Missing/corrupt lifecycle
metadata or missing audit schema is refused without recreation. SQLite connections
are explicitly closed; existing state is not truncated or rebuilt.

If storage/security inspection fails, the candidate fails closed and the worker
also treats state as stopped. Durable write failure cannot be promised away; an
interrupted active session, existing observer hold and retained ownership are
independent checks. No native crash/power-loss durability claim is made yet.

## Version compatibility and excluded SDK

The existing service requirements still pin MetaTrader5 5.0.45, whose official
PyPI files have no cp312/cp313 Windows wheel or source distribution. The separate
infrastructure profile pins 5.0.6231/Python 3.13/Wine 11; that profile is not this
candidate and is not an installed/validated environment here. Official release
metadata for 5.0.6231 lists cp312/cp313 win_amd64 wheels, but wheel availability is
not terminal/NumPy/runtime acceptance. No SDK version was changed or installed.
Do not install `vps-mt5-service/requirements.txt` to test this candidate. Use only
the simulation lock's pure Python/Windows Pydantic dependencies.

Sources reviewed during environment discovery:
https://pypi.org/project/metatrader5/5.0.45/
https://pypi.org/project/metatrader5/5.0.6231/
https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py

Vendor initialize can auto-start a terminal and use saved credentials. It is not
a safe no-login startup probe and is never called by this candidate.

## Offline reproduction

From repository root with the existing offline Python dependencies:

```sh
python3 -m unittest discover -s vps-mt5-service/tests -p test_native_windows_candidate.py -v
python3 tools/wine-simulation/test_harness.py
```

The new tests exercise Windows lexical paths, decoded NTFS ACL refusal, real
Linux reference subprocess framing/readiness, no-vendor/TCP/UDP/process guards,
leases/replay/idempotency, tenant/account conflicts, startup timeout/forged READY,
crash after fill/lost receipt, unexpected exit, unavailable stop state, stop changes
during send delay, persistent recovery holds, audit failure/capacity, lifecycle
corruption/deletion, ownership retention and old-controller close safety.

The complete standard suite still uses the recorded backend list in
`person2-release-readiness.md`, disposable marked PostgreSQL, ordinary-user Python
discovery, six root-publisher cases in a separate container, Pages and nine Wine
harness checks. None of the production worker startup commands are run.

## Eventual native smoke validation (blocked here)

Provide a dedicated no-egress Windows x64 VM, a non-admin fixture identity,
protected private NTFS root, trusted source and application-local CPython 3.12 x64
with matching simulation wheels. The default constructor will refuse unsuitable
paths/ACLs; do not relax it to make an arbitrary host pass. Do not include the real
SDK, a terminal, saved accounts, production configurations or credentials. Native
operator provisioning belongs only in that dedicated development image.

A basic native-only script can import Binding, prepare_simulation and
NativeWindowsSimulation from the staged source, prepare a new empty marked state
directory, construct the launcher, assert `ready.platform == 'win32'`,
`ready.stopped is True` and `ready.financial_execution is False`, acquire a lease,
request synthetic status and close with confirmed quiescence. Do not create a
clear mirror for the initial smoke test. Follow with adversarial ACL/reparse,
second-user isolation, Job Object, native lock, stop-state and recovery scenarios.
Do not run the Linux reference unittest module as though it were native acceptance.

Native Microsoft Windows and graphical MT5 are unavailable in the current
attached environment. No native acceptance count or graphical startup result is
claimed. The next task is to execute that native-only simulation acceptance on a
properly isolated runner and inspect its OS/build/DACL/job/lock evidence. Real
MT5 SDK integration, graphical terminal startup and live execution remain separate
and unauthorized by these candidate results.

## Recorded validation at this checkpoint

All results below were collected on the Linux development runner. Windows path
and ACL policy cases use offline facts/mocks; new subprocess cases use the explicit
Linux reference backend. A `win32` platform string alone would not attest a native
Microsoft kernel (Wine also reports it); native host OS/build evidence is required.

| Set | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing backend/PostgreSQL/transport/copier | 39 | 0 | 0 |
| Existing Pages/output/proxy | 14 | 0 | 0 |
| Ordinary-user Python: 186 existing + 44 new | 230 | 0 | 0 |
| Existing root publisher/mirror, separate container | 6 | 0 | 0 |
| Existing Wine harness integrity/isolation checks | 9 | 0 | 0 |
| **Offline automated total** | **298** | **0** | **0** |
| Existing browser scenarios, separate | **2** | **0** | **0** |
| Existing Linux-to-Wine acceptance, separate | **6** | **0** | **0** |

All previous 254 offline cases remain passing, with 44 additional cases.
TypeScript, Python compilation and whitespace checks pass. The backend tests used
only a freshly marked disposable loopback PostgreSQL fixture and synthetic workers.
The browser enrollment rerun used its existing PGlite fallback; its fixed PASS
message says PostgreSQL and is not proof of a native PostgreSQL browser fixture.
The existing Wine fixture rebuilt in a fresh network-disabled container and passed
with Wine 10.0/Windows Python 3.12.10; it executes the existing Wine bridge, not the
new native candidate, and must not be read as native Windows verification.

**Native Microsoft Windows: not run, blocked by absence of a runner.** No native
startup, NTFS permission, Job Object, process-tree, IPC, ownership or recovery
acceptance result is claimed. No graphical terminal or SDK test was attempted.

Evidence: [verification manifest](evidence/native-windows-simulation-20261110/verification.json),
[ordinary-user Python log](evidence/native-windows-simulation-20261110/workers-final.log),
[Wine regression](evidence/native-windows-simulation-20261110/wine-regression/native-acceptance.log),
and [artifact hashes](evidence/native-windows-simulation-20261110/evidence-sha256.json).
Local raw logs and test harnesses are retained under
`/workspace/work/native-windows-candidate/`; generated test bundles were preserved
there rather than included in the source checkpoint. Temporary task containers,
fixture credentials, preview server and simulation workers were cleaned up.

No push, merge, deployment, production change, broker/terminal launch, real order,
stop removal or trading activation occurred. The next step is native simulation
acceptance on an isolated Windows runner, not real SDK integration.
