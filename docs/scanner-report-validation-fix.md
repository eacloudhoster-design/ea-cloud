# Gemini AI_INVALID_REPORT correction

## Investigation and limits

The production log establishes: Gemini returned HTTP 200, then the scanner rejected its content locally with AI_INVALID_REPORT. It does not identify the specific rejected field. The old catch block discarded Zod issues, and no production model response/private chart is available here. We therefore cannot truthfully name the exact field in that historical request.

The contract defect is reproducible: requests set responseMimeType to JSON without supplying any output schema, while the local directional validator required every nullable property to be present, confidence to be an integer, confidenceReason and all six analysis sections to be at least 20 characters, and a complete set of prices/context. Thus missing optional metadata, null/partial analysis, a short factual note such as "Not visible.", a fractional estimate, or an omitted price could reject an otherwise usable BUY/SELL explanation. Nullable alone did not make a field optional. All these cases now have explicit regressions. The parser also inserted newlines between chart text parts, which could corrupt JSON when Gemini split a string/token across parts; chart JSON parts are now concatenated without inserting characters. Thought parts remain excluded. The exact historical production failure cannot be distinguished between these paths from the old aggregate log.

## Aligned report contracts

Chart requests now include generationConfig.responseJsonSchema plus application/json. The schema permits either a strict directional object with required BUY/SELL signal and substantive reasoning, or the strict UNREADABLE_CHART error object. It uses canonical field names, JSON number/null types, fixed enums and no extra properties. See Google's [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output) and [GenerateContent API](https://ai.google.dev/api/generate-content). Local semantic validation still runs after structured decoding; schema-constrained JSON does not prove prices or chart observations are true.

Optional symbol/timeframe, limitations, confidence/basis, session/clarity, prices, evidence tags and individual analysis sections may be omitted or null. The backend emits a stable version-2 object with explicit nulls, an analysis object containing the six known keys, and an evidence array. The frontend shows unavailable observations as "Not established from this chart" and missing confidence as Uncalibrated. No market facts, prices, percentages, reasoning or directions are defaulted into existence.

Confidence can be a finite percentage in 0–100, including a fractional value, only retained for a clear chart with an adequate explanatory basis. Missing/short basis or limited/unknown clarity causes null confidence. It is still an uncalibrated subjective model estimate, never verified win probability. Missing/partial prices or missing trustworthy clarity/symbol/timeframe cause the entire price set and ratio to become null; no stop/target/price is synthesized. Wrong numeric types, negative/zero/nonfinite prices, out-of-range confidence, unknown enum values, extra fields, absent/short reasoning and complete inverted BUY/SELL price ordering still fail.

The JSON schema carries supported structural constraints; the backend retains stricter domain checks such as positive prices, risk ordering, bounded strings and duplicate-tag rejection. JSON Schema and Zod canonical fields/nullability/enums are regression checked. There is no permissive generic JSON fallback, numeric-string coercion, arbitrary extraction from markdown, auto-flipped signal or synthetic trading fixture in production.

## Sanitized validation diagnostics

Failure logs retain event/code/category/upstreamStatus/apiVersion and add a bounded allowlisted object:

```json
{"reportValidation":{"stage":"schema","issues":[{"path":"confidence","code":"invalid_type","receivedType":"string"}]}}
```

Stages distinguish JSON parsing, schema validation and the response envelope. Field paths are limited to known contract names; unknown names become a constant marker. Codes and received types are allowlisted, with at most 12 issues. No received value, Zod error message, provider response, reasoning, API key, prompt, chart/image/base64 or attacker-supplied key is logged or exposed in the frontend response. Malicious property names are covered by tests. These logs can identify any remaining production mismatch after deployment without collecting raw private model output.

## Security, persistence and execution

No scanner authentication, subscription/grant policy, database schema or credit transaction changes were made. A successfully saved report consumes one credit under the existing policy; validation/provider/storage failures roll back without a report or charge. Scan history remains JSONB version 2, with legacy reports still supported and no rewrite/backfill. All reports remain NOT EXECUTABLE; the green button stays disabled and no MT5 order endpoint is enabled. Low confidence or missing prices are valid analysis states, never execution permission.

## Required redeployments

1. **Existing Render Node API service**: deploy this reviewed branch, using the existing build/start commands (`pnpm --filter @workspace/api-server build` and `pnpm --filter @workspace/api-server start`). This installs the structured-output request, optional-field normalization and sanitized diagnostics.
2. **Existing Cloudflare Pages project `ea-cloud-website`**: rebuild the existing combined website/mobile app with `pnpm --filter @workspace/ea-cloud build` (or equivalent `pnpm build:pages`), keeping output `artifacts/ea-cloud/dist` and all routing/bindings unchanged. This adds the nullable-field display fallbacks. Deploying only the backend removes the generation/validation mismatch; deploying both provides the intended unavailable-state text.

Keep the existing server-only GEMINI_API_KEY, selected GEMINI_SCANNER_MODEL/GEMINI_MODEL, DATABASE_URL, mentor storage, authentication and licensing settings. No new environment variables, database migration, reset or credit backfill are needed. Review before deploying; nothing was merged/deployed or changed in production here.

After deployment, use a real authorised test account: inspect a saved BUY/SELL report with absent optional data, confirm history and exactly one deducted credit; then verify a controlled failed request in staging leaves both unchanged. Inspect only sanitized validation logs for remaining failures. Live Render/Google-project calls were not available in this workspace; automated provider responses and database records are isolated fixtures, not production verification.

Completed verification: all 74 Node tests passed, shared-library/API/mobile/portal TypeScript checks passed, API production build and combined Pages build passed (existing sourcemap/chunk-size warnings remain). Regression coverage includes omitted/null optional values, partial prices, fractional confidence, concise analysis, multipart JSON, canonical structured requests, field/type diagnostics, malicious-key redaction, API failures, credit rollback and actual report-component rendering. No live provider or browser screenshot verification is claimed.
