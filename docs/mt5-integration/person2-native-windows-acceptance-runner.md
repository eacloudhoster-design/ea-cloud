# Native Windows acceptance preparation

Base checkpoint: `fb37e9a61c7af4f92941de7dad4ffa7afbe684ee` (verified clean).
Development branch: `feature/person2-native-windows-acceptance-runner-20261110`.

## Inspection and justified gap

The existing `NativeWindowsSimulation` already provides a fixed synthetic worker
launch, authenticated readiness/private stdio, strict Windows path/NTFS/ACL
inspection, controller and observer ownership locks, bounded startup/shutdown,
Job Object containment, durable deduplication and persistent recovery holds. Its
worker installs vendor/network/native-launch guards. The existing SDK protocol,
assigned execution gateway and single-authority deployment restrictions remain
suitable; none was rebuilt. The previous preparation checkpoint hardened static
terminal/journal review, but this does not verify actual NTFS paths or grant
execution permission.

The existing native candidate report described an eventual manual smoke script,
not an executable native-only acceptance runner. Existing Wine harnesses validate
a different bridge; the Linux reference unit tests are not native acceptance.
Integrated history mode explicitly refuses the Windows backend in
`native_windows_worker.py`; this restriction was preserved.

## Exact changes

- `tools/windows-simulation/acceptance.py`: native-only six-scenario runner,
  reusing the existing launcher/protocol and runtime lock. Refuses Linux, detected
  Wine, wrong Python version/bitness, mismatched dependency versions, a preloaded
  or installed vendor SDK, unsuitable ACLs/paths, prior scenario state and
  nonempty evidence. Installs parent vendor/TCP/UDP guards. Saves host/runtime/
  source hashes, dependency versions, exact counts and unittest logs. Initial
  startup defaults stopped; only explicit account-bound synthetic fixtures receive
  mock mirrors for duplicate/recovery tests. Existing holds are never cleared.
- `tools/windows-simulation/README.md`: native fixture provisioning, hash-locked
  runtime reuse, protected per-scenario NTFS directories, exact invocation,
  evidence/recovery handling, no-egress requirement and remaining milestones.
- `vps-mt5-service/tests/test_windows_acceptance_runner.py`: seven targeted Linux
  tests for blocked CLI, evidence preservation, Wine refusal, dependency/vendor
  refusal, guards, protected-root layout checks and the six scenarios using only
  the explicit Linux-reference backend.

No production configuration, dependency pin, existing simulation implementation,
worker, IPC schema, SDK boundary, lease/fencing, gateway, stop or journal changed.
No new infrastructure dependency. No SDK or terminal was installed or invoked.

## Validation scope

Final ordinary-user Python suite: **486 passed, 0 failed, 0 skipped** (479 existing
plus seven new tests). Targeted runner tests: **7 passed** (included in 486).
Compilation and whitespace checks passed.

See `evidence/native-windows-runner-20261110/verification.json` for final counts
and logs. The seven new tests include one nested six-scenario Linux-reference
run; those six are not added again to the Python suite total.

Native CLI invocation on this Linux host exits one with **0 native scenarios
passed, 0 failed, 6 blocked**. This is refusal evidence, not native acceptance.
No Wine run was substituted. Browser, Node, TypeScript, root-only publisher and
existing Wine acceptance suites were not rerun: their source inputs and existing
runtime sources are unchanged. Compilation/whitespace and source/evidence hashes
are recorded separately.

## Native requirements and blockers

Provide a dedicated native Windows x64 no-egress VM, non-admin fixture identity,
trusted application-local CPython 3.12.10 x64 and the existing lock's Windows
simulation wheels. No MetaTrader5 package, terminal or broker credentials belong
in this milestone. Preserve trusted source/runtime ancestors and provision private
protected NTFS state/evidence roots, including a protected DACL on every scenario
root. Working native ctypes/DLL loading, SQLite, byte locks and Job Object support
are required. The runner changes none of those OS policies. Its no-egress flag is
an operator assertion; external network denial must be independently evidenced.

No native Windows runner is attached here. Actual Win32 ABI/ACL/job/lock behavior,
second-user access denial, reparse/handle races, process-tree containment and
power-loss durability remain unverified. The six scenarios are a first smoke
milestone, not comprehensive Windows acceptance or proof of cross-host exclusion.
Retain independent VM/OS/build/provisioning evidence; Wine-export detection is not
host attestation against a malicious runtime.

Actual MT5 integration is a separate authorized phase: approved terminal build
and private data directory, reviewed official SDK/Python/NumPy ABI, session identity
checks, real history mapping and final gateway/stop/fencing/journal integration.
The old service SDK 5.0.45 pin and infrastructure Python 3.13/SDK 5.0.6231 profile
are not an approved runtime for this CPython 3.12 simulation candidate. Do not
invoke SDK initialize as an offline probe: it can launch and authenticate using
saved settings.

Ready for GitHub review as preparation after local validation, not native Windows
or MT5 compatibility approval. No push, merge, deployment, broker connection,
real order or trading activation. All existing emergency-stop protections remain
intact. The next genuine milestone is running this candidate in an approved
native Windows fixture and reviewing its evidence before expanding native tests.
