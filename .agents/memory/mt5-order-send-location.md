---
name: MT5 order_send lives on external VPS, not Replit
description: The real MT5 order request (incl. comment/magic) is built in a Python service on the user's Windows VPS — Replit deploys never update it.
---

The actual `mt5.order_send()` call — and the request dict that sets `comment`,
`magic`, `volume`, etc. — lives in `vps-mt5-service/main.py`, a FastAPI service
that runs on the user's external Windows VPS at `http://102.214.9.67:8000`.

The Replit TypeScript path (`copy-engine.ts` → `mt5-vps.ts`) only POSTs a JSON
body (`/execute-trade`) to that VPS. The Python service then builds the MT5
request and calls `order_send`.

**Why this matters:** Publishing/deploying the Replit app does NOT update the VPS
service. `vps-mt5-service/main.py` in the repo is just source — the user must copy
it to the VPS and restart uvicorn for any change there to take effect. A "fix" that
only touches the TS layer will appear to do nothing if the VPS code overrides or
ignores the field (e.g. trade comment).

**How to apply:** For anything that affects the actual MT5 request (comment, magic,
SL/TP rounding, filling mode), fix it in `vps-mt5-service/main.py` AND tell the user
to redeploy + restart the VPS process. The forced-suffix comment logic now lives in
`_build_trade_comment()` there, so even an old/wrong TS comment is corrected VPS-side.
