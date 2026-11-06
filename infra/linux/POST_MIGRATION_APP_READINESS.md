# Post-migration app release readiness — 6 November 2026

The owner-approved additive migration `20261106_mentor_copy_policies.sql` (SHA256 `20dacd4633f0a23b3518e8bdb94840e7381353a1d737b26d9fa95d19af0a3b87`) committed successfully to the original production database. The verified consistent pre-migration archive and full isolated restore evidence remain private. One bounded transaction validated all original table contents unchanged before commit. No original user/session/credential/trading records were modified. Only the two empty policy/audit tables and nullable mentor encrypted-password column were added. Copying defaults FALSE; no policy was enabled.

Post-migration original database/key/schema/privilege preflight PASSES. Original encrypted API-key hashes and stored-session compatibility remain valid; no original MT5 ciphertext exists. Backend status-only gateway contract passes using the existing private loopback token. This verifies the management code's production database compatibility and local VPS communication, not the Render-to-VPS network path or a deployed browser login.

## Final safe integration fix

The optional management-origin proxy now also routes exact client `/api/app/trading-controls` GET/PATCH requests to the isolated management API. This avoids leaving client allocation/risk settings on the old backend during a split release. Authentication, ownership and CSRF checks remain enforced; neighboring paths and auth/financial routes retain the original backend. New management client defaults request NO copying. Saving preferences cannot queue a misleading trading-started/stopped push notification. Stored requested preferences still do not grant financial permission. Mentor policy editing remains owned and audited.

Targeted Pages routing and engine integration tests cover owned capital save/read, denied portal-as-client requests, anonymous and forged identity denial, invalid risk and cross-site rejection, no encrypted password in responses, safe new defaults, suppressed execution notifications and absent financial routes. API TypeScript and the isolated management build are release checks. Unchanged frontend, broker authentication and financial copier simulations were not repeated. Initial local test invocation lacked its existing PGlite module environment; configuring that existing fixture dependency resolved the harness failure without package installation or production access.

## Five broker app scope — do not overclaim

Both mentor and client selectors include JustMarkets, Deriv, XM Global, Exness and RCG Markets. Their prior actual demo SDK authentications are preserved and not repeated. Client success animation depends on an exact authenticated backend identity response, not a timer or local form data. Owned encrypted storage, safe logical disconnect/reconnect and role/owner protections have isolated API test evidence. No test account credentials or account numbers are hardcoded into the public app.

The deployed private status relay intentionally admits only separately provisioned credential-bound account workers. This is NOT an unrestricted self-service account-enrollment service. An arbitrary user's new account, or a mentor-role account on a client-role worker, cannot be claimed connected. General user-owned account provisioning, role allocation, capacity and operational acceptance remain incomplete. Do not share the provisioned demo accounts across app users or silently switch their roles. Production app ownership/source enrollment and copier allocations remain to be configured by authorized owners; preserve unassigned clients and the pre-existing orphan settings row.

## Remaining release gates

1. Authorized existing Render/Cloudflare runtime, deployment and private-origin configuration access. The supplied database binding does not provide provider deploy permissions. No Render/Cloudflare tools are currently available in this session. No public app/backend deployment was performed.
2. Verify original origin/session settings and authenticated HTTPS/private routing from the existing Render backend to the VPS. Loopback-only gateway success does not satisfy that cross-host requirement. Keep the original authentication backend and session secret; do not migrate hosting or expose unprotected credential transport.
3. Explicit approval for the exact reviewed merge and non-trading deployment. Migration approval is not merge/deployment authorization. PR #134 remains unmerged and must not trigger an automatic production rollout.
4. General independent account enrollment/provisioning and actual original-owner mentor/client mappings. No production client account settings/policies were saved as test data, and no new source/receiver assignment was fabricated.
5. Real deployed browser acceptance: original-user logins, verified/failed/disconnected/held connection states and animations, owner isolation, policy persistence/audit and capital/risk settings. Test fixtures are not production-browser acceptance.
6. Separately approved bounded demo opening/modifying/closing, current costs/margin/risk/cleanup, and broker-confirmed copying latency. Existing five-profile synthetic timing is not actual execution acceptance. Both emergency stops and disabled financial execution remain unchanged; zero broker orders.

## Recovery after applied additive migration

Keep the new empty tables/nullable column in place while retaining or restoring the old public artifact/routing. Do not run a destructive down migration or restore the database over live newer records. The prior backup was successfully restored only into an isolated private local database. Off-VPS backup/PITR, external alert receipt and cold-reboot acceptance remain unverified. The original approval/recovery package remains the authoritative incident procedure.

Current outcome: production migration and local management compatibility PASS; public deployment and unrestricted account enrollment NOT COMPLETE; no claim of production readiness.
