---
name: Secret encryption at rest
description: How sensitive credentials (API keys, MT5 passwords) are encrypted before DB storage in the api-server.
---

# Encrypting sensitive credentials at rest

Sensitive secrets stored in the DB (mentor API keys, client MT5 passwords) are encrypted with **AES-256-GCM**, key derived via `scryptSync(SESSION_SECRET, <unique-salt>, 32)`. Stored format is `"<ivHex>:<authTagHex>:<cipherHex>"`.

- Reference implementation: `artifacts/api-server/src/lib/api-key.ts` (API keys) and `artifacts/api-server/src/lib/mt5-crypto.ts` (MT5 passwords). Each uses a DISTINCT salt so the same SESSION_SECRET yields independent keys per purpose.

**Why:** Reuse one proven crypto pattern instead of inventing new schemes; GCM gives authenticated encryption (tamper detection) and per-record random IVs make ciphertext non-deterministic.

**How to apply:**
- New secret to store? Add a `text` column, encrypt on write, decrypt only at point-of-use, and NEVER include the encrypted/plain field in any API response (strip via destructure before `res.json`).
- Do NOT fall back to a hardcoded key. `mt5-crypto.ts` derives the key lazily and throws if `SESSION_SECRET` is missing/weak (<16 chars) — financial creds must fail loudly, not silently encrypt with a known constant. `api-key.ts` still has the old `?? "ea-cloud-dev-secret"` fallback — prefer the mt5-crypto approach for new code.
- DB lib is composite: after editing a `lib/db` schema, run `pnpm run typecheck:libs` (rebuilds `.d.ts`) before the api-server typecheck will see new columns. Then `pnpm --filter @workspace/db run push`.
