# Person 2 emergency-stop fix — 2026-11-10

Baseline: `fad4a557de36bdc581da2c9706b83cf5637d79a0`.
Fix branch: `fix/person2-emergency-stop-fail-closed-20261110`.

## Behavior and scope

`demo_worker.emergency_stop_active()` previously checked only whether either latch
existed. A missing acceptance directory therefore looked identical to two cleared
latches. The worker now requires an actual acceptance directory before direct
absence can establish a clear state. On Linux that directory must be root-owned
and not group/world writable. Directory symlinks, non-directory paths, missing
directories and disappearance/replacement/protection changes during a read block
execution. Directory listing detects both latch names, including dangling symlinks.

Permission-denied/other I/O errors retain the existing fixed-path mirror fallback.
The existing mirror reader still validates ownership/path/freshness and fails
closed for missing, malformed, expired or untrusted data. Only its exact `False`
result establishes a clear fallback observation; unknown values and read errors
remain stopped. A known missing directory stays stopped even with a recently clear
mirror. Recovery is re-observed on each call; no latch, grant or journal is cleared.

The existing HTTP guard, per-submission stop recheck, account/demo/path verification,
controller/journal ownership, tenant isolation, request hashes, revisions and
uncertain-submission holds remain in place. No execution approval/default changed.
The older permission-error regression now injects its error at `lstat`, the new
read boundary, instead of the obsolete `exists` call.

## Verification

The baseline was reproduced **before repository changes**: 142 distinct cases and
both existing browser scenarios passed. Initial local harness errors were resolved
before implementation: wait for final PostgreSQL startup and protect the standalone
Python runner with `if __name__ == '__main__'` for multiprocessing. These were not
repository-code failures. The first 19-case regression run then failed against
the original function; the complete 22-case addition passes after the fix.

| Set | Baseline passes | Fix passes | Final failures/skips |
| --- | ---: | ---: | ---: |
| Core backend/PostgreSQL/transport/synthetic copier | 39 | 39 | 0 / 0 |
| Pages/proxy/output | 14 | 14 | 0 / 0 |
| Python worker suites excluding root publisher | 83 | 105 | 0 / 0 |
| Root publisher/mirror suite | 6 | 6 | 0 / 0 |
| Distinct automated cases | **142** | **164** | **0 / 0** |
| Existing browser scenarios (separate) | **2** | **2** | **0 / 0** |

Workspace TypeScript and `git diff --check` pass. Frontend source is unchanged;
browser/output checks use the existing matching production bundles. No remote CI,
deployed Wine or broker acceptance is claimed.

New coverage in `vps-mt5-service/tests/test_emergency_stop.py` includes missing and
invalid directories, both active latches, dangling latch links, unsafe owner/modes,
disappearance/replacement, Linux and mapped Windows paths, guarded mirror fallback,
real mirror parsing/TTL/recovery, HTTP rejection before SDK use, and directory loss
between HTTP admission and submission. The last case verifies **no SDK send** and
that the persisted `dispatching` hold survives directory recovery and replay.

### Reproduction and retained evidence

Use the exact 24-file core command in `person2-release-readiness.md` (omit
`scripts/tests/pages.test.mjs` there and run it separately). Use that document's
marked disposable loopback PostgreSQL fixture and external PGlite dependency.
Never supply a production database or broker binding.

```sh
python3 -m unittest discover -s vps-mt5-service/tests -p test_emergency_stop.py -v
node --test scripts/tests/pages.test.mjs
pnpm run typecheck
git diff --check
```

The full Python discovery is partitioned: all modules other than
`test_execution_gates` run as the ordinary user; all six `test_execution_gates`
cases run inside a temporary root container with `--network none`, a read-only
repository mount, a read-only container filesystem and disposable `/tmp`.
Container image: `python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b`.
PostgreSQL uses the existing report's pinned PostgreSQL 16 image, SCRAM, loopback
port and `ea_cloud.test_instance=person2-disposable` marker. All account/SDK data
is synthetic; Python SDK imports and non-loopback Python/Node test connections
are blocked by the external validation harness.

Retained local evidence: `/workspace/work/stop-fix/baseline/`,
`/workspace/work/stop-fix/after/`, `/workspace/work/stop-fix/verification.json`.
The external harness and Python partition runner are in the same `stop-fix`
directory. Initial setup logs are retained as `*.initial.log`; final summaries
refer to the successful `core.log` and `workers.log` runs only.

Final raw-log SHA-256 values:

| Log under `after/` | SHA-256 |
| --- | --- |
| `core.log` | `1084fecd58d8bc3ed463efec2e7937ad93b8e49c184fb6aafd733db65d786ad2` |
| `pages-tests.log` | `77438a949c77a5d0abe263bfe871e3256d935517dcd8edd220908ec6fe31c1de` |
| `workers.log` | `357163e88fd8a41eb9ae220781465c2f43429eed59504afda43b868b6e3f0144` |
| `root-gates.log` | `d5da4977b6671ff9e4768de36e77ee7fa0af5618adf784fe7afbbe4c7b93684b` |

## Remaining safety limits

This resolves the missing-directory bypass in offline validation. Actual deployed
Linux/Wine permissions and path mapping remain unverified. Windows stat cannot
attest Linux ownership; its fixed protected path/publisher trust remains an
operational prerequisite. The existing mirror may remain fresh for up to three
seconds when direct reads are unavailable. Stop checks cannot undo an already
submitted order or eliminate the final check-to-submit timing window. Existing
journal holds still require explicit reconciliation; directory/mirror recovery
does not authorize replay or enable copying.

No broker connection, real order, production configuration/migration/deployment,
stop disablement, PR merge or execution-enabled release occurred. This is a local
fix commit for review; no subsequent development phase or release is authorized.
