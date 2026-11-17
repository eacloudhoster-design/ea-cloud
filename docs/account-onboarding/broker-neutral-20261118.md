# Broker-neutral application connection

Application changes only; base main5800ecab1adfa5b6bf9010bec1d3dfdb86418adf. No engine, VPS, terminal, Wine, provisioning-driver or database configuration changed.

The existing broker catalogue is exposed instead of five hardcoded dropdown entries. A manual broker-name option is a display hint, never authoritative identity. Exact server text is accepted up to256 characters without brand-specific server examples. The backend still verifies broker/login/server/role/owner from the authenticated gateway. Custom selection may connect an already assigned supported account using its actual verified broker; it never invents a canonical profile. Demo/real read-only options retain existing authorization. Numeric account IDs remain bounded to exact JS/gateway integers; oversized IDs are rejected rather than rounded. Pending request identity uses canonical numeric login, fixing leading-zero polling mismatch.

Gateway configuration/header construction now fails before network I/O with MT5_GATEWAY_NOT_CONFIGURED; hosted Render without explicit gateway origin cannot accidentally use local loopback. HTTP401 service authentication, timeouts and transport failures have distinct secret-safe codes. Fixed codes, not vendor messages/credential values, enter application diagnostics. This corrects misleading classification; it does not establish or repair an unobserved private production endpoint/token.

Unassigned brokers without an approved provisioning profile receive UNSUPPORTED_ACCOUNT_CONFIGURATION before queueing/storing credentials. Existing five-broker provisioning remains one shared authenticated path, not Exness-specific. No fake universal worker assignment was added.

## Confirmed external contract limits

- vps-mt5-service/readonly_account_relay.py29 accepts only justmarkets/exness/xm/rcg/deriv.
- vps-mt5-service/demo_worker.py15 restricts broker identity to the same five.
- infra/provisioning/dedicated-worker-driver.py24 enforces those profiles.
- Existing provisioning migration has a matching broker CHECK constraint.
- Real read-only account access requires existing MT5_LIVE_READONLY_ACCOUNTS authorization; no live-money execution is enabled.

Consequently this patch cannot claim arbitrary-broker onboarding works. An approved gateway/provisioner admission contract for additional terminal profiles, matching application schema migration, current private routing/credentials and real compatibility evidence are required. Those decisions/configurations were not invented. Actual production gateway failure and runtime flags remain unverified; no broker connection was attempted.

## Validation

10 existing focused Node checks passed, zero failures/skips. Includes real session/PGlite account-binding and encrypted provisioning fixtures with intercepted worker responses; missing configuration makes zero requests, unknown brokers cannot silently queue, service401/timeouts retain safe codes, named broker mismatch fails, custom selection retains actual verified identity, and server/ID bounds are enforced. API/UI TypeScript, production builds and whitespace checks passed. No137-test engine rerun, package installation or new test framework.

New patch is not deployed and no real account connection is confirmed. Existing deployment remains main5800eca. All authorization, encrypted credential handling, execution holds and emergency stops remain intact.
