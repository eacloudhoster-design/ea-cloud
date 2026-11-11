# Consolidated EA Cloud release: deployment/rollback and owner acceptance

STATUS: NO-GO for actual customer trading. Code candidate is suitable for review; no release/deployment/authentication activation is approved by this document. Existing original migration is complete and must NOT be repeated. The NEW 20261111 provisioning migration has been tested only in a fresh synthetic PostgreSQL18 database. Both stops remain active.

## Canonical source and components

- Canonical project repository: eacloudhoster-design/ea-cloud; preserved /opt/ea-cloud dirty work and Person 2 worktree are not release targets.
- Consolidated isolated worktree: /root/ea-cloud-app-worktree-20261111.
- Release branch: release/ea-cloud-integration-20261111. Exact committed revision is recorded in final evidence outside Git and owner handover.
- Browser website/mentor portal: artifacts/ea-cloud. Client app: artifacts/ea-app. Shared MT5 form: @workspace/mt5-ui. Express backend: artifacts/api-server. Real read-only Windows SDK integration: existing vps-mt5-service/demo_readonly_api.py/probe and infra/linux/wine-readonly-api.py.
- New self-service pipeline: app cookie session → encrypted PostgreSQL request/audit → explicitly enabled serial consumer → HTTPS bearer private provisioner → root/pinned approved-slot driver → separate read-only units → actual SDK proof → root enrollment descriptor → optional dynamic relay lookup → independent backend proof → user Connect ownership transaction.
- Earlier simulation worker/IPC/watchdog candidates remain review/test evidence only, outside production paths. They are not promoted to real execution backends by removing safety checks. Existing real SDK read-only path is reused; production execution readers reject simulation-tagged proofs.

## Implemented/verified boundaries

Master and follower request forms, authenticated submission, status polling, cancellation/expiry, credential encryption/erasure, owner revocation/assignment checks, audit events, backend/transport/driver contracts, account isolation, cross-role binding guards, optional dynamic registry and default-off lifecycle wiring are implemented. Dynamic resolution is explicitly opted in with self_service_registry=true on an APPROVED relay configuration; no existing registry was changed. Static bindings take precedence, dynamic collisions fail closed, root-private file permissions and matching allocation owner/state are required; only verified_readonly driver allocations can resolve.

Source driver supports approved blank slots and read-only SDK startup through existing Wine components; no existing user/prefix is cloned. systemd encrypted credential and Windows/Wine compatibility are code-reviewed only, not operationally accepted. New service/consumer startup is opt-in. Driver timeout initiates bounded fixed --stop-retain cleanup, never re-creation; stopped data/uncertain allocations remain. A SIGKILL of the entire provisioning service can still require explicit operator reconciliation. Automatic watchdog termination is not proof that a systemd-owned terminal stopped.

Build/typecheck PASS evidence is in RELEASE_VERIFICATION.json. Disposable PostgreSQL verified atomic migration, constraint enforcement, SKIP LOCKED claims, audit/ciphertext erasure and sentinel preservation. Real production database/session/encryption credentials were NOT read or used in this sprint. All SQL data were synthetic and the disposable cluster was stopped afterward.

Not accepted: arbitrary live accounts (current account proofs/workers are DEMO/read-only), multiple active trading accounts per app user (existing settings binding remains one), actual new-worker image/systemd/Wine/SDK activation, private production routing/browser sessions, real event execution/partial fills/reconciliation/latency, cold reboot/offsite restore/alert delivery. Shared UI and full Pages build compile; desktop/mobile browser acceptance is not performed because no browser runtime is available here. Builds have nonfatal existing chunk-size/sourcemap/React-email peer warnings. None is broker verification.

## Reproducible preparation commands (safe source/build only)

Run from the isolated release worktree at the exact reviewed release commit:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm --filter @workspace/api-server build
pnpm build:pages
git diff --check
```

Build output: artifacts/api-server/dist and artifacts/ea-cloud/dist (website plus ea-app/). Cloudflare functions stay in root functions/. Do NOT run API start scripts during preparation: existing start commands include schema/maintenance hooks. The review-only migration is migrations/20261111_mt5_provisioning_requests.sql (queue and audit). Hash is recorded in release manifest. Existing SESSION_SECRET/DATABASE_URL are reused by approved deployment privately; no replacement secrets or generated transport credentials are supplied here.

## Exact production approval gates and commands

There is NO authorization to execute commands below now. Treat them as the release operator's reviewed procedure; engine service work belongs to its authorized owner.

1. Verify commit/archive SHA256 against final manifest, current production release and recent verified/restorable backup. Obtain explicit NEW provisioning migration approval. After approved secure DB binding is available, use a migration client that reads DATABASE_URL from its protected environment (never command-line URL or logs). Execute only this migration under a transaction with lock_timeout=2s, statement_timeout=30s and ON_ERROR_STOP. No unrelated migration/autogenerated push. The earlier 20261106 migration is NOT in scope.
2. Stage backend with MT5_SELF_SERVICE_PROVISIONING=0 and MT5_PROVISIONING_CONSUMER=0. Keep original DATABASE_URL/SESSION_SECRET unchanged. Configure existing HTTPS MT5_VPS_URL/token/optional Access privately; MT5_PROVISIONER_URL/token is separate and never VITE_*. Publish only through the existing reviewed Render workflow after merge/deployment approval. Record deployment receipt and commit. Do not migrate providers or use VPS API template as a replacement host.
3. Stage Cloudflare via existing project ea-cloud-website, repository build command pnpm build:pages and artifacts/ea-cloud/dist. Use existing BACKEND_ORIGIN; managed route override only if it shares exact cookie/session DB bindings and is separately approved. Deployment command after approval/access: `pnpm exec wrangler pages deploy artifacts/ea-cloud/dist --project-name ea-cloud-website --branch main`. Wrangler/access dependencies may be supplied by the existing hosting workflow; do not install or deploy blindly. Verify both / and /ea-app/, same-origin API cookies/login and CSRF boundaries. No public app deployment occurred here.
4. Engine owner must review/create sanitized official broker images with Windows Python/SDK, pre-authorize blank dedicated users/UIDs/ports/displays/homes and capacity. Existing six terminals/configurations MUST remain untouched. Prepare fixed root0700 state dirs/config/token0600, immutable release and systemd-creds recovery. Review example unit paths/sandbox/LoadCredentialEncrypted support, driver executable/hash and optional dynamic relay descriptor admission. No sample config is deployment-ready; slot lists default empty and placeholders fail.
5. Only after explicit engine install authorization: install reviewed ea-selfservice-display@ and ea-selfservice-readonly@ templates without starting instances; run daemon-reload. Install private provisioner unit default-off. Enable its config/flag only in the approved window. Never copy example units verbatim or mutate Person 2 existing units. Confirm loopback-only private service plus authenticated HTTPS ingress from Render. The source service opens no public interface.
6. Owner-approved controlled read-only DEMO test names one exact user/account/server, fresh slot/image/release hashes, credential input channel, caps/time window, stop retention and cleanup. After authentication shows exact demo/role and AutoTrading=false, verify root descriptor status, authenticated backend proof, final user Connect and browser status. Unknown/timeout/foreign exposure stays held. Only then approve enabling request submission, then consumer, for the accepted demo scope. Flags alone do not make live accounts supported.

Suggested bounded SQL wrapper for a separately approved release tool (not executed against production):

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
-- Execute exact reviewed 20261111_mt5_provisioning_requests.sql here.
COMMIT;
```

Use rollback on any error. Deployment tool must record a private migration receipt and non-secret before/after inventory. Never echo secret connection strings or expose env endpoints.

## Live-account owner testing is BLOCKED, not merely awaiting a toggle

Current runtime intentionally verifies DEMO identities and rejects live account mode. Owner-controlled live trading cannot be enabled by clearing a stop, changing a flag, reusing simulation agent or using an investor password. First implement/review separate live read-only identity/role/multi-account enrollment with full permission/risk acceptance, then actual order adapter integration, symbol/volume/slippage/margin/drawdown/daily-loss limits, durable history mapping and test-specific cleanup under fresh authorization. No broad activation endpoint was added in this sprint. Existing copy architecture includes mentor assignment/policies, persistent mapping/idempotency, SLTP/close handling and real SDK execution primitives, but no claim that full live copying is accepted.

The owner's first currently permitted next step is an explicitly approved READ-ONLY DEMO deployment/authentication acceptance, not a live order. Following those gates, propose exact demo lifecycle execution scope with current fees/quotes/risk, then separate live-account activation review. Both emergency stops remain functional and active throughout current work. No actual broker-copy latency measured.

## Rollback and incidents

- Keep provisioning flags0; stop new intake/consumer first before reverting its release. Preserve request/audit/intent logs and any in-flight/systemd-owned workers; do not retry unknown jobs or delete the allocation ledger.
- Stop only newly approved private provisioner and self-service unit names; `systemctl stop ea-selfservice-readonly@<approved-slot>.service ea-selfservice-display@<approved-slot>.service` only for that allocation after verified request ownership. Use driver --stop-retain for reviewed request-ID cleanup. Confirm inactive/failed before declaring shutdown; failed shutdown is an incident and blocks reuse.
- Revert Render to its previous recorded deployment and Cloudflare to its previous successful deployment through existing provider rollback workflow. Preserve additive queue/audit tables; no down migration/data restoration/session-secret rotation as generic rollback.
- Dynamic relay removal is controlled by allocation state (only verified_readonly resolves); stopped/held descriptors cannot authenticate. Never overwrite original static bindings; disable only the NEW opt-in after an incident if approved.
- Retain encrypted state until approved registry removal/storage retention cleanup. Independently verified off-VPS restore and console access, alert destination/receipt and reboot acceptance remain required operational gates. Do not reboot as a repair step in this release.

No public release URL was newly deployed. eacloudhoster.online is the previously supplied domain, NOT a verified deployment result from this sprint.
