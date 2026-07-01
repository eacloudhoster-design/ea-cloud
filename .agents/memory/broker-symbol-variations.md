---
name: Broker symbol variations
description: Invariants for the per-pair broker-symbol-variation + custom-lot feature (mentor defines, client selects, copy engine remaps at execution).
---

# Broker symbol variations + per-pair custom lot

Mentors define active trading pairs with comma-separated broker symbol variations; clients pick their broker's spelling + an optional custom lot per pair; the copy engine remaps the execution symbol and applies the custom lot at OPEN time.

## Invariants that must stay in lockstep

- **`isActive` filtering must match across all three surfaces.** Client GET/PATCH `/app/symbol-configs` AND the copy engine's pair load in `runSignal` must all filter `symbolPairsTable.isActive = true`. If the engine honours inactive pairs but the API hides them, an inactive pair silently drives symbol remap/custom-lot that the client can neither see nor edit.
  - **Why:** a mismatch means execution behaviour diverges from what the UI shows — a data-integrity/trust bug, not a crash.

- **Client config writes must be validated server-side against the mentor's active pairs.** PATCH `/app/symbol-configs` must reject any `pairName` not in the client's mentor's active pairs, and any `selectedSymbol` not equal to the canonical pair name or one of its defined variations. Validate `customLotSize` is finite and > 0.
  - **Why:** without it, clients can persist out-of-contract mappings and off-mentor/stale rows accumulate.

- **Any client "Configure Pairs" / "Symbol Configuration" UI must write through `/app/symbol-configs` (→ `client_symbol_configs`).** Prompts may ask for a brand-new `pair_mappings` table + CRUD endpoints — do NOT build one. The copy engine only reads `client_symbol_configs`, so a parallel table never reaches execution. Map masterSymbol=pairName, brokerSymbol=selectedSymbol, lotSize=customLotSize; Allowed = selectedSymbol null, Selected = non-null; delete = PATCH nulls.
  - **Why:** a parallel mapping source is silently dead — the UI would look correct but copy trades would ignore it.

## Backward compatibility (do not break)

- No pair configured / pair inactive → `canonicalPair` resolves to `null` → engine falls back to the raw `signal.symbol` + the client's global lot mode. CLOSE/MODIFY are unaffected (they match by `mentorTicket`, not symbol).

## Custom-lot precedence

- Per-pair `customLotSize` overrides the client's global `lotMode`, but is still capped by `maxLotSize`. Keep that ordering in `resolveVolume`.

## Notes

- ea-cloud (mentor) uses generated hooks (`useGetSymbolPairs` etc.); ea-app (client) uses raw `fetch` with `clientToken` — frontend save must check `response.ok` on every PATCH, not just that the promise resolved.
- Auth model is the app-wide pre-existing base64 `userId:role:timestamp` token (see replit.md); new routes follow it via `requireAuth`/`requireClientAuth`. Don't single-out these routes for a bespoke auth rewrite.
