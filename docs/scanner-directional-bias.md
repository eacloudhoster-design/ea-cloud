# Directional chart predictions

New successful Gemini chart reports use schemaVersion 2 and require signal BUY or SELL. Direction expresses an analytical bias, not permission to submit an order. The API rejects NO TRADE, missing directions, invalid price ordering and invented execution flags in new model output. Blank/non-chart/completely unreadable input fails with AI_DIRECTION_UNAVAILABLE when the model reports no directional evidence; the server never flips a coin to manufacture success. A limited but interpretable chart can return a tentative direction without prices or numerical confidence.

The report contains six required explanations: market structure, trend direction, liquidity sweeps, support/resistance, entry reasoning, and risks/invalidation. The prompt requires explicit uncertainty and unavailable observations instead of fabricated liquidity events or prices. Confidence is an optional integer AI directional estimate with explanatory basis, explicitly **not a verified win probability**. Without a meaningful estimate it is null, displayed as **Uncalibrated**. Limited-clarity charts are always normalized to null confidence. These are subjective model estimates, not backtested statistics; no calibrated scoring model was introduced.

Entry, stop loss and take profit must all be positive, readable, structurally supported chart references with known symbol/timeframe and correct BUY/SELL ordering, or all be null. The server calculates reward/risk = abs(TP-entry)/abs(entry-SL) from valid references; the model cannot supply it. The UI labels these historical chart references, not executable live quotes. It displays no numeric ratio when levels are missing.

## Execution policy

Every current report is **NOT EXECUTABLE**. The existing backend has neither authenticated live quotes/session checks nor MT5 scanner order submission. The green Execute Trade button remains disabled and the existing execution endpoint remains unavailable. High estimated confidence never enables submission. Low estimates (below 60 as an explicit conservative product rule, not a calibrated threshold), null confidence, limited chart clarity, reported closure and missing prices get specific reasons. The server normalizes a model's claimed open market to unknown: a historical candle cannot prove the current session is open. A model-reported closure is described as a chart indication requiring verification, not an independently verified live calendar.

Real integration can later replace the centralized eligibility policy in scanner-direction.ts using verified market/session/account data and an authenticated execution service. It must continue rejecting unclear, closed, low-confidence or missing-level setups. This change does not add a trading provider, fabricate fills, enable billing or modify hosting licences.

## History, access and credits

Existing JSONB scan history is retained unchanged. The shared read schema accepts legacy BUY/SELL/NO TRADE reports and new directional reports. Legacy NO TRADE entries are displayed as **Archived analysis**, not rewritten into invented BUY/SELL predictions. New generation accepts only the directional contract. Legacy BUY/SELL confidence remains Uncalibrated. Common fields preserve compatibility with older clients during rollout; deploy the reviewed API and client together to show the new details.

Authentication, separate scanner subscriptions, superadmin grants, rate limits and the existing completion transaction are preserved. A successful saved report consumes one credit even when non-executable, as it is still a completed analysis. Provider failures, invalid reports, unreadable input and failed persistence do not save a successful report or charge credits. No database migration or data backfill is required.

## Deployment and verification

Deploy the reviewed API backend and the existing combined Pages web/client build. Keep GEMINI_API_KEY and GEMINI_SCANNER_MODEL (or its existing fallback alias), PostgreSQL, mentor branding/storage, authentication and all existing hosting settings unchanged. Do not reset records or rerun schema migrations for this change. Live Gemini output still needs staging verification with the intended Render key; no key or production database is available in this workspace.

Tests cover BUY/SELL with and without reference prices, server-calculated ratios, low/uncalibrated confidence, limited/closed charts, fake-open normalization, rejection of NO TRADE and execution overrides, six analysis sections, green disabled execution, legacy history rendering, invalid/provider/unreadable failures and credit rollback. Production UI rendering is tested directly; Chromium screenshots cannot be verified in the current sandbox, which blocks browser startup.

Validation completed: all 67 Node tests passed, shared-library/API/mobile TypeScript checks passed, API production and combined Pages builds passed (existing sourcemap/chunk-size warnings remain). Rendering assertions cover the actual report component; no live Gemini output, production database or browser screenshot was verified. This development branch includes the still-pending Gemini configuration fix from PR #12; merge that prerequisite first or review the combined changes.
