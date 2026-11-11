# Secure Render → MT5 VPS deployment preparation

Status: prepared and tested locally, NOT provisioned or deployed. Production migration is already complete; do not rerun it. Five verified broker configurations remain unchanged.

## Transport

Existing Render API → HTTPS status hostname protected by Cloudflare Access Service Auth → outbound remotely managed Cloudflare Tunnel → existing authenticated loopback status relay at 127.0.0.1:8005 → isolated read-only account workers. No new inbound VPS port or public raw SDK/controller endpoint is required. This topology is not a live connection claim.

Render sends BOTH existing relay Bearer authentication and dedicated Cloudflare Access service-token headers. Use `MT5_ACCESS_REQUIRED=1`; half-configured/empty/malformed tokens or plaintext token transport fail closed. Existing private loopback Bearer operation remains supported without Access credentials. Account proof refuses redirects and still verifies exact owned demo identity before returning connected; health alone is insufficient. Edge credentials are server-only and absent from app/API responses.

[Cloudflare service-token documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) defines the header pair and Service Auth policy. Use a dedicated exact-token policy for the approved status hostname; no Bypass/Everyone/any-service-token rule. Access must cover all paths before any tunnel route is enabled. The independent relay token remains required if Access policy is misconfigured.

The ingress example admits only status/connection-proof paths and ends in a 404 catch-all. Do not route API port8000, per-account ports, file bridges, financial endpoints or the entire VPS network. Resolve the approved hostname through the existing Cloudflare zone; a hostname is not invented/provisioned by this template. Protect aliases and path normalization as well as the canonical hostname.

The prepared systemd unit loads its tunnel token with LoadCredential, never a CLI secret argument. It uses DynamicUser, no home access, read-only system protection, warning-level logs and loopback-only metrics. [Official run-parameter documentation](https://developers.cloudflare.com/tunnel/reference/run-parameters/) covers --token-file; verify the installed pinned official binary supports it before installation. No cloudflared binary or service was installed/enabled by this preparation. Never enable debug header/body logging. No existing service, firewall, SSH or broker bundle was changed.

## Minimum provider access still required

Grant this session authorized access to the existing EA Cloud API Render service and existing Cloudflare Pages/Zero Trust account. Needed capabilities: inspect runtime/build/start configuration and original origin/session settings, update approved transport variables, trigger an explicitly approved deploy; configure the specific tunnel route, Access application/policy/service token and existing Pages project. Broad unrelated account administration and replacement database/session credentials are unnecessary. No Render or Cloudflare provider tools are currently available. Existing original bindings are already securely stored; do not resend them.

Operator action is to enable those provider permissions for this session; the engineer will create/configure private tunnel/service tokens and deployment settings after access is available. Do not paste secrets or manually run commands to compensate for missing access. Merge/deployment approval remains separate and must name the reviewed release.

## Safe sequence after access

1. Inspect current provider runtime and deployment branch without updating it. Preserve DATABASE_URL, SESSION_SECRET, NODE_ENV, PUBLIC_WEBSITE_ORIGIN, auth origins/cookies and existing backend proxy token. Record the old artifact/configuration privately for rollback.
2. Configure the specific status-only Access application/policy first, then approved hostname/ingress and a scoped tunnel credential. Provision the approved pinned tunnel binary/unit with root-only token file. Keep the relay on loopback and financial routes unavailable. Do not alter either emergency stop.
3. Add only approved MT5 transport variables privately to the existing Render API using the env-key template; do not copy placeholders or replace the entire environment. Keep Access secrets distinct from the existing relay token and Pages-to-backend proxy token.
4. From the authorized Render runtime, test capabilities with: no edge credential (denied), correct edge but missing/wrong relay token (denied), and BOTH correct credentials (expected HTTP503 read_only=true/execution_enabled=false/persistentJournal=false/absoluteTargets=false). Financial routes must remain denied. These probes require no broker credentials, repeated authentication or orders. Test recovery after tunnel restart without restarting account workers.
5. Confirm the exact non-trading API startup/artifact before release approval. The normal index/start path seeds/backfills/expires records and starts queue reconciliation/worker and push processes; NEVER use it as a supposedly passive rollout. The isolated management entry is prepared but binds loopback; do not assume that binary alone can replace the entire public Render API or serve existing login/routes. Preserve the existing Render authentication backend. An approved same-hosting management deployment/entry configuration is still required; do not migrate Render to the VPS or create new paid services implicitly.
6. Pages optional management routing forwards only owned MT5/status/policy/capital paths; preserve BACKEND_ORIGIN and its token for existing auth/other app endpoints. Use a distinct management-origin proxy credential if origin protection is configured and verify that protection on the receiving service; setting a proxy header alone is not enforcement. Do not point all app routes at the management-only entry.
7. After explicit merge/deployment approval, deploy matched reviewed app/API/proxy artifacts via existing workflows. Accept original-user login/cookies, owner-specific Connect/status/Disconnect/reconnect, backend-gated animations and saved/audited capital limits in the actual deployed browser. Preserve unassigned clients and orphan settings; do not manufacture ownership or shared demo accounts.

## Existing evidence and remaining scope

Production schema/key/privilege preflight, original stored-session compatibility, prior five broker authentications and owned capital/MT5 fixtures are reused. New tests cover HTTPS-only paired Access+Bearer transport, required-token failure, non-disclosure, path/origin validation and unchanged loopback support. API TypeScript/isolated build and the affected account-workflow regression are required for the shared transport change; successful financial/broker tests and migrations are not repeated.

General independent account/role enrollment remains incomplete: the existing private relay accepts only provisioned workers. A protected network path does not make arbitrary newly submitted broker accounts provisioned or authorized. Live deployed original-user/browser acceptance and actual demo-copy execution/latency remain unverified. Both stops stay active.

## Rollback

For a failed transport rollout, restore the previous approved Render/Pages variables/artifacts, stop only the newly installed tunnel and revoke only its newly introduced Access/tunnel credentials. Retain original relay/session/database credentials, existing brokers and audit records. The database migration is additive and already committed; do not drop its tables/column or restore stale production data. Keep both emergency stops active. No fallback to unauthenticated/public plaintext VPS access is permitted.
