# Production deployment checklist — preparation only

No deployment, public cutover, broker-order approval or GitHub push is granted by this checklist. The engineer performs the operations after concrete approval; these are not instructions for the user to run commands.

## Release and approval gates

- [ ] Review the exact branch/base SHA, staged diff, source archive and patch checksums. Split coherent commits/PRs without losing prior staged work or secrets. Pin a tested release; do not deploy a moving working directory.
- [ ] Approve production change scope/window and named rollback owner separately from any demo-order acceptance and GitHub publication.
- [ ] Require current Python/Node, PostgreSQL, crypto, systemd and secret-scan evidence. Verify the accepted demo order test, not just synthetic fills. Keep all gates closed if it has not passed.

## Production data and encryption

- [ ] Securely bind the existing DATABASE_URL and unchanged SESSION_SECRET through the approved private mechanism. /etc/ea-cloud/api.env is the configured VPS target and is currently absent. Do not generate a replacement key to make startup pass.
- [ ] Verify the authorized database/schema/role, TLS/CA/network requirements and read-only access. Run existing host preflight and check-postgres-encryption.mjs with bounded samples. Require metadata/read-only transaction proof and decrypt compatibility without logging plaintext/ciphertext. No production records have been checked yet.
- [ ] Inspect migration status with read-only metadata before any migration approval. Existing MT5 login integer width, identity/ownership bindings and account-source uniqueness must match actual accounts.
- [ ] Take and verify a consistent PostgreSQL backup, SQLite backup-API snapshots, exact source/config/service versions and unchanged encryption-key recovery material. Confirm usable off-VPS recovery and a restore rehearsal. Existing on-VPS archives alone do not satisfy this gate.

## Runtime, accounts and access

- [ ] Provision bounded capacity, unique Unix owners/prefixes/data dirs/journals/tokens/ports and verified official binaries per actual account. Five simulated profiles do not prove capacity for five Wine terminals. Accept cold bootstrap/reboot behavior in isolation.
- [ ] Verify warm authorized account identity, broker/server/margin mode, symbols/contracts, timebase behavior and history availability. Broker comment rewriting/truncation can prevent automatic evidence correlation; retain holds.
- [ ] Adopt nonempty legacy journals only after offline identity verification and backups. Never delete/reset a journal to bypass a binding mismatch. Inventory every dispatching allocation and associated order/history evidence.
- [ ] Verify immutable identity, single-worker ownership, authenticated loopback/HTTPS transport, no redirects, sane resource limits and bounded client fanout. Keep read-only adapters incapable of advertising execution.
- [ ] Verify SSH key access and independent recovery before changing root/password login. No SSH lockout risk may be introduced during deployment.
- [ ] Configure and test external alert delivery, log retention, resource alarms, broker/API health, queue age, uncertain-intent alerts and offsite backup delivery. Do not claim a configured destination has delivered alerts until tested.

## Controlled cutover after approval

- [ ] Quiesce source ingestion/queue claiming first; account for all in-flight submissions and acknowledge durable receipts. Do not kill a sending worker to force a deadline. Ambiguities must remain held.
- [ ] Preserve original database, credentials, keys, queue sequence/lease state and journals. Apply only reviewed additive schema/service changes. Do not restore stale state over newer financial receipts.
- [ ] Activate a small approved canary only after read-only health, licensing/source guards and production simulation-rejection checks pass. Enable broker execution solely for the explicitly approved scope, never by copying simulation credentials/settings into production.
- [ ] Verify actual fills and end-to-end latency under approved conditions, error/restart behavior, receipts/history consistency and alerting. Expand only after acceptance. Failure criteria trigger the rollback procedure, not extra unapproved orders.

## Rollback readiness

- [ ] Read ROLLBACK_PROCEDURE.md. Confirm prior release understands blocked allocation phases; this change deliberately retains phase dispatching for reconciled holds. Do not roll back to code that bypasses identity, journal or simulation guards.
- [ ] Demonstrate restore/restart in a sandbox with the exact proposed release and backup set before production cutover. No production reboot/cutover rehearsal has occurred.


## Receiving-demo continuation

Receiver stage: require secure second-account enrollment, existing logical read-only mentor/new receiving-client mapping, fresh contract preflight and explicit demo-order approval. Require the observer precision/subminimum guard; smaller targets must not round up. Account bundles and new read-only unit templates are prepared only, not deployed.


Latest demo-only state: DEMO_PAIR_PROGRESS.md records two simultaneous authenticated read-only terminals, receiver-only service installation/recovery, strict market-data preflight and parallel SDK observations. No broker-order/production/GitHub approval is granted. Preserve both private bundles and the unchanged mentor manifest.
