# EA Cloud consolidated release sprint

Canonical isolated release worktree: /root/ea-cloud-app-worktree-20261111
Branch: feature/person1-app-mt5-integration-20261111
Base: 72bd2de038819dca4d6e25ec34402d1d29e45921
Original /opt/ea-cloud dirty work and Person 2 services/worktrees are protected.

COMPLETED: app/API session and MT5 account integration; encrypted provisioning queue and owner controls; private service/consumer and approved-slot driver source; default-off templates; targeted prior verification evidence.
IN PROGRESS: consolidated dependency installation (offline frozen lock, ignore lifecycle scripts), full typechecks/builds, release security review and resolution of contract gaps.
PENDING: release artifacts/commit/checksums; final deployment/rollback instructions and NO-GO gates.
BLOCKED EXTERNAL: actual user worker registry admission, reviewed clean slot images/users; live systemd/Wine/SDK read-only acceptance; migration/release approval; private transport/alerts/offsite recovery and tenant acceptance. No broker/production infrastructure access is authorized by sprint.

Restart: inspect this file, Git status and release verification logs. Do not repeat production migration, broker authentication or old simulation suites. Continue failed/changed checks only. Keep both stops and financial execution disabled. Never apply migration, start services or use broker secrets without separate approval.

## Consolidation completed / final verification

Release branch is now release/ea-cloud-integration-20261111. Isolated lockfile install completed with scripts disabled; shared @workspace/mt5-ui package dependencies fixed; nullable disconnect session fixed. Full workspace typecheck PASS; both website/client combined Pages build PASS; backend build PASS. New disposable PostgreSQL migration/constraints/concurrency/erasure tests PASS, no production DB used. Optional dynamic root read-only registry added and tested; affected five relay tests PASS, five dynamic resolver tests and five dynamic relay tests PASS. Driver parent-watchdog stop-retain cleanup implemented/tested with fake process port. Runtime secrets/body fields redacted. Previous mock-only agents remain outside production activation path, and previous large simulations/authentications were not repeated.

Production status: NO-GO. Not deployed or live authenticated by this sprint. Customer live accounts/multiple active per-user execution accounts and actual trade-copy acceptance remain unimplemented/unverified; demo read-only worker installation, registry opt-in, actual systemd/Wine/SDK, user enrollment/transport and deployment require approvals. Remaining resource capacity, monitoring alert delivery, offsite restore and independent console gates remain. Both stops active. Resume from final manifest/commit; do NOT run existing start/migration scripts or enable flags automatically.
