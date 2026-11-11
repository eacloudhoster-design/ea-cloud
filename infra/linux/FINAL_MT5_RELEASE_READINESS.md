# Final MT5 release readiness — 2026-11-06

## Verified broker results

| Broker | Actual SDK evidence |
| --- | --- |
| JustMarkets | Previous successful two-account demo SDK evidence reused; no repeat or credential change. |
| Deriv | Previous successful demo identity/server, market data and restart evidence reused. |
| XM Global | Previous successful demo identity/server, market data and restart evidence reused. |
| Exness | Updated private binding authenticated; exact account/server, demo identity, portable paths and market data verified; SDK shutdown and terminal restart/reconnect passed. |
| RCG Markets | Updated private binding authenticated; exact account/server, demo identity, portable paths and market data verified; SDK shutdown and terminal restart/reconnect passed. |

No credentials or account numbers are included here. Original working terminal PIDs remained unchanged. Exness and RCG were added to the pinned loopback status relay and read-only boot target: six isolated bindings cover five broker profiles. No broker orders were submitted. Both emergency stops remain active, AutoTrading is off for new terminals and financial execution remains disabled.

## App and copier evidence

Exness and RCG passed actual broker-backed Connect → encrypted persistence → owned status → safe Disconnect through the management API. Sessions, ownership rows, database and encryption key in that test were isolated fixtures. This verifies the integration path, not original production ownership or encryption compatibility. The fixture disconnect preserves ciphertext and pauses copying.

Existing backend-gated animations, connection states, cookie ownership checks and audited mentor capital/lot/allocation limits are implemented. Previously passing 25 Python and 35 Node tests, TypeScript checks and builds were reused because app/worker code did not change in this continuation. Deployed browser acceptance remains outstanding. Copier lifecycle, duplicate prevention, recovery, symbol constraints and isolation are simulated: prior five-profile PostgreSQL simulation p95 274.92823 ms, maximum 2753.08356 ms. Actual broker copying/fill latency has not been measured or authorized. Risk-percent sizing is unsupported; supported proportional sizing scales source lots.

## Deployment status and exact gates

Only the private read-only terminal/SDK/status infrastructure is deployed. The public app, new management backend, additive production migration and Pages routing are NOT deployed. PR #134 remains an unmerged draft and includes the unmerged #133 dependency. No automatic deployment is requested by this evidence commit.

1. Authorized access to the original backend/provider environment is needed to recover the existing DATABASE_URL and unchanged SESSION_SECRET, plus database role/schema/TLS/network bindings. They were not found in the authorized VPS discovery. No replacement key, empty database or fixture data is acceptable. Render/Neon connection suggestions do not constitute authenticated provider access.
2. Run the prepared bounded BEGIN READ ONLY schema, privilege, original ciphertext/decryption and mentor/client ownership audit using those bindings. Production compatibility is currently NOT VERIFIED; no production database writes occurred.
3. Verify off-VPS backup/restore, review/apply the additive migration through the existing authorized release workflow, provision correct original ownership/mappings and an authenticated HTTPS/private route to the loopback relay. Preserve all original keys/data.
4. Deploy matching management/API/frontend artifacts through the authorized hosting workflow, retaining the original authentication backend and separate management-origin token; keep financial producers absent. Verify real browser cookies, owned Connect/status/Disconnect, animations and allocation/hold states against original users.
5. Accept external alert receipt, cold restart/reboot and backup restore. Root-password SSH risk remains; do not remove access without independent recovery.
6. Financial execution requires separate explicit approval and current allocation/risk/fee/cleanup checks. Do not clear either stop during this read-only release.

## Recovery

The new Exness/RCG private configurations were backed up before replacement. Gateway/target pre-change copies are under the root-only final-broker-gateway-before backup. Roll back only the new Exness/RCG units and relay registry/credential additions if needed; do not touch existing JustMarkets/Deriv/XM terminals or restore stale trading journals, database data or encryption keys. Preserve audit logs, private bundles and both stops. Public hosting remains unchanged.

Root-side evidence: FINAL_BROKER_SDK_VERIFICATION.json, FINAL_BROKER_RECONNECT_VERIFICATION.json, FINAL_BROKER_STATUS_DEPLOYMENT.json and FINAL_BROKER_MANAGEMENT_VERIFICATION.json. These reports contain no passwords. Final conclusion: five demo broker authentications verified; public deployment and production readiness blocked by original environment access and production acceptance gates.
