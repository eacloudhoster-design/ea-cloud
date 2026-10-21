# Scanner access correction

The browser prepares an image locally; Analyse submits `POST /api/app/scanner/chart` with the existing client bearer session. Previously, shared scanner middleware required an EA-hosting licence matching the client's mentor, with active status and future expiry. It returned “Your licence is inactive or expired” before Gemini was called. This was the wrong product check: scanner subscriptions/admin grants are separate. The code path is confirmed; no production account or database was inspected.

Scanner endpoints now require the existing approved account and a server-side `scanner_entitlements` record for its authenticated client ID. An active hosting licence does not grant scanner access; an expired or absent hosting licence does not block an otherwise entitled scanner account. Registration plans and browser-supplied flags never grant access. Missing, expired, revoked and unapproved accounts remain denied. Existing hosting/authentication/branding/trading routes are unchanged.

## Required migration and account configuration

1. Back up through the normal production procedure and apply `docs/migrations/20261021-scanner-entitlements.sql` once **before** deploying this API. It only adds a table; it does not reset, overwrite or grant access to existing users. The existing scanner-reports migration is still required if not already installed.
2. Reconcile paid scanner subscriptions and approved admin grants against your authoritative billing/support records. Provision each verified existing `app_access.id`; never infer entitlement from a hosting licence or registration plan. This repository has no scanner billing webhook/admin grant interface. Trusted administration must maintain these records until such integration exists.
3. Use a parameterised operation through trusted administration (not a public endpoint):

```sql
INSERT INTO scanner_entitlements (client_id, status, expires_at, reference)
VALUES ($1, 'active', $2, $3)
ON CONFLICT (client_id) DO UPDATE
SET status = 'active', expires_at = EXCLUDED.expires_at,
    reference = EXCLUDED.reference, updated_at = now();
```

`$1` is the verified client ID, `$2` is the actual paid access expiry, and `$3` is a nonempty audited billing/support reference. A NULL expiry deliberately means an indefinite grant and should only be used when explicitly authorised. Renewal updates expiry; cancellation/revocation sets status `revoked` (or `expired` at expiry) and updates the audit reference/time. A past or exact-current expiry denies access even if status remains active. The reference is not returned to clients. Provision legitimate users before switching API versions to avoid missing-grant denials.

No migration, grant, production database write, merge or deployment was performed during this fix.

## Gemini deployment configuration

Set `GEMINI_API_KEY` as a server-only secret and `GEMINI_SCANNER_MODEL` to a model available to that Google project, supporting image input, JSON responses and Google Search grounding. Never use a VITE-prefixed key. Redeploy/restart the API after changing environment variables. Both variables and DATABASE_URL are absent in this development workspace; production settings and a live Gemini call could not be verified. This environment's outbound policy also does not allow the Gemini hostname. No API key was exposed or provisioned.

Readiness checks validate configuration presence/model identifier syntax, not live provider permissions. Staging must verify an entitled account, a real chart and grounded CPI/PPI/NFP/FOMC analysis using the intended Google project. Check Google project model permissions, quota and billing separately from scanner subscription access.

## Failure distinctions and validation

401/403 access errors carry `SCANNER_*` codes, category `access` and no automatic Retry button. Database access-check failures are 503 service errors, not expired licences. Missing key/model are configuration errors; Gemini 401/403 becomes 503 `AI_PROVIDER_ACCESS_DENIED`, never a client licence denial. Provider quota, timeout/network, invalid output and history storage failures have separate safe codes/messages; secrets/provider response bodies are not returned. Transient failures retain Retry.

Automated tests use in-memory account/entitlement/history records and stubbed Gemini responses, never production data. They cover active, missing, expired, revoked and unapproved access, hosting independence, per-client history scope, configuration preflight, provider credentials/model/quota errors, storage preflight, image/report validation and unavailable trade execution. Live PostgreSQL migration and paid-provider checks remain staging requirements.

Validation completed: 51 Node tests passed; shared-library, API and client TypeScript checks passed; API production bundle and combined Pages build passed. The Chromium production-UI suite passed gallery/camera preparation, scan/results/history, cancellation/retry, 320px mobile layout, unavailable execution, and distinct expired-subscription versus provider-credentials alerts without Retry. All API/browser provider and account data were isolated fixtures. Existing sourcemap/chunk-size warnings remain.
