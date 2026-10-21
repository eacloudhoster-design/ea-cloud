# Scanner market/limit planning and broker preflight

## Implemented behavior

The Gemini prompt now targets structurally justified reward/risk of at least 2 without moving levels or inventing prices. It may explain a retracement-supported limit setup through optional limitOrderAppropriate/limitOrderReason. Supply/demand analysis is added alongside the existing structure, trend, liquidity, entry and invalidation sections. Optional fields preserve old JSONB history; no schema migration is needed.

The server's deterministic policy prioritizes MARKET at verified ask for BUY / bid for SELL when within max(2 broker ticks, 5% of chart risk) of the reference entry. It recalculates reward/risk at that actual price; moving close to the entry never waives 1:2 or changes the chart stop/target. Otherwise it considers BUY LIMIT below ask or SELL LIMIT above bid only with explicit chart-supported retracement reasoning and broker limit permission. It never infers stop orders or turns every distant entry into a limit.

Policy rejects analyses older than 15 minutes and validates matching exact broker symbol, positive/ordered levels, quote age ≤5 seconds (future skew ≤1 second), digits/tick precision, stop distance, directional permissions, supported order types, lot min/max/step, positions and conservative aggregate exposure. Spread above 10% of planned risk blocks the setup. R:R below 2 at the proposed price blocks. Unknown/closed session, unclear structure or insufficient/uncalibrated confidence blocks eligibility. Thresholds are explicit conservative product rules, not historical performance claims.

The UI keeps the existing glass/black/red/green style and settings panel. **Review trade & check live setup** opens the panel for lot size/positions and a read-only broker refresh. Green EXECUTE TRADE / PLACE LIMIT ORDER can open review only when a fresh plan passes policy and broker check. The final confirmation button remains disabled because a scanner sender is not operational. It never silently forwards to copy trading. Request guards prevent duplicate concurrent UI checks; stale quotes or changed saved quantities invalidate review eligibility.

## Actual architecture findings and remaining operational limits

The existing Windows service can obtain real quotes with symbol_info_tick and constraints with symbol_info. The copy engine uses encrypted credentials in client_settings and sends market orders via a legacy plain-HTTP adapter with retries. That adapter does not support scanner pending orders, durable scanner idempotency or preflight and must not be reused for these signals.

This change adds separate read-only /scanner/quote and /scanner/check-order endpoints. They use the existing global terminal lock, authenticate a dedicated service token, log in and verify account identity, return bid/ask/timestamp/constraints/exposure, and call order_check with broker-supported filling modes. They never call order_send. Existing copy trading routes/behavior are unchanged.

**Current limitation is deliberate and real:** MT5 Python exposes no trading-session calendar in this service. Fresh ticks and order_check success do not prove the market is open. The bridge therefore returns marketOpen:null (or false on a broker market-closed rejection), never an invented true. Also no scanner-specific durable order ledger/reconciliation sender exists. As a result production live submission stays disabled, even when quotes/checks work. The pure policy supports verified-open snapshots and is tested for eligible market/limit cases; the live bridge does not falsely claim that capability is operational.

Before enabling actual orders, a trusted session-verification adapter and a dedicated authenticated sender must be integrated, with fresh account/quote/broker validation after explicit confirmation, aggregate margin checks for all positions, durable per-client request-ID state, broker ticket reconciliation and no blind retry after uncertain sends. This is not a feature flag that can safely be switched on now. No real order is sent by this PR.

The execute endpoint now requires confirmed:true, a requestId UUID, a scan UUID and valid lot/position fields, then returns unavailable. Even repeated confirmed requests submit zero orders. UUID validation alone is not presented as durable idempotency; there is no order sender to deduplicate until that ledger is implemented.

## Read-only API and privacy

POST /api/app/scanner/preflight is protected by the existing scanner account/subscription middleware and a separate request limit. It reads the report strictly by authenticated client ID + scan UUID. The client supplies only scan ID and quantities, never credentials, live prices or edited trade levels. Preflight rereads quotes after broker checking and rejects a check if price/order classification changed. It never consumes scanner credits or edits reports. The existing saved-analysis/credit transaction is unchanged; failed analysis is still not charged.

The TLS-only Node adapter reads existing connected client settings and decrypts credentials only in memory. It authenticates to the dedicated Windows routes, disallows redirects, applies bounded timeouts and never returns credentials/upstream raw errors. It does not trust a saved connected flag alone: the bridge verifies the actual terminal account. Symbol names must match exactly; broker suffix mappings are not guessed.

## Deployment

After review deploy:

1. **Windows MT5 service:** main.py plus scanner_api.py, with existing dependencies and a matching randomly generated ASCII SCANNER_MT5_VPS_TOKEN of at least 32 characters. Put the scanner routes behind trusted HTTPS and restrict raw service-port access. Existing plain-HTTP copy behavior is not changed by this PR.
2. **Render API:** existing build/start commands, existing database/Gemini/credential-encryption settings, plus SCANNER_MT5_VPS_URL=https://YOUR_TRUSTED_VPS_ORIGIN and the matching SCANNER_MT5_VPS_TOKEN as a server-only secret. No plaintext HTTP or client-side VITE secrets. Missing settings fail closed without breaking chart analysis/history.
3. **Cloudflare Pages ea-cloud-website:** existing combined website/client build (pnpm --filter @workspace/ea-cloud build) and existing output/bindings.

No database schema, licences, grants, balances, mentor records or history is reset/overwritten. New fields live in existing report JSON. No paid service or broker session-calendar provider was provisioned.

Staging must verify HTTPS/token/account isolation against the real Windows terminal and exact broker symbols. No production key, terminal, live session or order sender was accessed during implementation. Tests use isolated quotes/providers/accounts; they do not establish genuine MT5 connectivity. Live submission remains unavailable after this deployment until the separately described operational capabilities exist.

Validation completed: all 80 Node tests and 3 Python bridge tests passed; library/API/mobile/portal TypeScript checks, API production build and combined Pages build passed (existing build warnings remain). Python tests exercise registered route functions with a stub terminal; Node route tests exercise Express in process. Live Windows MT5, broker sessions, Render/Google credentials and browser screenshots were not verified. No production data, service settings, subscriptions or credits were changed, and no orders were submitted.
