# Start/Stop Bot control repair

This change is based on accepted main94502bf and preserves Person1's application design, original users, current database schema and all execution gates. It does not enable a terminal, grant execution, clear an emergency stop, submit an order or turn a saved preference into a running bot.

## Fixed behavior

* A Start request snapshots its settings row and PostgreSQL xmin before the existing readiness proof. It does not hold the row lock during broker/gateway I/O. At commit it locks/rechecks the version. A completed Stop, reconnect or settings change makes the old proof stale, returning409/BOT_CONTROL_CHANGED rather than reversing that change. A fresh user request must verify again; there is no automatic command retry.
* Stop remains independent of Start prerequisites and gateway availability. Repeating Stop is safe and does not duplicate notifications. Existing positions and journals are retained.
* Failed push notification enqueue cannot turn an already-committed Start/Stop into an ambiguous500. A fixed warning is logged without raw errors or credentials.
* Initial settings creation handles concurrent requests through the existing unique client ID rather than reporting a spurious duplicate-row failure.
* Existing cookie/origin/entitlement verification, account ownership, mentor allocation, read-only/stop/recovery checks and management-only deployment restrictions remain unchanged.

No schema migration is needed. xmin is used solely as an optimistic transaction version, never as user identity or execution authority. Any version change invalidates the old Start conservatively.

## Verification

The existing real browser-session/API integration scenario was extended and passed. It uses real PostgreSQL semantics through isolated PGlite, actual session middleware and the real control handler, with explicitly synthetic broker responses. It proves valid permitted Start/Stop, management-mode rejection, repeat Stop, notification-failure persistence and Stop winning while a Start proof is pending. No production user session was forged or created.

The accepted API production build passed. API TypeScript checks passed after building the referenced DB and API-Zod declarations. No broad engine suite or terminal rebuild was repeated.

## Confirmed production state before rollout

Render service `srv-dbb8b1lg1s2s738j57eg` is the existing `ea-cloud-api`, connected to the intended repository/main branch. Its live deploy before this change is `dep-dc5gis3bc2fs73at7g5g`, commit94502bf. Startup logs confirm MT5_GATEWAY_REACHABLE. Actual Start attempts are rejected with DEPLOYMENT_EXECUTION_DISABLED. The current deployment intentionally remains management-only.

The VPS has six disabled/unapproved demo engine accounts, no configured account risk policies and zero active execution sessions. Both original emergency-stop hashes match the baseline. Three original-owner associations have been verified; three remain awaiting_owner. Logs proving transport reachability do not prove financial execution permission.

## Rollout, acceptance and rollback

Deploy only this bounded backend change through the normal reviewed main branch. Do not deploy old conflicting PR138 or set EA_MT5_MANAGEMENT_ONLY=0 as a shortcut. Preserve all Render variables, original DB/session bindings, hosted UI and safety controls. Monitor the automatically created Render deploy until live; do not trigger a redundant deploy.

After rollout verify public API health/readiness, release commit and unauthenticated control denial. Positive production Start/Stop acceptance requires the actual owner's authenticated browser/session; do not extract another user's session or manufacture one. Check fixed bot_control_acknowledged/bot_activation_rejected events without recording cookies or broker credentials. Stopped means copying preference is off; it does not claim to close existing broker positions or cancel a request already submitted to a broker.

A code rollback can redeploy the retained pre-change94502bf artifact using the existing Render service. It does not roll back data or clear stops. Inspect auto-deploy behavior before selecting a historical revision, and preserve original credentials/configuration.

## Remaining execution authorization

For a genuinely running bot, account ownership alone is insufficient. Required inputs remain original-owner-approved allocation/symbol/risk policy and a separately authorized bounded execution session under the existing emergency controls. Current management/read-only mode, active stops and absent execution policies prevent positive Start acceptance. These controls are not bypassed by this repair or by a user's general request to fix a button. Real broker execution and authenticated production Start success must not be claimed until they actually occur with the required authorization. No real-money trades are permitted in this task.
