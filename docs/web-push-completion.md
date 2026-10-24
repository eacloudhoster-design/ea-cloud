# Complete Web Push — follow-up to merged PR #70

## What is known about production

The owner confirmed they have **not manually configured Web Push or confirmed the migration**. This workspace has no Render credentials, production database connection or physical iPhone. Therefore actual production VAPID presence, table existence, OS permission and APNs delivery remain **unverified**. Local test readiness is not a production observation. No production database changes, Render settings, deployment or merge were performed.

PR #70 was already merged on GitHub (`bf87407`). This work continues its implementation on a separate fix branch. Kokoro code, voice recordings/model, startup animation, CSS/layout, floating panel design and trading execution logic are unchanged.

## Concrete defects corrected

* The old bell blindly unsubscribed an existing device. It now enables/repairs idempotently; repeated taps cannot turn push off. A missing PostgreSQL row is repaired using the existing local subscription. Temporary storage errors retain it for a later retry.
* Registration waited on `navigator.serviceWorker.ready`, which can refer to another worker or wait forever. Setup now waits, with a timeout, for the actual returned installing/waiting/active push worker, including upgrades. It registers `/ea-app/push-sw.js` with scope `/ea-app/` and bypasses script HTTP cache.
* Missing VAPID, mismatched keys and missing tables previously disappeared into silent failures. Safe readiness/status checks and categorized logs now explain each failure without exposing keys, tokens, endpoints or raw provider bodies.
* The old sender claimed events before provider acceptance and had no per-device retry record. Events now expand atomically into persistent device deliveries. Already accepted devices are not sent again when another device fails. Explicit HTTP 429/500/502/503/504 rejections get bounded retries with Retry-After. 404/410 removes expired subscriptions. Unknown/ambiguous network failures are not blindly retried. Crash leases can recover; the worker's persisted receipts plus stable OS notification tags suppress duplicate logical events.
* The old service worker accepted only the old robot messages. It now accepts versioned robot/trade payloads, uses the existing EA Cloud icon and safe click targets, rejects expired/invalid messages and suppresses other-account data using persistent device account binding. Logging out clears routing, closes notifications and unsubscribes the device best effort.
* The legacy app token encodes an ID/time and is not itself cryptographic proof of password login. Push subscription management now additionally requires a purpose-bound HMAC proof cookie minted only by successful signup/password login. It is HttpOnly, Secure, SameSite=Strict, bound to the exact bearer token/client and expires after 30 days. It reuses the **existing SESSION_SECRET**. Existing app token format, authentication/session licence checks and all non-push endpoints remain unchanged. Existing subscription rows are preserved with a null verified_at; they cannot receive new notifications until a signed-login enrollment verifies that device. A client ID alone cannot claim another user's push subscription.

The existing Settings bell remains visually unchanged and requests the OS permission prompt only on a user gesture. Its action now means **Enable or repair push notifications**, rather than a blind toggle. Users can revoke notification permission in iOS Settings or sign out to unsubscribe. No in-app banners, popups or extra controls were added.

## Robot and verified trading events

Only a persisted robot-state transition creates a robot event. Failed activation/deactivation and repeated writes create none. Start delivery waits for the real copy-engine health callback and is suppressed if the robot has stopped in the meantime. Stop follows a successful disabled-state save. Messages are exactly:

* `EA Cloud` / `Robot started successfully.`
* `EA Cloud` / `Robot stopped successfully.`

A passive observer of the existing persisted copy-trade execution updates now queues user-specific trade notifications. It does not place, retry, change or simulate trades:

* Pending OPEN BUY/SELL receipt → `EA Cloud — Trade Alert` / `[symbol] [direction] signal received.` Deduplicated by actual signal/client.
* Completed OPEN BUY/SELL receipt → `EA Cloud — Trade Executed`, only with success, a broker ticket, completion retcode 10009/10010 and an actual fill price from the saved broker response. A 10008 pending-order acceptance is **not** execution. Screenshot/chart/signal entry prices never substitute for a fill.
* Terminal failed/skipped receipt → `EA Cloud — Trade Failed`. Known actual broker codes provide margin/lot/rejection/trading-disabled causes. Exact known backend reasons supply robot-inactive/disconnected causes. Unknown details produce `See execution details in EA Cloud.` instead of invented reasons or leaked raw messages. Retryable in-progress failures do not produce a false terminal failure.

The scanner's live execution adapter still reports unavailable and returns a safe refusal. No scanner fill notification is fabricated. A future genuine scanner receipt source must be connected to the backend notifier when real execution/receipt persistence exists. The MT5 login preview also cannot originate a fake connected/trade notification.

Trade notifications open MetaTrader plus the existing activity panel. Robot notifications open Home plus that same panel. Existing app windows use a scoped service-worker message; cold opens use validated `/ea-app/?tab=...&activity=1` links, applied after authentication. No external redirect is allowed. Notification click routing does not change existing tab/swipe behavior.

## Production setup reference — perform one step at a time

**Do not execute migrations, change Render variables, merge or deploy without the owner's approval.** First inspect existing configuration. Do not generate replacement keys if a valid pair already exists.

1. In Render, open **ea-cloud-api → Environment**. Check presence of `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`. Do not paste values into chat. Keep the existing `SESSION_SECRET`; **never rotate it for this task** because stored MT5 credentials also depend on it. Push proof signing needs that existing value to be at least 16 characters; the read-only check reports only whether it is configured adequately.
2. If the VAPID pair is absent, generate it privately with the already-existing `scripts/generate-web-push-keys.mjs --subject mailto:your-support-address`. Its Git-ignored owner-only `work/web-push.env` contains the three settings. Configure them privately on the existing API service after approval. Render saving environment changes can trigger a deployment: do not save/change them before that approval. Keep this pair stable. VAPID has no subscription or per-notification fee.
3. Read-only database inspection must establish whether `push_subscriptions`, `push_events` and `push_deliveries` exist and whether the delivery columns are present. After approval, apply `docs/migrations/20261024-web-push.sql` if the base tables are missing, then `docs/migrations/20261025-web-push-reliability.sql`. The follow-up adds a nullable subscription verified_at, source/payload fields, a delivery table and indexes, and widens the kind constraint without deleting/resetting rows. The widened check is NOT VALID for legacy rows, preserving unknown historical rows while enforcing allowed new values. Already claimed historical events are not replayed. Do not run a destructive schema push or reset.
4. The new `node scripts/check-web-push.mjs` is **read-only**, run from the repository root in an authorized environment with this revision and existing backend variables available. It reports presence/configuration/table readiness only, never keys or connection URLs. Its local output here does not establish Render configuration. There is also authenticated `GET /api/app/push/status`, with safe own-device counts, migration/configuration codes and last delivery status. It requires the fresh login proof cookie.
5. Once code/configuration/migrations are reviewed and deployment is explicitly approved, deploy the API and Pages frontend from the reviewed revision. The worker intentionally has no fetch handler, so HTML/API/voice caching is unchanged. Existing Pages proxy behavior preserves Set-Cookie; use the HTTPS `/ea-app/` site and same-origin `/api` requests.
6. **Sign out and sign back in inside the installed iPhone PWA once after deployment**, so it receives the secure push-management proof cookie. Existing long-lived legacy sessions cannot enroll merely by presenting an encoded ID. Then tap the existing Settings bell to reverify the device, allowing the native notification prompt if required. Previously saved subscriptions are retained but inactive until this verification. iOS 16.4+ requires Home Screen installation and a user gesture; allowing permission in ordinary Safari is not an equivalent test. No Home Screen reinstall is normally needed for this push-only worker update. If denied, change the app's notification permission in iOS Settings, then reopen and tap the bell again.
7. With the owner's intended real robot activation/deactivation, test successful and failed operations, repeat taps, foreground, background, closed PWA and locked phone. Do not create a simulated trade to test execution notifications. Verify actual broker-receipt notifications only when genuine trading infrastructure is operational. Check iOS Focus/notification settings and connectivity.

## Safe diagnostics

* `PUSH_VAPID_MISSING`: known variable names are absent; no values are logged.
* `PUSH_VAPID_INVALID`: public/private mismatch or invalid subject/key material.
* `PUSH_BASE_MIGRATION_REQUIRED` / `PUSH_DELIVERY_MIGRATION_REQUIRED`: required storage schema missing.
* `PUSH_STORAGE_UNAVAILABLE`: database could not be checked or notification persistence failed.
* `PUSH_LOGIN_REQUIRED`: fresh password login required for the push-only proof cookie. Ordinary app access is unchanged.
* `PUSH_SESSION_CONFIGURATION`: existing SESSION_SECRET absent/too weak; investigate without rotating a secret protecting existing encrypted data.
* `web_push_no_subscription`: no opted-in device for an actual event.
* `web_push_sent`: push provider accepted the request; **not proof the iPhone displayed it**.
* `PUSH_VAPID_REJECTED`: provider HTTP 401/403; check VAPID/subject/subscription key consistency.
* `PUSH_RETRY_SCHEDULED`: explicit transient rejection, with bounded retry state in PostgreSQL.
* `web_push_subscription_expired`: provider 404/410; local device must re-enroll.

Subscriptions are bound to the authenticated account. Endpoint ownership cannot be reassigned through POST; a new account rotates its local endpoint. The service worker's account binding persists when the PWA is closed and prevents another account's private trades from being displayed after an account change. No MT5 password, bearer token, API key, raw provider error or credential is included in a notification.

## Testing and limits

Tests cover positive/negative state writes, duplicate writes, real PostgreSQL subscription/source-key uniqueness, per-device retries, configuration/migration readiness, key-pair mismatch, expiry, cross-account ownership, login-proof forgery/expiry, permissions, missing-row repair, temporary storage failure, worker upgrade activation, actual service-worker notification dispatch, duplicate suppression, private account rejection and click routing. App tests exercise the existing controls, failure paths, notifications opening the proper tab/panel, unchanged navigation bounds and preserved voice announcements.

Browser Push dispatch is injected through Chromium at the push-service boundary; it is not a live APNs send. No physical iPhone or production subscription was available. Provider acceptance does not guarantee a banner/Lock Screen display: iOS Focus, user settings, offline devices, browser storage eviction, expired subscriptions and OS delivery policy apply. Ambiguous failures can be lost; crash recovery can resend the same logical event, which the service worker/OS tag deduplicates. Producer enqueue failures are logged and never undo a successful trade/state change. There is no exactly-once or guaranteed delivery claim.

All added components use the existing backend/PostgreSQL and standards-based free Web Push. There is no new paid service or voice change. Live iPhone verification remains a release gate.
