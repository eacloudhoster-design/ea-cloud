---
name: MT5 external backend parity & false-positive trap
description: How the Admin vs Client MT5 connect proxies judge success differently, and why the external MT5 backend's response shape matters.
---

# MT5 connect: external backend behavior & proxy parity

Both the Admin Portal and the Client App proxy MT5 credentials to the **same**
external FastAPI service: `http://102.214.9.67:8000/connect-mt5`. Same base URL,
same payload `{login:number, password, server}`. There is no separate service.

## The trap: HTTP 200 with `{"success": false}`
On a failed login (e.g. MT5 terminal not running on the VPS) the external service
returns **HTTP 200** with body `{"success": false, "message": "MT5 terminal not found"}`.
A 2xx status alone does NOT mean success — you must inspect the body.

## Why Admin "works" but Client "fails" (same creds, same service)
- Admin route (`/api/admin/mt5/connect`) marks **any 2xx** as `status:"connected"`,
  ignoring `success:false` in the body → **false positive**. It records a
  "connected" row with `balance:null` even though the terminal failed.
- Client route (`/api/app/mt5-connect`) checks the body
  (`ok && success!==false && status!=='failed' && connected!==false`) → correctly
  reports the real failure (422 with the backend message).
- So the client is the *more correct* one. The admin's apparent success is the bug,
  not the client's failure.

**Why this matters:** before "making the client match the admin," realize matching
means making the client also report fake success. The real fix is on the VPS
(the Python MetaTrader5 service / terminal), which is NOT in this repo.

## Also note
- `client-mt5.ts` (`/api/client/mt5/connect`) is a near-duplicate of the admin
  route (lenient 2xx check) but the ea-app frontend does NOT call it — it calls
  `/api/app/mt5-connect` in `client-settings.ts`. Dead-ish route, easy to confuse.

## Deployed VPS is stale vs repo source (404 on /execute-trade)
The repo's `vps-mt5-service/main.py` is the COMPLETE service (title "EA Cloud MT5 Trade Execution Service", v1.0.0) exposing `/`, `/mt5-health`, `/connect-mt5`, `/execute-trade`, `/close-trade`, `/modify-trade`, `/positions`, `/account-info`. The backend (`mt5-vps.ts`, base `http://102.214.9.67:8000`) calls `/execute-trade`, `/close-trade`, `/modify-trade` — all present in source, payload contract matches exactly.
**But the live VPS only serves `/` and `/connect-mt5`** (openapi title "FastAPI", v0.1.0, root returns `{"status":"Eacloud Backend Running"}`). So `/execute-trade` → 404. Root cause = stale deployment, NOT a code/route-name mismatch. Fix = redeploy current `main.py` to the Windows VPS (needs MT5 terminal; agent cannot do this remotely). Verify after: `GET /openapi.json` should list 8 paths and `POST /execute-trade {}` should return 422 (not 404).
