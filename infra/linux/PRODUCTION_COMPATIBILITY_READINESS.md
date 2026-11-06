# Production compatibility continuation — 6 November 2026

## Verified privately against the original production database

The supplied original database URL and unchanged session secret are stored outside Git in a root-owned mode-0600 file under a mode-0700 directory. They are not included in this report or the PR. All production queries ran inside explicit READ ONLY transactions; no migration, backfill, session refresh, key rotation or production record change occurred.

TLS is encrypted and the server certificate authorized. All existing application table columns match the reviewed schema except the exact additive PR migration below. Existing unexpired session records match their account credential hashes and allowed role/status rules; stored login hashes match the existing authentication format. Actual browser login has NOT been accepted. The unchanged secret decrypts existing encrypted API keys and every decrypted value matches its stored hash. No original MT5 credential ciphertext exists, so historical MT5 ciphertext compatibility cannot be claimed; an in-memory MT5 encrypt/decrypt roundtrip under the original secret passed without database storage.

Ownership inspection found no dangling assigned mentors, license-to-mentor mismatches, duplicate cross-owner MT5 bindings or invalid allocation owners. Some app clients are legitimately unassigned; do not assign them automatically. One pre-existing client-settings row has no matching app client. No mentor MT5 source connections or observer allocations are enrolled in production. Existing copying preferences do not constitute execution authorization. Detailed aggregate findings remain in root-side verification reports.

## Fix included in this continuation

Management startup previously required an existing MT5 ciphertext, preventing first enrollment in this original database. If and only if client MT5 ciphertext is absent, startup now requires nonempty original API-key ciphertext, authenticates AES-GCM using the unchanged session secret and the existing API-key salt, and verifies each decrypted API-key hash and format against its original record. No development key or empty-evidence override is allowed. Invalid existing MT5 evidence cannot fall back to API-key evidence. Missing/wrong/tampered keys, hash mismatches, schema/privilege failures and an unsafe gateway still fail closed. This is original-key verification, not a claim of historical MT5 ciphertext evidence.

Targeted startup tests pass, including first enrollment, missing/wrong/tampered/hash-mismatched evidence, no fallback after invalid MT5 evidence, privilege and gateway refusal. API TypeScript and the isolated management build pass. Unchanged frontend and copier tests/builds were not repeated. Live read-only startup preflight correctly refuses the missing production schema. No broker requests or orders were issued by these checks.

## Exact remaining release gates

1. Review and explicitly authorize `migrations/20261106_mentor_copy_policies.sql` after confirming a consistent production restore point: create `mentor_copy_policies`, create `mentor_copy_policy_audit`, and add nullable `mt5_connections.encrypted_mt5_password`. No existing table/column is dropped or credential overwritten. It has NOT been applied. Recheck schema and privileges afterward before starting management.
2. Preserve/exclude the orphan settings row; determine its intended ownership privately rather than deleting or reassigning it. Authorize actual mentor/client demo enrollment and policies through the authenticated app; do not infer app ownership from broker login knowledge. Leave unassigned clients unassigned and copying disabled until their allocation is authorized.
3. Existing Render and Cloudflare runtime/deployment access is still needed. A supplied database binding is not hosting deployment access. Inspect original public origin/session settings, private MT5 transport/token route and independent management proxy token; retain the existing authentication backend. Public Cloudflare routes previously returned HTTP 403. Do not bypass protection or expose plaintext MT5 credential transport.
4. Obtain explicit merge/deployment authorization after these gates. PR #134 can be reviewed but is NOT cleared for an auto-deploying production merge. Deploy matched management/frontend artifacts through the existing hosting workflow with financial producers absent.
5. Verify real original-user login, client/mentor isolation, actual connection/status/hold animations, safe disconnect/reconnect and audited allocation limits in the deployed browser. Existing session-record compatibility is not a successful password/browser login.
6. Broker execution remains separately gated: current authorized demo mapping, costs/margin/risk/cleanup and exact bounded approval. Both emergency stops remain active; no actual broker copying or <=15-second fill-to-fill latency acceptance is claimed. Existing simulated latency evidence is unchanged.

## Rollback

Retain the previous public artifact and routing configuration. If later deployment fails, restore only those artifacts/routes and stop the new management service; preserve original authentication backend, session secret, database records, journals and broker terminals. Leave any reviewed additive nullable/table schema in place unless a separate recovery review authorizes a change; do not drop policy/audit data. Do not restore stale production databases or clear either stop. Offsite restore, alert delivery and cold reboot acceptance remain independent gates.

Current decision: baseline connectivity, original-key and stored-session checks passed; full release compatibility is blocked by the additive schema and production ownership/enrollment/hosting acceptance. No public app/backend deployment or PR merge occurred.
