# Rollback procedure — prepared, not executed

Rollback must preserve the most recent broker reality and execution evidence. Rolling back code does not mean restoring an older financial database/journal.

1. Halt new source ingestion and queue claims, then disable further execution at the control layer for the affected scope. Preserve broker/terminal connections for read-only reconciliation. Let identifiable in-flight requests settle and persist acknowledgements; treat any interrupted outcome as uncertain. Do not submit compensating orders without separate approval.
2. Capture consistent current PostgreSQL and SQLite snapshots using supported backup mechanisms, configuration/service/source hashes, broker order/deal evidence and all unresolved intent references. Protect original credentials/encryption keys and keep a private immutable incident record.
3. Verify the rollback release and its compatibility with the current schema/guards. Reconciliation records in this change retain allocation phase dispatching, including positively correlated history. Older safe workers already block that phase. New history audit records and intent columns are additive; do not drop them. A legacy intent without a unique reference remains blocked.
4. Restore only the approved prior code/unit configuration. Keep automatic execution and queue claim disabled during startup/health checks. Preserve the newest database, journals, account bindings, credentials, keys and receipt mappings. Do not downgrade schema, erase history, change keys or force legacy journal adoption.
5. Read-only checks must verify database/key compatibility, exact account identity/path/demo/live expectations, singleton ownership, port isolation, service health and broker-history coverage. Classify uncertain intents under a hold. No matching history is not proof no order executed; broker comments may be rewritten and history windows may be incomplete.
6. If a data restore is genuinely necessary, do not overwrite the current database/journal. Restore the approved backup into a separate isolated destination, verify checksums/integrity/key compatibility, and reconcile every subsequent broker fill/receipt and source revision before considering adoption. A backup from before a fill can cause duplicate orders if restarted blindly.
7. Keep rollback stopped/read-only if any evidence is missing, exposure differs, a key cannot decrypt, a guard is incompatible or a broker is unavailable. Resume ingestion/execution only after explicit reviewed authorization for that scope and a reconciled current state. Keep a record of the decision, not merely a successful systemd status.

Recovery must not require changing SSH settings, broker passwords, production encryption keys or account identities. Never reset dispatching to planned/done by hand to clear an alert. The history recorder can annotate a verified outcome but intentionally cannot resume trading. Real production rollback and broker execution remain untested/unapproved.


## Receiving-demo continuation

Receiver stage: preserve newly enrolled bundles, prefixes and journals during rollback. Never delete them to clear a mismatch. A release lacking the observer precision/subminimum guard must remain execution-disabled; rollback cannot reintroduce minimum-lot round-up. Existing source stored roles remain unchanged.


Latest demo-only state: DEMO_PAIR_PROGRESS.md records two simultaneous authenticated read-only terminals, receiver-only service installation/recovery, strict market-data preflight and parallel SDK observations. No broker-order/production/GitHub approval is granted. Preserve both private bundles and the unchanged mentor manifest.
