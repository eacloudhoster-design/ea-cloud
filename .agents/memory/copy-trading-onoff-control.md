---
name: Copy-trading on/off control
description: Where the Start/Stop (pause) state lives and how the two distinct "client" tables relate to it
---

The user-facing Start/Stop (a.k.a. ACTIVE/PAUSED, "bot running") control is backed by
the SINGLE existing field `clientSettingsTable.copyingEnabled` (bool, default true).
Do NOT add a separate "copy_trading_enabled" column — that would fork engine state.

**Why:** The copy engine already guards on `settings.copyingEnabled !== true` before
each copy and records a skip when paused. Adding a parallel flag means the engine and
the UI can disagree.

**How to apply:**
- Subscriber control + persistence: `GET`/`PATCH /api/app/trading-controls` body
  `{copyingEnabled}` (auth = client base64 token). Both mobile (ea-app) and web
  client dashboard (ea-cloud) load this on entry and PATCH on toggle. Always
  roll back optimistic UI if the PATCH fails (parity between both clients).
- Two different "client" tables — do not confuse them:
  - `appAccessTable` (+ `clientSettingsTable` where `clientId = app_access.id`) =
    the real copy-trading subscribers the engine fans out to (has `mentorId`,
    unique email). Super Admin "App Access" page lists these.
  - `clientsTable` = the mentor's license/registry list shown on the mentor
    "My Clients" page. It has NO copyingEnabled.
- To show copy status on the mentor "My Clients" page, `/clients` LEFT JOINs
  app_access by `mentorId` + case-insensitive email, then client_settings. This is
  **best-effort** (email can diverge) and returns null when unmatched — acceptable
  for a read-only badge, but it is not an FK. If exact mentor↔subscriber linkage is
  ever required, add a durable FK rather than trusting the email match.
