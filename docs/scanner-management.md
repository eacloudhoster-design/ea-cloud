# AI Scanner Management

The “No scanner subscription or admin grant is linked” message means the approved mobile client has no separate scanner entitlement. EA-hosting licences deliberately do not grant scanner rights. The superadmin portal now provides `/superadmin/scanner` with search, grants/revocation, subscription status, credit balance, expiry and audit reference. All changes are saved to PostgreSQL, not browser storage.

## Grant your client account access

1. Sign in to the existing superadmin dashboard and choose **AI Scanner Management**.
2. Re-enter your superadmin password to unlock the 30-minute scanner administration session.
3. Search for the email or client ID used to sign into the mobile app. Portal superadmins and mobile clients are separate database accounts: matching names or emails do not implicitly grant client rights. If no mobile account exists, use the existing app registration and App Access approval flow.
4. Choose **Manage access**, set status **Active**, set the remaining scan credits, choose an expiry (shown in your browser's local time), and enter a subscription/payment/support reference. An empty expiry deliberately grants indefinite access; unlimited credits require explicitly checking the box.
5. Choose **Save scanner access**. The confirmed database change governs the next scan without logout/redeployment. Return to the scanner and analyse again. Approval is still required; scanner grants cannot override rejected/pending app accounts.
6. To revoke, choose **Revoked / remove access** and save. To top up, set the new **absolute remaining balance**, not an increment. The server rejects stale edits if credits/access changed while the form was open; refresh and reopen before retrying.

An already running scan may complete before a revocation commits. Database row locks serialize account/grant edits and credit use. A successfully saved chart or fundamental report costs one credit, including NO TRADE reports; provider errors, cancellation before saving, or failed storage roll back without charging. At zero credits new analysis is denied, while existing history remains readable if the subscription is otherwise active. Existing NULL credit balances retain unlimited access: the migration does not reset subscriptions.

## Superadmin testing and authorization

The **Superadmin scanner test** on this page uses the approved superadmin's verified session, independent of client/hosting subscriptions. Upload a JPEG/PNG/WebP under 2 MB and choose **Analyse test chart**. It runs the real Gemini adapter, consumes provider quota but no client credits, does not save a client history record, and never executes trades. If Gemini is not configured, it reports the configuration error rather than inventing results. To test the complete client history/credits flow, grant your real approved mobile account through the controls above.

The existing portal token encodes a role without a cryptographic signature. These new privileged endpoints do **not** trust that legacy token, a client-supplied role, registration plan or user ID. `/api/superadmin/scanner/session` verifies the existing password hash and the database role/status, then issues a random 256-bit token. Only its SHA-256 digest and expiry are stored in PostgreSQL. The dashboard holds the raw token in memory only; refresh or **Lock management** requires reauthentication. Every management/readiness/test request validates expiry and rereads the current approved-superadmin role; suspended/demoted/deleted users are denied immediately. Password login is rate limited; test scans are separately limited. Each grant edit/revocation records the actor and before/after state in `scanner_access_audit` in the same transaction. No ordinary-user grant endpoint exists. Existing unrelated authentication/hosting routes have not been rewritten.

## Deployment and migration verification

Use the normal backup and migration procedure. Apply only migrations not already applied, in order:

1. `docs/migrations/20261021-scanner-reports.sql`
2. `docs/migrations/20261021-scanner-entitlements.sql`
3. `docs/migrations/20261021-scanner-management.sql`

The new migration adds a nullable credit balance and two new scanner-only session/audit tables. It does not create grants, alter hosting licences, reset balances or overwrite existing records. Do not run a force schema push or replay earlier CREATE TABLE migrations on an existing installation.

With the intended API environment's `DATABASE_URL` configured, run this **read-only** check from the repository root:

```sh
node scripts/check-scanner-migrations.mjs
```

It queries the required scanner tables/columns, prints no connection string/records, and exits nonzero when unavailable/incomplete. The dashboard also queries the live tables for its “PostgreSQL scanner tables verified” state. A missing session table prevents unlock and yields an explicit migration/connectivity message. These checks verify required table/column availability, not a migration ledger or a full constraint audit.

Restart/deploy the reviewed API and combined web build only after migrations succeed. Configure server-only `GEMINI_API_KEY` and `GEMINI_SCANNER_MODEL`; preserve existing API routing, mentor storage and hosting settings. Confirm the real provider using the superadmin test and verify a grant, credit charge, failed-scan noncharge, history reload and revocation with a staging client. No MT5 trade execution is introduced.

## Verification limits in this development workspace

No DATABASE_URL or Gemini key is configured. The read-only migration check was run and correctly reported that production migration state cannot be verified. No production database records were accessed, no grants were made and no migrations were applied. PostgreSQL persistence is implemented with real Drizzle transactions, row locks, foreign keys and check constraints; isolated route tests use an in-memory adapter, not a live PostgreSQL server. Production migration/account/provider verification remains required.

The current sandbox blocks browser startup (`setsockopt: Operation not permitted`) and local listening sockets. HTTP route tests therefore exercise the real Express stack in process, with isolated records and provider stubs. A production-dashboard browser test is provided in `scripts/tests/scanner-admin.browser.mjs` for a browser-capable environment; it was attempted here but did not run. No screenshot or browser pass is claimed for this change.

Completed validation: 53 Node tests passed across all test files; library, API, portal and mobile TypeScript checks passed; API production and combined Pages builds passed (existing sourcemap/chunk-size warnings remain). New in-process tests cover credential verification, opaque session storage/expiry, forged/ordinary/suspended/demoted sessions, grants/revocation/auditing, stale edits, credit exhaustion/history access, one-credit concurrency, failed provider/storage rollback, cancellation and superadmin test isolation.
