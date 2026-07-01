---
name: app_access mentor linkage
description: How a subscriber (app_access) gets tied to a mentor for copy-trade dispatch, and why approval must set mentor_id.
---

Copy-trade dispatch (`runSignal` in copy-engine.ts) selects subscribers with
`app_access WHERE mentor_id = signal.mentorId`, then filters `status='approved'`.
So **app_access.mentor_id MUST be populated or the subscriber receives nothing**.

The mentor link is owned by the `licenses` table (`licenses.mentorId` notNull,
paired to a subscriber by `clientEmail`). `app_access` only carries nullable
`mentorId` + `licenseKey` copies of that link.

**Rule:** mentor_id is derived from the subscriber's active license — never
entered directly. Resolve by `app_access.licenseKey` first, else most-recent
active license matching email (`ilike` for case-insensitivity, since app_access
emails are lowercased but license emails may be mixed case).

**Why:** historically mentor_id was only set at license activation
(`POST /app/activate`, client-app.ts), which happens *after* approval and only
if the client activates — so approved-but-unactivated subscribers had
mentor_id=NULL and silently got no signals. Approval now backfills it.

**How to apply:** the approve handler (app-access.ts) sets mentor_id+licenseKey
inside a DB transaction with the status update; logs `APPROVAL_GRANTED` then
`MENTOR_LINKED` (pino markers, not console.log). Idempotency guard: if mentor_id
already set, keep it (don't clobber manual mappings on re-approval). No active
license → still approve, log a warning, leave mentor_id NULL.
