# Person 2 final application integration

This branch starts at verified GitHub main `76c18478943fa40d903806f2906447c61d980f6e`. Its application/backend and DB sources matched the previously accepted `7d68249aa149513fa71dbda31bd0eb40ee911aa2` baseline. Historical Person 2 handover `f3a9baaa9785bd3628863d4b6d042927cb14ed79` was verified. Neither the dirty original `/opt/ea-cloud` checkout nor Person 1's separate dirty worktree was modified.

The bounded application overlays are the same reviewed source patches already used by the deployed VPS management API/copier. They add dynamic authenticated gateway assignments, mentor-scoped receiving readiness, multi-account receiving selection, pending observation/routing/synchronization, durable replay handling, provisioning uncertainty stop/retention, uncapped account enrollment, and external signal-consumer mode. Existing approved ownership, original session encryption, entitlement and risk controls remain authoritative. The engine implementation and deployment/recovery scripts remain committed on `engine/vps-completion-20261116` through `0328fa6`; this branch integrates their application contracts into current main without replacing the application with that historical checkout.

A new `start:engine-source` command validates the complete external-consumer/HTTPS profile before importing the built API. It never starts the VPS worker, issues a grant, clears stops or places an order. Default `start` remains Person 1's management-only entry. The build now pins DB and API-Zod imports to this checkout, avoiding accidental compilation against another worktree's old workspace package links. No frontend sources or database schema/migrations changed.

## Actual verification

* The complete accepted API build passed, including API, scanner and builder-worker bundles. The initial build exposed sparse-checkout omissions and stale shared dependency resolution; checkout population and explicit local build aliases resolved them.
* Five focused integration contracts passed on this branch: dynamic gateway roster/separate Access identities; external consumer performs no DB reconciliation/claim/wakeup; live-scoped pending schema and transport; readonly edge authentication; legacy selection with inventory disconnect/owner precedence.
* One new hosted-start guard test passed, covering accepted configuration and15 invalid configurations before server import. Tests use synthetic transport responses; none are broker execution evidence.
* Fresh actual SDK account proofs returned200 for six isolated demo terminals across JustMarkets, Deriv, XM, Exness and RCG; all identities matched, all read-only, zero open positions and pending orders. No terminal rebuild/restart or financial call occurred.
* Private API health/readiness200; authenticated gateway health200; unauthenticated gateway401; financial capabilities503. Both original stop hashes unchanged. No failed services.
* Original database owner snapshot: zero approved/verified associations, zero conflicts. Enrollment DB: six awaiting_owner, zero owners. Copier inactive/static, no execution permit.

See `PERSON2_FINAL_INTEGRATION_EVIDENCE_20261117.json`. Existing broad175/47 suites were reused rather than repeated. Actual broker order filling, hosted browser/API-to-VPS traffic, full-host reboot and offsite recovery are not verified.

## Deployment and exact remaining inputs

The VPS already runs immutable API/gateway/ownership release `/opt/ea-cloud/releases/engine-api-9aff0426c5e1`, copier/tools `/opt/ea-cloud/releases/engine-copier-6b50e376c674`, execution code `/opt/ea-cloud/releases/engine-execution-a68f4dd766b2` and the six SDK-denied standbys. This branch introduces no changed engine runtime logic requiring another terminal or service rollout. Hosted application deployment has NOT been changed.

Use `HOSTED_CONNECTION_RUNBOOK_20261117.md` for the exact account/session commands, route bodies, per-origin credential sources, Render settings and Cloudflare ingress. Deploy this backend integration through the actual hosted release workflow; do not merge/reset the old engine branch over main. Render requires a real service binding and authorized deployment access, not simply GitHub repository access. Do not expose port10040; VPS consumes the original shared provisioning queue.

Missing inputs, which cannot be synthesized:

1. The actual account owners' authenticated Connect actions/session references; then fresh broker verification binds their original identities. No user-to-account relationship currently exists.
2. Approved Render API service access and Cloudflare hostname/Access/ingress configuration. Local connector token is not a Cloudflare management credential. No concrete gateway/status hostname was verified.
3. Before execution: owner-reviewed per-account risk policies, explicit symbol mappings and source allocation, current broker contract/quote/cost/clock evidence, then an explicitly authorized bounded session under existing stop controls. `ENGINE_CONTINUATION_RUNBOOK_20261117.md` on the engine branch documents activation; no activation occurred here.
4. External alert destination, approved encrypted offsite repository/restore destination, and independent provider recovery access before controlled reboot acceptance. Local monitoring/backup are present; external delivery/restore are not verified. Disk has only about3.6GiB free and requires actual capacity planning before expanding the account fleet.

Production trading is disabled and is not declared ready. Committed implementation and real broker connectivity are distinct from broker execution acceptance.
