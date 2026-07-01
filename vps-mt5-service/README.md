# EA Cloud — MT5 Trade Execution Service

FastAPI service that runs on the **Windows VPS** next to a MetaTrader 5 terminal.
It verifies MT5 accounts and executes copy trades on behalf of the EA Cloud backend.

> ⚠️ **Windows only.** The `MetaTrader5` Python package requires Windows and an
> installed MT5 terminal on the same machine. It does **not** run on Linux/Mac.

---

## Setup (on the VPS)

1. Install [Python 3.11+](https://www.python.org/downloads/windows/) (tick *Add to PATH*).
2. Install the **MetaTrader 5 terminal** and log in to any account once so the
   terminal is configured. Leave the terminal running.
3. Copy this folder to the VPS, then double-click `run.bat`
   (or run the commands below).

```bat
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

The service listens on `0.0.0.0:8000`. Make sure the Windows Firewall allows
inbound TCP **8000** so the EA Cloud backend can reach it.

- Interactive docs (Swagger UI): `http://<vps-ip>:8000/docs`
- **OpenAPI schema** (auto-generated for every endpoint): `http://<vps-ip>:8000/openapi.json`

Logs are written to the console and to `mt5_service.log` in this folder. Every
request logs the `initialize` result, `login` result, `order_send` result and
MT5 `last_error`.

---

## How it works

- MT5's Python API supports only **one logged-in account per terminal process**.
  Because EA Cloud copies trades across many client accounts, every request
  passes its own `login` / `password` / `server` and the service initializes +
  logs in to that account for the call. A global lock serializes access so calls
  never interleave.
- The `password` sent here is the **decrypted** MT5 password. The EA Cloud
  backend stores it encrypted (AES-256-GCM) and only decrypts it in memory at the
  moment it calls `/execute-trade`, `/close-trade`, etc.
- Order filling mode is auto-negotiated (IOC → FOK → RETURN) to match the
  broker, retrying if the broker rejects a mode (`retcode 10030`).

---

## Endpoints

Base URL: `http://102.214.9.67:8000` (replace with your VPS IP/domain)

| Method | Path             | Purpose                          |
|--------|------------------|----------------------------------|
| GET    | `/`              | Liveness probe                   |
| GET    | `/mt5-health`    | Terminal/package availability    |
| POST   | `/connect-mt5`   | Verify account + read balance    |
| POST   | `/execute-trade` | Open a BUY/SELL order            |
| POST   | `/close-trade`   | Close a position (full/partial)  |
| POST   | `/modify-trade`  | Update SL/TP on a position       |
| GET    | `/positions`     | List open positions              |
| GET    | `/account-info`  | Read account balances            |

### Common response shape

All endpoints return the same envelope:

```json
{
  "success": true,
  "message": "human-readable status",
  "data": { "...": "endpoint-specific" },
  "last_error": null
}
```

On failure, `success` is `false`, `data` may carry the raw order result, and
`last_error` carries MT5's `{ "code": <int>, "message": "<str>" }`.

---

## Request / response examples

### GET `/mt5-health`

```bash
curl http://102.214.9.67:8000/mt5-health
```
```json
{ "success": true, "message": "MT5 terminal is available",
  "data": { "version": [500, 4560, "..."], "terminal": { "connected": true } },
  "last_error": null }
```

### POST `/execute-trade`

```bash
curl -X POST http://102.214.9.67:8000/execute-trade \
  -H "Content-Type: application/json" \
  -d '{
    "login": 12345678,
    "password": "decrypted-password",
    "server": "Broker-MT5",
    "symbol": "EURUSD",
    "action": "BUY",
    "volume": 0.10,
    "sl": 1.1200,
    "tp": 1.1300
  }'
```
```json
{
  "success": true,
  "message": "BUY order executed",
  "data": {
    "ticket": 523477881,
    "deal": 521133440,
    "retcode": 10009,
    "comment": "Request executed",
    "price": 1.12534,
    "volume": 0.10,
    "symbol": "EURUSD",
    "action": "BUY"
  },
  "last_error": null
}
```
Failure example (rejected order):
```json
{
  "success": false,
  "message": "Order rejected (retcode 10019: No money)",
  "data": { "ticket": 0, "retcode": 10019, "comment": "No money" },
  "last_error": { "code": 1, "message": "Success" }
}
```

### POST `/close-trade`

```bash
curl -X POST http://102.214.9.67:8000/close-trade \
  -H "Content-Type: application/json" \
  -d '{ "login": 12345678, "password": "decrypted-password",
        "server": "Broker-MT5", "ticket": 523477881 }'
```
Optional partial close: add `"volume": 0.05`.
```json
{ "success": true, "message": "Position closed",
  "data": { "ticket": 523477999, "retcode": 10009,
            "closed_ticket": 523477881, "closed_volume": 0.10 },
  "last_error": null }
```

### POST `/modify-trade`

```bash
curl -X POST http://102.214.9.67:8000/modify-trade \
  -H "Content-Type: application/json" \
  -d '{ "login": 12345678, "password": "decrypted-password",
        "server": "Broker-MT5", "ticket": 523477881,
        "sl": 1.1150, "tp": 1.1350 }'
```
```json
{ "success": true, "message": "Stop loss / take profit updated",
  "data": { "ticket": 523477881, "sl": 1.1150, "tp": 1.1350, "retcode": 10009 },
  "last_error": null }
```
Omit `sl` or `tp` to leave that level unchanged.

### GET `/positions`

```bash
curl "http://102.214.9.67:8000/positions?login=12345678&password=decrypted-password&server=Broker-MT5"
```
```json
{ "success": true, "message": "1 open position(s)",
  "data": { "positions": [
    { "ticket": 523477881, "symbol": "EURUSD", "type": "BUY", "volume": 0.10,
      "price_open": 1.12534, "price_current": 1.12700, "sl": 1.1150, "tp": 1.1350,
      "profit": 1.66, "magic": 234000, "comment": "EA Cloud", "time": 1733250000 }
  ] },
  "last_error": null }
```

### GET `/account-info`

```bash
curl "http://102.214.9.67:8000/account-info?login=12345678&password=decrypted-password&server=Broker-MT5"
```
```json
{ "success": true, "message": "Account info",
  "data": { "login": 12345678, "server": "Broker-MT5", "name": "John Doe",
            "broker": "Broker Ltd", "currency": "USD", "leverage": 500,
            "balance": 1000.00, "equity": 1001.66, "margin": 22.51,
            "margin_free": 979.15, "margin_level": 4450.3, "profit": 1.66 },
  "last_error": null }
```

---

## Security notes for integration

- `/positions` and `/account-info` take credentials as **query parameters** (per
  the GET design). Query strings can land in proxy/access logs, so put the
  service behind HTTPS or a private network and avoid logging URLs at the proxy.
  If you prefer credentials never appear in a URL, switch these two to POST with
  a JSON body — the handler logic is identical.
- The EA Cloud backend should **decrypt the MT5 password only in memory**
  immediately before each call and never persist or log the plaintext.
- Restrict inbound 8000 to the EA Cloud backend's IP where possible.

---

## How EA Cloud (Replit) integrates

In `artifacts/api-server`, the trade-execution call should:

1. Load the client's `encrypted_mt5_password` from `client_settings`.
2. `decryptMT5Password()` in memory (see `src/lib/mt5-crypto.ts`).
3. `POST` to `http://<vps>/execute-trade` with `{ login, password, server, symbol, action, volume, sl, tp }`.
4. Treat the response as success **only** when `success === true` (the service
   returns HTTP 200 with `success: false` on logical failures — mirror the
   existing connect-flow success detection).
5. Discard the decrypted password immediately after the call.
