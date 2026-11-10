# Person 2: independent-process ownership and recovery verification

Branch: `feature/person2-multiprocess-ownership-recovery-20261110`.
Base checkpoint: `782ef950513e1c0c9eeeeb37e771d39a51f555d0`,
`feature/person2-wine-history-acceptance-20261110`. Its clean checkout, recorded
526-test evidence and source hashes were verified before branching.

## Findings

The existing implementation can serialize **independent simulated clients through
one shared authority and execution gateway**. The authority root has an exclusive
OS ownership lock; the gateway serializes commands; each physical account has one
current controller grant. Server-owned wall/monotonic expiry, request deadlines,
account capability, controller/host identity and monotonic fencing witnesses gate
effects. Durable command IDs, observer/adapter intents and history event IDs
prevent replay of known effects. Signed request/response domains and durable
nonces preserve authentication and replay protection.

This is a single shared fencing domain, not a distributed coordination service.
Two independently provisioned authority roots do not share an account registry,
lease counter or execution journal. Existing per-account native/Wine fixtures are
isolated candidates, not an automatic global account scheduler. A production
multi-worker deployment must enforce one authoritative account-to-gateway route
and one fenced effect path. No independent-root or real broker safety claim is
made here.

A concrete recovery acknowledgement gap was reproduced in the original
absolute-target shared gateway. After a successful synthetic execution, deleting
`simulated-broker.sqlite3` and retrying the same request ID returned cached
`SYNCED`, success true, uncertainty false and no shared hold. No second execution
occurred, but the gateway claimed success without accessible supporting state.
The preserved `gap-reproduction.json` exercises both the exact base source and
the corrected implementation in separate disposable synthetic fixtures.

The newer history authority already verifies its event book, projection and
independent authority witnesses before acknowledging history events or
reconciliation. It was not rewritten. Its recovery rules remain conservative:
a pending command with absent effects cannot be assumed unexecuted; verified
committed effects can be proved but cannot clear a hold or authorize a retry.

## Exact changes

Only one runtime file changed: `shared_lease_simulation.py`. A successful cached
response now requires a read-only preflight of its existing observer and SDK
journals. It verifies private paths, immutable worker/account identity, adapter
installation witness and state, existing observer/adapter/transport holds,
unresolved requests/operations, the matching durable worker receipt and readable
mock history/position schemas. Missing, corrupt, held or inconsistent evidence
latches the existing shared hold and returns uncertain `HELD`. Read-only SQLite
connections never initialize, recreate or repair missing journals. No send,
reconciliation replay, lease extension or hold-clearing path was added.

This preflight verifies acknowledgement support and safety metadata; it is not a
new trade-history reconstruction algorithm or a substitute for the existing
history assessor. It does not assert that every legacy mock fill is independently
reconciled against external history. Existing effect and reconciliation engines,
authentication, controller grants, stop checks and idempotency formats are
unchanged.

Two test files were added:

- `tests/test_cached_gateway_evidence.py`: six regressions for missing observer
  and SDK journals, incomplete SDK schema, adapter hold, missing worker receipt
  and conflicting receipt. Each fixture first completes a valid synthetic sync;
  the retry must become held without reconstruction.
- `tests/test_multiprocess_coordination.py`: eight process acceptance cases. An
  existing authority runs in a spawned gateway process. Two separate spawned
  client processes send the existing signed frames through inherited private
  byte pipes. Test-control pipes coordinate startup/fault injection only; they
  are not an execution protocol, production service or new dependency.

The report and evidence directory are the only other changes.

## Independent-process validation

The new cases verify:

1. Two independent clients competing concurrently produce exactly one controller
   owner; only that owner can execute.
2. After expiry/takeover, a fresh message carrying the old token is rejected; the
   new owner can retrieve the previous receipt without another fill.
3. A second independent gateway process cannot open the same owned authority.
4. Termination at the actual uncommitted fill gate rolls back the event and
   projection. The already committed central intent remains unresolved, so
   restart/reconciliation stays held rather than assuming no fill.
5. A gateway process exits after committing a partial fill but before recording
   the central response. Restart proves one deal and retains the hold; no
   additional fill occurs.
6. An active emergency-stop mirror survives crash/failover and stops
   reconciliation; new execution remains blocked.
7. Duplicate events return the stored receipt, exact nonce replay is rejected,
   and an out-of-order event is held without another fill.
8. Two account-bound processes use separate keys and journals through one gateway;
   a wrong account body is rejected without affecting the other account.

All process tests use Linux `spawn` and assert distinct parent/gateway/client
PIDs. Processes, waits and synthetic commit barriers are bounded. Workers install
the existing vendor/network guard. The fixture refreshes only the timestamp of
its synthetic stop mirror after process startup, preserving its stopped value;
slow interpreter startup cannot implicitly reset an active stop.

To run the focused tests:

```sh
python -m unittest discover -s vps-mt5-service/tests -p test_cached_gateway_evidence.py -v
python -m unittest discover -s vps-mt5-service/tests -p test_multiprocess_coordination.py -v
```

Final validation: 540 automated tests passed (all 526 existing cases and 14 new
cases), with 0 failures and 0 skips. Both browser scenarios, six existing Wine
scenarios and 17 existing history-mode Wine scenarios passed. TypeScript, Python
compilation and whitespace checks passed.

Exact final counts and raw results are in
`evidence/multiprocess-recovery-20261110/verification.json`. Existing regressions
and new cases are counted separately; previously recorded Wine/native Windows
claims are not expanded by these Linux process tests.

## Limitations and next blocker

The test-only pipe gateway demonstrates the existing state machine across
processes; it does not add a deployed shared-authority IPC daemon, scheduler,
replicated database, external message bus, WAN partition handling or a broker-side
fencing API. The existing serialized authority is still a single point of
availability and serializes all its registered accounts. Controller death does
not grant immediate takeover: the valid lease must expire or the authority must
restart and fence prior grants.

Same-user hostile filesystem replacement, coordinated whole-root rollback,
external backups, kernel/storage hangs, actual broker deduplication and broker
reconciliation need separate controls. A cached historical receipt does not mean
that a current live position still equals that earlier target. Persistent holds
have no automatic release or repair workflow. Native Microsoft Windows, real MT5
SDK, graphical terminals and actual broker execution remain unverified. The
existing optional ctypes limitation in the minimal Wine fixture is unchanged.

The genuine launch blocker is an approved single authoritative account-routing
and sole-executor deployment model, followed by isolated native Windows and
broker-free SDK/runtime acceptance. Do not treat separate fixture roots as a
production multi-worker coordination mechanism or activate trading to test it.

This checkpoint is suitable for GitHub review after its recorded validation, not
for a trading release. No new infrastructure, system package, production
configuration, broker connection, real order, stop removal, merge or deployment
was introduced. The branch is committed locally and is not pushed.
