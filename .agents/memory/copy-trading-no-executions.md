---
name: Copy-trading "no executions" diagnostic
description: When signals POST OK (HTTP 201) but zero subscriber trades execute, check data linkage before code.
---

# "Signals arrive (201) but no subscriber trades execute"

This is almost always a **data-linkage problem, not a code bug**. `runSignal`
selects subscribers via `app_access WHERE mentor_id = signal.mentorId AND
status = 'approved'`, then per-client requires `client_settings` to have
`copyingEnabled && mt5Connected && mt5Login && mt5Server && encryptedMt5Password`.
Any break in that chain yields zero executions, silently.

**Diagnostic checklist (run in order):**
1. Which mentor fired the signal? `trade_signals.mentor_id`. This is a **user id**, NOT an MT5 account number.
2. Are there approved `app_access` rows with that `mentor_id`? If the firing mentor has zero approved subscribers → 0 executions. (Common trap: approved subscribers exist but `mentor_id IS NULL`, so they map to no mentor.)
3. For each approved subscriber, does its `client_settings` row have all five guards above? Missing `encryptedMt5Password` → skipped "MT5 not connected".
4. Sanity-check the MT5 numbers: subscriber MT5 login lives in `client_settings.mt5_login`; mentor MT5 login lives in `mt5_verified_accounts.mt5_login`. A classic misconfig is the **mentor's** account number stored as a **subscriber's** `mt5_login`.

**Pipeline logging** (added for traceability): webhook logs `[Webhook] signal received & enqueued`; `runSignal` logs `[CopyEngine] processing signal — subscriber selection` with `subscribersFound/subscribersApproved/candidates(clientId,status)/selectedClientIds` and a loud WARN when zero approved; per-client execution ctx carries `clientMt5Login/clientMt5Server`; `mt5-vps.ts` logs `httpStatus` (VPS reached) + `retcode` (order_send result).

**Why:** the engine intentionally fans out best-effort and records skips rather than throwing, so a broken linkage never errors — it just produces nothing. Logs + the four DB checks above localise it in minutes.

**PII rule:** never log subscriber email or decrypted creds in the selection trace — IDs + status only.

## SKIPPED despite "MT5 connected": missing encrypted password
Subscriber trades get marked `skipped` reason "MT5 not connected" (now split: "MT5 credentials missing — please reconnect your account") when `client_settings.mt5_connected = true` but `encrypted_mt5_password IS NULL`. The dispatch guard in `executeForClient` (copy-engine.ts) refuses to call the VPS without a decryptable password, so `/execute-trade` is never hit (explains "VPS only gets manual Swagger calls"). The connect route ALWAYS writes password + mt5Connected together and disconnect clears both — so a connected-but-no-password row is legacy/pre-migration data, NOT a code bug. Remediation = subscriber re-connects via POST /app/mt5-connect. **There is NO license validation anywhere in the dispatch path** (webhook→worker→runSignal→executeForClient); license is not a skip cause.
