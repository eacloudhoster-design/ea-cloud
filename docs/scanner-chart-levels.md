# Empty scanner levels: investigation and correction

## Confirmed code causes and limits of the investigation

The old Gemini prompt explicitly demanded null prices for limited clarity and required a known symbol/timeframe. Its schema required only signal/reasoning, so a perfectly schema-compliant response could omit every trading level. `buildDirectionalReport` then discarded even complete, correctly ordered prices whenever chartClarity was missing/limited, or either symbol/timeframe was missing. This was a metadata/clarity gate, not an actual live-quote dependency. Removing UI labels would not fix it.

No raw production response, Render credentials, PostgreSQL access or Gemini secret is available in this workspace. The production screenshot alone cannot establish which of those paths was taken for that particular scan. Do not claim a historical raw response was inspected, or that a real provider/production acceptance test passed. New diagnostics are intended to settle that distinction on the next real scan.

## Pipeline traced

1. `analyseChart` uploads the bounded image server-side to Gemini v1beta using the configured model, with structured JSON output. Multipart text is concatenated without injecting characters. `parseChartReport` JSON-parses and validates essential direction/reasoning, types, positivity and directional price ordering.
2. `buildDirectionalReport` independently assesses proposed levels and price-scale evidence. Missing metadata, low confidence, unverified session and missing MT5 connection no longer erase defensible chart references.
3. `completeScannerReport` stores the normalized report directly in `scanner_reports.report` JSONB, under the existing account/entitlement locks, then decrements one credit in the same transaction. Failed provider/validation/storage calls roll back. This change does not alter that accounting.
4. The chart POST returns the inserted report. The owner-scoped history GET returns JSONB unchanged. No storage mapper strips the prices. Existing history is never rewritten; old nulls cannot be reconstructed without another scan.
5. The scanner client passes the report to `ScannerChartReport`, which formats entry/stopLoss/takeProfit directly. It does not null them because execution is unavailable. The existing chart-reference caption remains visible. New reports with rejected/missing levels also show their specific assessment/reason.

## Generation and validation contract

Gemini must now attempt a complete structure-based setup on sufficiently readable charts. Entry is derived from chart structure, stop from invalidation and target from visible support/resistance or liquidity, targeting at least 2R. Prices do not need to be preprinted as existing order annotations. Never stretch a stop/target or invent scale labels merely to achieve 2R.

The structured response requires entry, stopLoss, takeProfit, priceEvidence and levelsUnavailableReason alongside signal/reasoning. They may be null honestly. Price evidence identifies visible minimum/maximum axis labels, justified decimal precision and structural rationale. Local validation checks positive finite numbers, BUY/SELL ordering, consistent nondegenerate range, all levels within the stated visible scale and supported decimal precision. Missing/incomplete/evidence-free/out-of-scale prices become a null set with a specific assessment, never fabricated replacement values. Invalid numeric types or inverted directional ordering still fail the analysis and do not consume a credit.

Scale evidence is **Gemini's image interpretation**, not an independent OCR verification or live-price feed. The server checks its internal numerical consistency, not independently proves the chart's pixels. Human inspection of the real chart against the response remains part of acceptance. Offscreen targets cannot be accepted under this conservative visible-scale policy. A plausible reference below 2R may remain displayed but cannot pass the existing execution policy. Confidence remains an uncalibrated subjective estimate or null.

The read/parser contract remains tolerant of omitted optional fields so older responses/history remain readable; omissions are visible diagnostics, not a bypass that invents a setup. The new provider request schema explicitly requires a price attempt. Essential fields and numerical/security validation remain strict.

## Safe diagnostics

Successful chart POSTs log `scanner_level_assessment` twice: `stage:normalized` and, after the transaction commits, `stage:persisted`. The request logger supplies existing request correlation. Fields include provider price presence/type (missing/null/number), output presence booleans, metadata/evidence presence and one code:

- CHART_LEVELS_RETAINED
- PROVIDER_LEVELS_MISSING / PROVIDER_LEVELS_NULL / PROVIDER_LEVELS_PARTIAL
- PRICE_SCALE_MISSING / PRICE_SCALE_INVALID
- LEVEL_OUTSIDE_VISIBLE_SCALE / UNSUPPORTED_PRICE_PRECISION

These fields are also persisted in the owner's `levelAssessment` report, so the original provider-presence decision survives history reload. Logs omit actual prices, raw provider text, rationale, chart bytes, credentials and API keys. Failure diagnostics still identify JSON/schema/envelope validation field/type failures. A null result from a provider that supplied numbers can now be distinguished from one that supplied no prices.

## Real acceptance run (outstanding)

The fixture integration test uses the actual provider adapter/parser, actual Express route, JSON serialization/storage adapter, actual history endpoint and actual React result component. It tests BUY and SELL at 2R without timeframe, with limited overall clarity and no live quotes. Those fixtures prove data flow but are not real market signals or real PostgreSQL/provider evidence.

To collect the required **real** example after deploying this branch to staging, use a legitimate approved scanner account with an active scanner subscription/admin grant and a real readable chart with its price axis included. In a trusted checkout with dependencies installed, inject these through the operator's secure environment (never commit or paste the token):

- EA_SCANNER_ORIGIN: trusted HTTPS API/app origin serving `/api/app/scanner/*`
- EA_SCANNER_TOKEN: that client's existing session token, without the Bearer prefix

Run from the repo root:

```sh
node scripts/verify-scanner-live.mjs /path/to/readable-chart.png work/real-scan-01
```

**This explicitly submits one real analysis, stores history and consumes one scanner credit for a successful saved report**, including an honest non-executable directional analysis, under existing accounting. Do not run repeatedly as a health check. Provider/API/validation failures retain existing no-charge behavior.

The script calls the real authenticated status/chart/history APIs, requires the returned report to equal the persisted history report, renders the actual client result component and checks each non-null price appears. It writes owner-only `.json` (full actual returned/saved report) and `.html` (actual component markup) artifacts, never chart bytes or session/API credentials. It refuses existing output artifacts before submitting. Null prices produce exit code 2 and are explicitly not a passing level-generation example. Compare the report's visible scale and rationale to the input chart, inspect the rendered result in the deployed app, and correlate the two log stages. Keep private report artifacts out of Git.

This workspace could not run that real acceptance flow: no configured Gemini/PostgreSQL/Render secrets or authenticated scanner session, and network policy does not permit the Gemini/Render endpoints. No production success or real example is claimed. The PR should stay draft until a real chart passes this verification.

## MT5 findings and deployment

The already-merged read-only bridge can retrieve actual bid/ask with MT5 `symbol_info_tick` and constraints with `symbol_info`, using saved encrypted per-client credentials. Render needs SCANNER_MT5_VPS_URL pointing at a trusted HTTPS origin and SCANNER_MT5_VPS_TOKEN (at least 32 characters) matching the Windows service's token. The Windows service must include the scanner routes, be running with MT5 installed/logged in, and expose `/scanner/quote` and `/scanner/check-order` over authenticated TLS. The exact broker symbol and account/server identity must match. These deployment/configuration facts cannot be verified from this workspace.

Fresh quotes alone do not enable orders. The bridge deliberately returns marketOpen:null because no verified trading-session adapter exists. `order_check` is read-only and does not prove the session is open. A durable scanner order sender with request-ID ledger, broker-ticket reconciliation, fresh final checks and aggregate margin validation also does not exist. The legacy copy engine's retrying plain-HTTP market sender is unsuitable and is not reused. See [scanner-market-limit.md](scanner-market-limit.md).

Existing market/limit policy remains intact: verified bid/ask near the entry may yield MARKET only after all structural, risk, freshness and broker checks; a distant entry requires explicit chart-supported retracement reasoning and correct bid/ask side for BUY LIMIT/SELL LIMIT. Distance alone never creates a pending order. Green buttons and the lot/position review panel remain; final order submission stays disabled until the missing real infrastructure is implemented. No orders are sent by this change.

Deploy **Render API** (generation/normalization/diagnostics) and **combined Cloudflare Pages frontend** (specific unavailable-level explanation/shared report contract) together after review. Keep existing GEMINI_API_KEY and configured GEMINI_SCANNER_MODEL (or fallback GEMINI_MODEL), database and auth settings. No new Gemini variable, paid service, database schema migration, reset or account grant is required. No Windows changes are included in this PR; its existing bridge must be deployed/configured separately only to obtain live quotes. Existing null history remains untouched. No merge or deployment was performed.

## Validation completed in this workspace

82 Node tests and 3 Windows-bridge Python tests passed. Shared libraries, API, mobile client and web portal TypeScript checks passed. API production and combined Pages builds passed, including the final Pages output verifier; existing bundle/sourcemap warnings remain. The full test suite includes market BUY/SELL, supported limit cases, stale/unknown-session/connection failures and credit rollback regressions. These checks do not replace the outstanding real acceptance run described above.
