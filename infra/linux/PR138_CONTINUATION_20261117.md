# PR138 continuation acceptance

Main is still76c1847. PR138 was inspected through GitHub: draft/open, mergeable, not merged; head3a78c751. Existing deployed service versions remain pinned to their accepted immutable releases. No hosted deployment, financial worker, original ownership record or risk control was changed.

Fresh concurrent proofs verified all six actual read-only broker identities, each on its independent account route. All six returned200 and zero positions/orders; all six wrong-password isolation checks returned403. The authenticated gateway roster contains the expected five distinct follower accounts and no credentials. Six SDK-denied workers are healthy.

A controlled SIGKILL of the main process of the SDK-denied `ea-engine-standby@jm-client-demo` instance triggered systemd recovery in17.52 seconds with an increased restart counter and new PID. Authenticated liveness proved the recovered process still denied SDK dispatch; its broker terminal PID and original stop hashes were unchanged. This verifies standby service recovery, not a financial SDK session or full-host reboot.

All four original-user account/provisioning endpoints rejected an invalid session with401 before account writes. The fresh original ownership snapshot remains empty. No genuine owner cookie file is present. Positive original-owner enrollment therefore remains blocked; matching passwords and terminal aliases do not supply user ownership.

Twelve focused pending synchronization tests passed, including six order types, modify/cancel, fill adoption without duplicate opening, gross exposure, clock mapping and durable timeout holds across restart. They use synthetic broker calls and real temporary SQLite journals. Three new/updated probe/startup tests passed, covering correct per-origin credentials, GET-only requests, misleading health, unexpected Bearer acceptance, leaked/duplicate assignments, secret redaction and startup configuration rejection. Broad previous suites were not rerun.

## Hosted evidence and repair

The public application was actually probed from this VPS: health, readiness, release, account-list and account-capability GET requests all received Cloudflare403/error1010 before backend connectivity could be established. This cannot establish that Render or the browser application is down. The edge security event must be inspected by an authorized Cloudflare operator; no WAF/Access bypass was attempted.

Added `check:engine-connectivity`, a standalone GET-only command for the actual Render runtime. It checks status/gateway health, sanitized assignments, receiving-session metadata and independent Bearer enforcement through the configured Access service identities. It logs counts/check results only and never imports server/order modules. It does not turn zero sessions into execution readiness. The hosted start validator now uses the same1024-character Access credential bound as the actual transport.

The runbook now also documents the current Pages proxy's real server-side binding names (`BACKEND_ORIGIN`, `BACKEND_PROXY_TOKEN`, `MT5_MANAGEMENT_ORIGIN`, `MT5_MANAGEMENT_PROXY_TOKEN`). The management split must be verified independently of Render's observer settings. Current Pages code does not add Access service-token headers to a management origin; a proposed Access-protected management route cannot work simply by setting the Render observer variables. No frontend/proxy code or provider settings were modified.

## Next required actions

1. Authorized hosting operator deploys the reviewed backend integration and supplies/verifies the actual Render service binding plus separate status/gateway HTTPS origins and Access identities. Preserve original DB/session values and the Pages management split. Inspect the Cloudflare1010 event from these probes. Then run `pnpm --filter @workspace/api-server run check:engine-connectivity` inside Render. No hosting-management credentials are available here.
2. Each original account owner authenticates and performs Connect/enrollment or supplies the protected session reference using the runbook. Zero approved associations remain; no legitimate existing mapping can be consumed yet.
3. Complete owner-approved allocations/symbol/risk policy and current broker evidence before any separately authorized bounded execution session. Real fills, execution-session recovery and positive multi-user enrollment cannot be verified without these inputs; no orders are authorized by this continuation.
4. Configure approved external alerts/offsite repository and verify independent provider recovery access before reboot acceptance. Disk free is below15percent; account expansion needs additional real host capacity, not a software quota.

Machine evidence: `PR138_CONTINUATION_EVIDENCE_20261117.json`. The engine is not declared production ready. No broker orders were submitted and both emergency stops remain unchanged.
