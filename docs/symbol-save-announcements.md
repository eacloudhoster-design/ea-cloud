# Symbol configuration announcements

A confirmed symbol save now reuses the existing voice and Web Push infrastructure. No voice provider, subscription, permissions UI, broker/lot selection, or trading behavior has been replaced.

## Confirmed-save flow

1. Each Save action has a fresh `X-Symbol-Save-Id`. A synchronous in-flight guard prevents rapid duplicate taps from issuing multiple requests.
2. The existing authenticated/licensed PATCH route validates and persists symbols as before, then reads the saved rows. It queues `symbol_configured` events only for configured pairs included in this request, using the persisted broker variation, and returns the save ID alongside the existing array response. Removal/clearing is silent.
3. Each client/pair/save ID is unique in the existing push outbox. Replaying the same ID cannot create another notification; a new intentional successful save gets a new ID. The existing worker handles delivery, retries, device ownership and receipt deduplication.
4. The frontend verifies the returned symbol and normalized lot size against the submitted values before emitting `symbol-saved` with the same save ID. A bounded seen-ID set prevents duplicate emissions. Both the Home symbol editor and existing bulk trading-settings save use this confirmation helper.
5. The existing natural voice hook plays the already bundled **“Symbol configured.”** clip. Its low-priority append mode queues behind important speech rather than interrupting it. The voice identity, Start/Stop, connection, mode and scanner announcements remain unchanged.

Push title: **Symbol Configured**. Body: **[actual saved broker symbol] configured successfully.** No individual trading pair is hardcoded. Notification text rejects control characters and oversized labels under the existing bounded payload policy.

No success announcement is emitted for rejected, failed or unconfirmed saves. Voice failures do not undo settings. A failed push enqueue is logged as `web_push_enqueue_failed` / `PUSH_SYMBOL_ENQUEUE_FAILED`; the successfully saved settings still return normally. As with existing notifications, provider acceptance does not guarantee OS display. An unavailable outbox cannot persist an event retroactively.

## Changed files

| File | Change |
| --- | --- |
| `artifacts/api-server/src/routes/client-settings.ts` | Saved-value event enqueue and save-ID response header; existing symbol validation and persistence retained. |
| `artifacts/api-server/src/lib/push-notification.ts` | Dynamic confirmed-symbol message formatter. |
| `artifacts/api-server/src/lib/web-push.ts` | Symbol enqueue through existing outbox/worker and delivery allowlist. |
| `artifacts/ea-app/public/push-sw.js` | Allow the new notification title in the existing worker. |
| `artifacts/ea-app/src/lib/symbol-save.ts` | Shared response verification and duplicate-event guard. |
| `artifacts/ea-app/src/lib/assistant-events.ts` | Optional save identity on the existing event. |
| `artifacts/ea-app/src/hooks/use-voice-announcements.ts` | Exact cached phrase; append without interrupting important speech. |
| `artifacts/ea-app/src/pages/HomeTab.tsx` | Confirmed save event and synchronous duplicate-tap protection. |
| `artifacts/ea-app/src/pages/TradingControlsTab.tsx` | Same behavior on the bulk save path. |
| `docs/migrations/20261025-symbol-configured-push.sql` | Extend only the existing push-event kind constraint. |
| `scripts/tests/symbol-save.test.mjs` | Response verification, duplicate IDs, separate saves, silent clears/audio failures. |
| `scripts/tests/push-format.test.mjs` | Dynamic canonical and broker-variation wording. |
| `scripts/tests/web-push.test.mjs` | Real PostgreSQL-backed route/outbox tests, failure paths and existing Start/Stop regressions. |
| `scripts/tests/neural-announcements.test.mjs` | Queue ordering, important speech and separate successful saves. |
| `scripts/tests/voice-assistant.browser.mjs` | Mobile/desktop real-app save failures, rapid taps, later saves and existing voice triggers. |
| `scripts/tests/web-push.browser.mjs` | Foreground and closed-app-page service-worker dispatch and duplicate suppression. |
| `docs/symbol-save-announcements.md` | Implementation, verification and release instructions. |

## Verification

- All 160 Node tests pass, including isolated PostgreSQL integration with both prior migrations plus the new migration. No production database was used.
- EA app/API TypeScript checks, API build and complete Pages production build pass. The existing bundle-size warning remains.
- The built app runs through mobile (390×844) and desktop (1280×900) voice-event regression fixtures. These use instrumented audio to verify actual playback text/order; they do not constitute a new perceptual voice-quality evaluation.
- The real Chromium service worker displays the new payload, suppresses duplicate event IDs, retains existing Start/Stop/trade messages and processes a dispatch with the app page closed. Push is injected via CDP with a separate observer target; this is not a real APNs/FCM send, fully terminated-browser test or physical iPhone result.

## Release steps — approval required

1. After explicit approval, apply `docs/migrations/20261025-symbol-configured-push.sql` using the existing Neon SQL Editor. It follows the already applied `20261024-web-push.sql` and `20261025-web-push-reliability.sql`. It preserves existing rows, columns, accounts and trading records; only the event-kind constraint is extended. No production migration has been applied by this task.
2. Publish the existing Cloudflare Pages build and Render API build after approval. Both frontend/worker and API are needed. Prefer updating the frontend/worker first, because older workers do not allow the new title; the new client remains compatible with the existing array response while the API is updated.
3. Reopen the installed iPhone Home Screen app so its existing worker registration can update, then verify an authorized symbol save. No new VAPID keys or paid service is needed; retain the current Web Push variables and approved device enrollment.
4. Verify actual notifications in foreground, background and on the Lock Screen on physical supported devices. Voice follows existing iOS audio-activation rules and remains silent while backgrounded. Permission, OS Focus settings, connectivity and service availability still control display/delay. Render Free can sleep, so continuous background worker operation is not guaranteed.

Nothing in this task merges or deploys production changes or modifies production database records.
