# Native Windows simulation acceptance candidate

This runner is a first native simulation milestone, **not MT5 integration**. No
native Windows result has been obtained on the current Linux executor. Wine is
explicitly refused. Do not run the Linux reference tests as native acceptance.

## Required isolated fixture

- Dedicated native Microsoft Windows x64 VM (Windows 10/11 or Server equivalent
  supporting CPython 3.12), non-admin fixture identity, externally denied network
  egress, no production credentials/configuration, saved accounts or terminal.
  These OS versions are candidate requirements, not a validated support matrix.
- Trusted application-local **CPython 3.12.10 x64**, its native DLL dependencies,
  functioning ctypes, SQLite, msvcrt byte locks and Windows Job Objects. Allow
  child job assignment or refuse the image; do not relax containment checks.
- Dedicated short local fixed NTFS tree, e.g. `C:\EA-SIM`, no junctions, symlinks,
  UNC, aliases or reparse points. Use the existing candidate's strict lexical and
  ACL policy. Source/runtime and their non-volume ancestors must resist other-user
  writes/deletion/ACL changes. Private state/evidence directories require owner
  full control (optional SYSTEM), no other-user access, protected root DACLs and
  inheritable owner/SYSTEM access for children. Ordinary shared/profile locations
  may fail. Provision these only inside the disposable VM; the runner changes no
  ACL, firewall, registry, terminal or production settings.
- Start from the requested Git checkpoint and stage a trusted source checkout.
  Only synthetic bindings are used. The runner records its own hash, the existing
  worker source-closure hashes, runtime executable hash and dependency versions.

## Reuse the existing runtime lock

Do not install `vps-mt5-service/requirements.txt`: it includes the vendor SDK.
Use `tools/wine-simulation/runtime.lock.json`, selecting only `windows-python`
and `windows-wheel` entries. This reuses the existing interpreter and dependency
pins/hashes, without Wine/Linux packages or a new lock/dependency set.

On a separate authorized preparation machine obtain those exact artifacts from
the lock's official URLs, verify each SHA256, and transfer them into the isolated
VM. The acceptance runner never downloads or installs anything. For an empty
application-local runtime directory, extract the hash-verified Python embed ZIP
into it, then each hash-verified Windows wheel into `Lib\site-packages` using
Python `zipfile` or an equivalent trusted ZIP tool. Preserve filenames and wheel
metadata. Set the embedded runtime's `python312._pth` to:

```text
python312.zip
.
Lib/site-packages
import site
```

This matches the existing Wine fixture's Python setup without its Wine-specific
ELF/dispatcher modifications. Do not copy arbitrary site hooks or Linux wheels.
Keep the dependency `.dist-info` metadata: the runner verifies installed versions
against the same lock and refuses an installed MetaTrader5 distribution. Version
checks do not establish artifact integrity; verify the artifact hashes during
provisioning and retain that operator evidence. Stage source, dependencies and
runtime as trusted files and apply the candidate's ACL policy before testing.

## Run

Operator-create **two separate existing protected private directories** for
state and evidence; neither may contain the other. Keep evidence empty. Under the state parent, precreate the six scenario
directories listed below, each empty with its own **protected** private DACL
and owner/SYSTEM inheritance for files. Inherited permissions alone do not
protect the scenario root DACL. Never supply an existing account's state directory.

```text
test_startup_stopped_and_private_status
test_conflicting_controller_and_account
test_authentication_and_replay
test_duplicate_request_after_clean_restart
test_active_stop_blocks_synthetic_execution
test_crash_recovery_retains_hold
``` Example paths below refer only to the disposable VM.
From the trusted checkout, using the application-local runtime:

```powershell
C:\EA-SIM\python\python.exe -I -B tools\windows-simulation\acceptance.py `
  --state-parent C:\EA-SIM\fixture-state `
  --evidence C:\EA-SIM\fixture-evidence `
  --confirm-isolated-no-egress-vm
```

The acknowledgement is an operator assertion, not firewall attestation. Confirm
network denial outside the test process. Parent/worker guards reject vendor
imports and Python TCP/UDP calls; trusted native code is not sandboxed by these
Python guards. The existing worker also forbids subprocess/native terminal
launches; the parent launches only the existing fixed simulation worker.

Success requires six scenarios, no failures/errors/skips, real native preflight
and exit zero. Missing native prerequisites produce exit one and a blocked result;
unknown arguments and unsuitable evidence directories fail before testing. Every
scenario provisions a fresh explicit synthetic fixture through existing helpers:

1. Signed process readiness, initially stopped state and authenticated status.
2. Conflicting launcher ownership and wrong-account refusal.
3. Wrong-key refusal and replay rejection across private stdio.
4. Synthetic duplicate prevention across a clean process restart.
5. Active synthetic emergency stop blocks fills.
6. Crash after synthetic fill leaves a persistent hold across restart and no
   second fill, even after a fresh synthetic clear mirror.

Only these marked synthetic fixtures receive mock stop mirrors; no real stop file
or existing recovery hold is cleared. Initial smoke runs without a clear mirror.
Private SQLite journals, lifecycle audit and fixture markers remain under the
state parent for review; they are not deleted or reused automatically. A new run
needs new evidence and new preprovisioned empty scenario directories. Do not publish private journals by default.

`results.json` and `acceptance.log` are saved under evidence. Host OS/build,
interpreter hash and source hashes distinguish the candidate inputs. The runner
rejects Wine's ntdll export, but cannot attest an adversarial VM/hypervisor; retain
independent host provisioning/OS and network-denial evidence. A failure is not
permission to weaken ACL/path/job checks or reset state.

## Scope and remaining milestones

The runner reuses `NativeWindowsSimulation`, its existing adapter engine,
authenticated protocol, stop checker, locks and journals. It does not add a backend
selector or loosen simulation bindings. The integrated native history mode still
explicitly refuses the Windows backend; Wine history acceptance is separate.

Six smoke scenarios do not replace native adversarial ACL/second-user, reparse
race, handle inheritance, Job tree containment, power-loss durability or full
history/fencing acceptance. Those remain required before broader native use.
The present Linux tests cover runner controls and these scenarios through the
explicit Linux-reference launcher only.

**MT5 terminal requirement for this simulation milestone: none; keep it absent.**
Actual graphical terminal startup/SDK acceptance is a later separately authorized
milestone requiring a trusted isolated 64-bit terminal build, private portable
data directory and reviewed Windows/Python/official-SDK/NumPy compatibility.
Service SDK 5.0.45 and the separate infrastructure 5.0.6231/Python 3.13 profile
remain inconsistent with this 3.12 simulation fixture. No SDK version is approved
here. Official initialize can launch/authenticate using saved settings; it is not
an offline startup probe. All future real execution must remain behind assigned
gateway, ownership/fencing, stop and durable recovery controls, with explicit
authorization. No native Windows or actual MT5 compatibility claim follows from
this preparation checkpoint.
