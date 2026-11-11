## 2026-11-11 owner-authorized continuation — supersedes historical gates below

Production deployment, service configuration and reviewed migrations after backup are now owner-authorized. The two 20261111 migrations were applied once after a verified restore; do not repeat them. Current exact receipts are in `production-evidence/` and `PRODUCTION_EXECUTION_20261111.md`.

Provisioning now acknowledges durable intent with HTTP202 and authenticated request-ID polling; it never retransmits credentials during polling or retries an uncertain allocation. Driver watchdog is360s plus45s stop/retain, inside consumer420s. Dedicated startup is display → credential-free bootstrap → supervised portable terminal with Experts disabled → read-only SDK API → exact account proof. Fresh Wine bootstrap uses the previously documented installer-suppression settings, bounded wineboot/wineserver cleanup and an SDK import check. A partial prefix holds for reconciliation. The clean image passed a real fresh-prefix dependency import check with no broker initialization; this does not prove new-account provisioning.

Homes are0700 beneath a root-owned0711 traversal parent. Admission requires a pinned broker server, capacity, a unique OS identity and no existing static account controller. Dynamic relay proofs carry authoritative tenant ownership; backend readers must match the authenticated owner. Three bootstrap,17 driver and17 private-service assertions passed; async-port and changed tenant/security regressions passed. These focused tests inject host/HTTP operations and do not prove real provisioning.

Generic worker creation, encrypted-credential host delivery, recovery and actual user-session/provisioning acceptance still require real deployment evidence. Private Render-to-VPS transport configuration remains unavailable without provider access. Both stops and all financial execution prohibitions remain in force.

---
Historical checkpoint (kept for provenance; not current deployment status):

# Dedicated read-only worker creation driver — isolated source

## Implemented

`dedicated-worker-driver.py` implements the private-service stdin request contract and silent exit0/safe exit70 semantics. CLI is root-only and requires a private reviewed configuration with enabled=true; example is false with no slots. No caller selects commands, paths, users, ports, display or templates. Parent service separately pins driver executable hash. Script is executable source, not installed. No live credentials, terminals or services used in checks.

Creation allocates a **pre-authorized blank slot**, not an existing broker account: unique dedicated UID/GID, display, port, absent home and broker-matched sanitized image manifest. It verifies image exact file inventory/hash and rejects symlinks/path traversal. Copies only independently approved blank image to a NEW home; never clones a current account/prefix or rebuilds existing terminals. Image must include clean Windows Python/SDK and official broker terminal, a compatible initialized clean Wine prefix, no saved accounts, no EAs/autotrading and no copied production credentials. Image sanitization is an operator approval requirement, not inferred from hash equality.

Root SQLite FULL-sync account/request/slot reservations persist BEFORE host action. Same login+server cannot be claimed by another tenant; request replay/uncertainty never reruns the driver. Cross-role owner mismatch/live/extra command fields refused. Partial filesystem/service creation leaves held allocation and fixed audit events. Broker passwords/tokens do not appear in journal/descriptor. Credentials are delivered to systemd-creds encrypt through stdin, stored root0600 as ciphertext, then supplied to the reused wine-readonly-api.py through LoadCredentialEncrypted. No password argv/environment/source/plaintext login.ini is created. Runtime plaintext exists only in approved systemd credential memory/runtime and process stdin, subject to host-systemd verification.

`SystemdHost` source validates precreated dedicated OS identity, fixed new-home roots and exact new-service names; prepares runtime/Xauthority, starts only ea-selfservice-display@/ea-selfservice-readonly@, queries authenticated loopback snapshot with proxies/redirects disabled, and verifies exact demo identity/read-only/no automated trading before marking verified_readonly. Credentials and worker config are dynamically allocated; template units reuse existing read-only Python/Wine launcher. SDK initialize in that adapter may start the portable terminal only during a separately approved real deployment. No new order route is introduced.

Creation depends on both actual stops still present. This requirement does NOT confer trading permission; all worker manifests enabled/execution_approved=false. Dedicated account OS user must already be reviewed/prepared: arbitrary root user creation is deliberately excluded from a remote provisioning request. Slots represent capacity, not account assignments.

Cleanup stops only this driver's units, confirms inactive/failed state and retains home/encrypted state/journal with stopped_retained status. It does NOT recycle an uncertain slot or delete persistent storage automatically. Destructive storage cleanup remains a separately reviewed registry removal + retention operation after proof no live process/controller remains. No production rollback action is needed for candidate source.

## New files

- dedicated-worker-driver.py — allocator/lifecycle, encrypted credential and systemd host port.
- worker-driver.config.example.json — enabled=false, zero slots; invalid for provisioning until reviewed capacity supplied.
- ea-selfservice-display@.service.example, ea-selfservice-readonly@.service.example — REVIEW_REQUIRED pinned release paths, no installation performed.
- test_worker_creation.py — 12 new focused tests, fixture images/accounts/process manager only.
- run_driver_checks.py — blocks network, subprocess and MT5 SDK import during tests.
- DRIVER_TEST_RESULTS.json — test result; /root/ea-cloud-driver-focused-tests.log — detailed output.
- WORKER_DRIVER_VERIFICATION.json — file hashes/preservation evidence.

12 focused tests PASS, zero failures/errors. Covers isolated home/encrypted mock delivery, duplicate/cross-owner rejection, schema/live denial, image tampering/symlinks, mandatory stops/default-off, wrong broker identity, timeout/partial creation hold, shutdown retention and capacity. Actual systemd-creds, units/Xauthority/Wine/SDK/broker are NOT exercised. Old suites not rerun. git diff --check PASS; source syntax/import checked by focused suite.

## Completion status and exact remaining gates

Driver creation/lifecycle SOURCE is implemented and offline verified. It is NOT production-complete or real-runtime accepted:

1. Approve clean official per-broker images/manifests and precreated dedicated blank users/slots, exact port/display capacity and immutable release. Templates must be reviewed with actual systemd encrypted-credential support and host-bound encryption recovery/key access. SystemdHost templates use fixed /var/lib/ea-cloud/private-provisioner and /var/lib/ea-cloud/selfservice-accounts paths; config must match. No existing six account slots may be repurposed.
2. The existing read-only relay loads a static maximum-eight account registry at startup. This driver writes a NEW private enrollment descriptor containing credential-file references, NOT plaintext. It DOES NOT edit/restart that relay or claim hot registration. A reviewed private registry-admission/reload mechanism with exact tenant/role binding and encrypted credential access is still needed for backend readBoundAccount to discover the new worker. This is an outstanding integration requirement, not verified app authentication. Existing relay capacity must be explicitly allocated or extended and tested before general self-service.
3. Private service's 15-second driver deadline versus host systemd/SDK startup must be measured and reviewed; cold Wine startup may exceed it. Timeout kills driver group and can leave systemd-owned new units alive; durable intent holds, and explicit request-ID cleanup/reconciliation is REQUIRED. No automatic retry/reallocation after timeout. This candidate supplies controlled stop/retention operations but does not yet have an external reconciler for parent SIGKILL. Do not call this fault tolerance accepted until isolated real-process integration passes.
4. Approve migration/queue consumer and private service deployment separately, with backup and rollback review. No production migration, service, user, home, registry or credential change occurred. No worker registry path/credentials should be accepted from browser inputs.
5. Obtain explicit approval for one isolated controlled read-only DEMO creation/authentication test naming owner, broker, exact account/server, approved fresh slot, image/unit/driver hashes, private transport, time/capacity limits, credential handling, stop checks and cleanup. Must retain execution disabled/both stops and prohibit order APIs. Follow with direct SDK identity, stable connection, app cookie ownership and status verification. Passwords supplied only through existing secure UI/credential mechanism, never reports.
6. Master/follower policies/allocations remain separately authorized; driver role selection does not authorize copying, assign other users or place trades. No broker connectivity/copy latency is claimed here.
