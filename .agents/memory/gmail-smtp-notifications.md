---
name: Gmail SMTP email notifications
description: How EA Cloud sends transactional email and the App Password gotcha that causes 535 BadCredentials.
---

# Gmail SMTP email notifications

EA Cloud's backend email service sends via **Gmail SMTP using nodemailer** (`smtp.gmail.com:465`, TLS), reading credentials **only** from the `EMAIL_ADDRESS` and `EMAIL_PASSWORD` Replit Secrets. (This replaced an earlier Resend-based service.)

**Gotcha — `535-5.7.8 ... BadCredentials`:** Gmail SMTP rejects a normal account password. `EMAIL_PASSWORD` MUST be a **Gmail App Password** (16 chars, generated at myaccount.google.com → Security → App passwords), which requires 2-Step Verification enabled on the account. A 535 / EAUTH at send time is almost always the wrong secret value, NOT a code bug.

**Why:** end-to-end test reached Gmail and authenticated, proving transport/wiring are correct; the only failure was credential acceptance — only the account owner can supply a valid App Password.

**How to apply:** if email send fails with 535/EAUTH/BadCredentials, do not change the email code — ask the user to set `EMAIL_PASSWORD` to a Gmail App Password (and ensure 2FA is on). Verify via the protected `POST /api/test-email` (super-admin only, rate-limited).

**Gotcha — `454-4.7.0 Too many login attempts`:** triggered by bulk sends. nodemailer (non-pooled) opens a **new SMTP connection and re-AUTHs for every `sendMail`**, so blasting dozens of emails in seconds = dozens of logins → Gmail throttles new logins and temporarily locks the account out (cooldown can last many minutes to ~1h). This is NOT a credential problem and NOT a code bug at that moment.

**Why:** earlier whitespace-trimmed App Password worked for single + small sends; only rapid repeated bulk batches (60+ each, several times in minutes) tripped it.

**Gotcha — bulk-campaign personalization comes up empty in dev:** the `broadcast-*` endpoints look up mentor names from `usersTable` by email, but this environment's DB does NOT contain the real production mentor roster, so name lookups return nothing and every greeting falls back to the generic default. The actual name↔email mapping for these campaigns lives in the pasted recipient attachment files in `attached_assets/`, NOT the DB.

**How to apply:** if a campaign must be personalized by name, build the name map from the attachment (or pass names explicitly in the request body) rather than relying on a DB lookup; verify by checking `personalized: true/false` in the per-recipient send logs before assuming names landed.

**Gotcha — bulk send outlives the curl client; don't re-send on a client timeout:** a large sequential broadcast (e.g. 41 recipients with inter-send pacing) takes ~40s and the `curl` through the `localhost:80` proxy disconnects/exits early (bash shows exit -1, no body), but the Express handler keeps running to completion server-side and still logs the final `... campaign complete {total,sentCount,failedCount}`. Re-running the curl would DOUBLE-email everyone.

**How to apply:** after a bulk-send curl times out, do NOT resend. Call `refresh_all_logs` AGAIN to get a fresh snapshot (the previous snapshot file is frozen at its capture time and never grows) and confirm the `... campaign complete` line + per-recipient `Sent ...` count before deciding anything. Only resend the specific addresses that have no success log line.

**How to apply:** keep the transporter configured with `pool: true, maxConnections: 1, maxMessages: Infinity, rateDelta: 1000, rateLimit: 10` so we authenticate ONCE and reuse the connection (this is the durable fix and prevents recurrence). When you hit a live 454, STOP retrying — each retry adds more login attempts and extends the lockout. Wait out Gmail's cooldown (~30–60 min) before resending. Bulk approval resends go through `POST /superadmin/mentors/resend-approval-email-personalized` (super-admin) which sends sequentially with per-recipient logging.
