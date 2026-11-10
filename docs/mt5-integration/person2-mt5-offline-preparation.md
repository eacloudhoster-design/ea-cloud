# MT5 integration preparation — offline only

Base: `33357049ca11f3975e37c952cb26c3fff98394fd`.
Branch: `feature/person2-mt5-offline-preparation-20261110`.

## Existing capabilities and boundaries

`vps-mt5-service/sdk_adapter_candidate.py` already defines the narrow `ReconciliationSdk` protocol: account information, symbol information/selection/tick, positions and `send(request, symbol)`. Preserve this boundary. Its `SyntheticSdkAdapter` deliberately requires the exact synthetic broker type and a simulation binding. It is not a real SDK adapter. No new adapter or real SDK loading path was added.

The guarded worker, authenticated IPC, assigned execution gateway, shared-authority simulation, fencing, durable intent/deduplication journals and synthetic history already exist. Windows/Wine entries reject vendor imports; bindings require simulation and the synthetic server. Do not relax those controls to introduce real execution. Local files and locks do not establish cross-host ownership. Deployment must enforce one authoritative executor per physical account, including preventing a second independently rooted host from receiving its credentials.

`demo_worker.py` already contains terminal-facing code: `connected()` initializes a terminal with credentials and checks identity/demo mode and terminal paths; sends recheck stops and trade permissions. `history_reconcile.py` contains a real history collector. These are source-inspected legacy paths, not the approved integrated real execution architecture. The demo worker's standalone entry and `demo_readonly_probe` can initialize/authenticate even when described as read-only. None was invoked. They must not become an alternate route around the assigned gateway.

Account enrollment/export already verifies actor ownership, encrypts stored credentials and defaults execution off. Infrastructure launchers use private configuration, inherited input and credential files. Preserve these mechanisms; no password, token or terminal selector belongs in public IPC, argv, audit records or Git.

## Verified gap and exact changes

The static routing reviewer used raw configuration values to judge enablement while the worker uses parsed booleans. A string `"true"` was reported disabled despite becoming `True` in `DemoAccount`. It also accepted relative paths, shared terminal directories and shared journal files; raw string/integer login differences could evade the identity comparison.

Only `infra/linux/review-account-routing.py` changes behavior:

- Use the existing parsed worker manifest for effective enablement and identity.
- Reuse existing strict Windows path validation, normalize case/separators for comparisons, require an executable terminal path and reject shared terminal directories or journals and journal collisions with known terminal executables/directories.
- Explicitly report terminal files unverified, SDK runtime unverified and execution unauthorized even when static metadata passes.

Six regressions were added to the existing `test_registry_review.py`. No gateway, SDK, worker, IPC, lease, stop, journal format or production configuration changed. Static path checks cannot detect junctions, hard links, actual ACLs, malicious binaries, nested installation/data-directory aliases or independent host assignments; filesystem and runtime verification remains required. This metadata review is neither an execution gate nor an authorization grant.

## Requirements before official SDK integration

| Area | Required future work; not implemented or validated here |
| --- | --- |
| Session | A private worker-owned lifecycle for official initialize/login/shutdown, version/last_error and terminal/account identity. Verify login, server, demo policy, terminal executable/data directory and account mode after approved connection. Never accept arbitrary session switching through IPC. |
| SDK adaptation | Implement the existing narrow read/send contract over official objects, validate symbols, volumes, filling policy and receipts; serialize validated data rather than raw vendor objects or exception text. Unknown results/timeouts retain holds and must never trigger blind resubmission. |
| History | Map real order/deal/position IDs, entries, states, volume and timestamps into durable reconciliation, with explicit missing/error handling. Synthetic history is not a broker history source. The current adapter deliberately rejects ambiguous/partial receipts; do not weaken this without proven real-history recovery. |
| Safety gateway | All future mutations must use the assigned authoritative gateway, current lease/fence and final emergency-stop checks, durable precommitted intent and persistent recovery holds. Recovery cannot authorize or clear a hold automatically. |
| Authorization | Separate explicit operator authorization is required before any future real SDK/terminal access, and before execution release. Static review and enabled/approved flags alone are not such an authorization record. No authorization mechanism was invented in this change. |
| Credentials | Immutable operator-controlled account binding, private credential delivery and protected terminal/journal directories; prove actual account identity after permitted connection. Keep secrets out of public messages and logs. |
| Process containment | Prove native process/job termination and quiescence, bounded calls and restart behavior when the native SDK hangs. Synthetic timeout tests do not prove a broker-side operation was cancelled. |
| Deployment | Restrict each physical account to one authoritative executor/credential domain. No local SQLite database or lock provides independent-host exclusion. |

## Dependency and environment blockers

The service pins `MetaTrader5==5.0.45`. A separate infrastructure profile pins `5.0.6231` and NumPy `2.5.4`, with a comment referring to Windows Python 3.13.17/Wine 11.0. That comment is not validation evidence for this task. Existing native simulation code targets CPython 3.12 x64; the recorded synthetic Wine environment used Wine 10.0/Windows Python 3.12.10. These profiles cannot be assumed interchangeable. Previously recorded package metadata indicates the old 5.0.45 pin lacks cp312/cp313 Windows wheels. Select and independently verify one official Windows x64 Python ABI/SDK wheel/NumPy/terminal-build combination and hash-lock it before integration. No dependencies were changed, installed or imported here.

This run used Linux x86_64, Python 3.12.14; the MetaTrader5 distribution is absent. No native Windows runner or graphical MT5 installation was available. Actual Windows ACLs, protected terminal installation/data paths, native DLL loading (including previously unresolved Wine ctypes loading), desktop/session requirements and official SDK compatibility remain unverified. First terminal startup requires an approved isolated environment, network restrictions and protection against saved-account auto-login; SDK initialize may itself authenticate. No terminal startup is part of this checkpoint.

## Validation and evidence

Evidence directory: `evidence/mt5-offline-preparation-20261110/`.

- Full ordinary-user Python worker suite: **479 passed, 0 failed, 0 skipped**, including six new tests.
- Focused reviewer suite: **8 passed** (included in 479, not additional).
- Python source compilation and whitespace checks passed.
- Before/after reproduction shows all three unsafe metadata examples rejected after the correction; parsed enabled flags remain true as expected.
- Source hashes bind the changed code/tests to these results. Evidence index hashes the recorded artifacts.

The earlier complete baseline was 545 tests, two browser scenarios and recorded Wine acceptance. Root-only gates, Node/harness suites, browser, TypeScript and Wine were not rerun for this isolated Python metadata change. No claim of a freshly rerun whole-project total is made. Their runtime sources were not modified.

Ready for GitHub code review as static preparation only, after the local commit. Not pushed, merged, deployed or execution-enabled. The next genuine blocker is selection and approval of an isolated native Windows/terminal/official SDK runtime and a no-connect validation plan, followed by separately authorized session and history integration. Native Windows and actual MT5 compatibility remain unverified.
