# Render Gemini scanner configuration fix

The operator confirmed Render has GEMINI_API_KEY but neither model variable. The backend previously required GEMINI_SCANNER_MODEL with no default/hardcoded model and ignored GEMINI_MODEL. Its local check raised AI_MODEL_NOT_CONFIGURED / HTTP 503 before any Gemini call. This explains the exact message; it is not evidence of a rejected key or scanner subscription failure.

Request path: bearer/account approval → separate scanner grant/credits → image/strategy validation → model configuration preflight → history storage preflight → transactional account/grant recheck → Gemini → strict report validation → save report and decrement credit atomically. Configuration failure precedes Gemini and charging. Other analysis/storage failures also roll back; no failed analysis costs a credit. Authentication, entitlements and the completion transaction are unchanged.

Status HTTP 200 reports readiness in JSON, not a successful Gemini call. Inspect configured:false and AI_MODEL_NOT_CONFIGURED. History does not call Gemini and can correctly return 200 while analysis configuration is missing.

## Exact Render environment setting

On the existing **Render API service**, retain its configured server-only GEMINI_API_KEY and add, without quotes/backticks:

```env
GEMINI_SCANNER_MODEL=gemini-3.5-flash-lite
```

Save and restart/redeploy that service. This also addresses the missing-model error in the pre-fix backend. Preserve DATABASE_URL and all existing hosting/storage/session settings. GEMINI_MODEL is not additionally required. The fix accepts GEMINI_MODEL when GEMINI_SCANNER_MODEL is absent/blank, while a nonblank scanner-specific override takes precedence. It normalizes surrounding whitespace and one models/ prefix. Invalid overrides remain explicit errors; no silent model/provider fallback or billing enablement occurs.

Google's current [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) lists image input, structured text output and Search grounding support. Its [pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists free-tier input/output subject to project/region eligibility and quota. Search grounding is **not available on this model's API free tier**. Chart scans do not use Search; the separate fundamental-analysis feature does. Preserve source verification and report grounding unavailability honestly rather than inventing CPI/PPI/NFP/FOMC facts. No paid service was introduced or enabled. Actual project/model availability and quota must be verified with the intended key.

## Integration and logging review

There is no Gemini SDK dependency: native Node fetch calls the documented v1beta/models/{model}:generateContent endpoint. The key is sent only in the x-goog-api-key header. Chart payloads contain a user prompt and bounded inline JPEG/PNG/WebP bytes with MIME type, and request JSON output. Existing schema validation rejects invented/missing/inverted trade levels; thought parts are excluded. Fundamentals use google_search and require HTTPS grounding sources. See [GenerateContent](https://ai.google.dev/api/generate-content), [image input](https://ai.google.dev/gemini-api/docs/image-understanding), and [models metadata](https://ai.google.dev/api/models).

Malformed/null provider responses now remain AI failures rather than falling through as storage errors. Upstream 400/422 indicate model/request configuration, 401/403 indicate provider credentials/project access, 404 unavailable model, 429 quota, and other errors provider unavailability. Safety blocks/incomplete/invalid responses never produce fabricated signals.

Chart/fundamental failures and admin test failures emit only allowlisted operational fields through the existing request logger:

```json
{"event":"scanner_analysis_failed","code":"AI_PROVIDER_ACCESS_DENIED","category":"configuration","upstreamStatus":403,"apiVersion":"v1beta"}
```

Missing local configuration has upstreamStatus:null, because no call happened. No raw Error/message/cause, key, environment value, prompt, header, chart/base64, provider error body or model response is logged. Request IDs/path/status come from the existing request logger.

## Deploy and verify

After review deploy this branch's **API backend** to Render, keeping existing build/start settings:

```sh
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/api-server start
```

No frontend deployment or database migration is needed for this fix. Do not reset schema, licences, balances or scanner grants.

The API build also emits a standalone operator check. From the repository root in Render Shell:

```sh
node artifacts/api-server/dist/check-scanner.mjs
node artifacts/api-server/dist/check-scanner.mjs --image-probe
```

From artifacts/api-server use node dist/check-scanner.mjs instead. The first command checks model metadata and generateContent support. The explicit --image-probe sends a synthetic pixel and requests an {ok:true} JSON response. It consumes a small provider quota, makes no trading signal, connects to no database and charges no client credits. This checks project availability and image/JSON support, not analytical quality. No secret or raw provider response is printed.

Then use a real authorised staging/test client: verify configured:true in status JSON, analyse a chart, confirm saved history and exactly one deducted credit. Check a controlled provider failure in staging leaves credits/history unchanged. Never put keys into VITE variables or shell arguments.

This workspace has no Gemini/Render credentials or production database connection and its policy does not allow the Gemini host. The missing model setting was confirmed by the operator; model capabilities/pricing were verified from Google documentation. Live verification with Render's key remains outstanding. No Render variables, production records or migrations were changed; nothing was merged or deployed.

Validation completed: all 60 Node tests passed, including missing-model short circuit, alias/prefix/whitespace selection, payload/header correctness, successful analysis, provider 400/401/403/404/422/429/503, malformed/safety responses, sanitized route diagnostics, operator checker and real-adapter failures through the credit transaction. Library/API TypeScript checks and the API production build passed. Live Google-project access remains unverified here.
