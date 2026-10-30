"""
EA Cloud — MT5 Trade Execution Service
======================================

A FastAPI service that runs on a Windows VPS alongside a MetaTrader 5 terminal.
It exposes a small HTTP API the EA Cloud backend calls to verify accounts and
execute copy trades.

Key facts:
- Requires the `MetaTrader5` Python package (Windows only) and an installed MT5
  terminal on the same machine.
- MT5's Python API allows only ONE logged-in account per terminal process at a
  time, so every request initializes + logs in to the requested account. A
  global lock serializes access to avoid interleaving between concurrent calls.
- Every operation logs the initialize result, login result, order_send result,
  and MT5 last_error for debugging.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000

Interactive docs:  http://<vps-ip>:8000/docs
OpenAPI schema:    http://<vps-ip>:8000/openapi.json
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Literal, Optional

import MetaTrader5 as mt5
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field

# ──────────────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("mt5_service.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("mt5-service")

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────
MAGIC = 234000          # identifies orders opened by EA Cloud
DEVIATION = 20          # max price slippage in points
COMMENT = "EA Cloud"

# Only one MT5 account can be active per terminal — serialize all access.
MT5_LOCK = threading.Lock()

app = FastAPI(
    title="EA Cloud MT5 Trade Execution Service",
    description="HTTP API for verifying MT5 accounts and executing copy trades.",
    version="1.0.0",
)

# ──────────────────────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────────────────────
class MT5Login(BaseModel):
    login: int = Field(..., examples=[12345678])
    password: str = Field(..., examples=["decrypted-password"])
    server: str = Field(..., examples=["Broker-MT5"])


class ExecuteTradeRequest(MT5Login):
    symbol: str = Field(..., examples=["EURUSD"])
    action: Literal["BUY", "SELL"] = Field(..., examples=["BUY"])
    volume: float = Field(..., gt=0, examples=[0.10])
    sl: Optional[float] = Field(default=None, examples=[1.1200])
    tp: Optional[float] = Field(default=None, examples=[1.1300])
    comment: Optional[str] = Field(default=None, examples=["signal-42"])


class CloseTradeRequest(MT5Login):
    ticket: int = Field(..., description="Position ticket to close", examples=[123456789])
    volume: Optional[float] = Field(
        default=None, gt=0,
        description="Partial close volume; omit to close the full position",
        examples=[0.05],
    )


class ModifyTradeRequest(MT5Login):
    ticket: int = Field(..., description="Position ticket to modify", examples=[123456789])
    sl: Optional[float] = Field(default=None, examples=[1.1150])
    tp: Optional[float] = Field(default=None, examples=[1.1350])


# ──────────────────────────────────────────────────────────────────────────────
# Response models
# ──────────────────────────────────────────────────────────────────────────────
class LastError(BaseModel):
    code: int
    message: str


class ApiResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict[str, Any]] = None
    last_error: Optional[LastError] = None


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _last_error() -> LastError:
    code, message = mt5.last_error()
    return LastError(code=code, message=str(message))


def _is_done(result) -> bool:
    """A market request succeeded if fully OR partially filled."""
    if result is None:
        return False
    return result.retcode in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_DONE_PARTIAL)


def _is_partial(result) -> bool:
    return result is not None and result.retcode == mt5.TRADE_RETCODE_DONE_PARTIAL


def _connect(login: int, password: str, server: str) -> Optional[ApiResponse]:
    """Initialize the terminal and log in to the requested account.

    Returns None on success, or a populated error ApiResponse on failure.
    Caller must already hold MT5_LOCK.
    """
    # initialize ----------------------------------------------------------------
    init_ok = mt5.initialize()
    log.info("initialize() -> %s | last_error=%s", init_ok, mt5.last_error())
    if not init_ok:
        return ApiResponse(
            success=False,
            message="MT5 terminal failed to initialize",
            last_error=_last_error(),
        )

    # login ---------------------------------------------------------------------
    login_ok = mt5.login(login=login, password=password, server=server)
    log.info(
        "login(login=%s, server=%s) -> %s | last_error=%s",
        login, server, login_ok, mt5.last_error(),
    )
    if not login_ok:
        return ApiResponse(
            success=False,
            message="MT5 login failed — check login, password and server",
            last_error=_last_error(),
        )
    return None


def _select_symbol(symbol: str) -> bool:
    info = mt5.symbol_info(symbol)
    if info is None:
        log.warning("symbol_info(%s) is None", symbol)
        return False
    if not info.visible:
        if not mt5.symbol_select(symbol, True):
            log.warning("symbol_select(%s) failed | last_error=%s", symbol, mt5.last_error())
            return False
    return True


def _filling_modes(symbol: str) -> list[int]:
    """Return candidate ORDER_FILLING_* modes, preferring those the symbol allows.

    symbol_info.filling_mode is a bitmask of SYMBOL_FILLING_* capability flags
    (FOK = 1, IOC = 2) — NOT the ORDER_FILLING_* constants — so map explicitly.
    Modes the broker advertises are tried first; the rest remain as fallbacks.
    """
    fallbacks = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
    info = mt5.symbol_info(symbol)
    if info is None:
        return fallbacks

    fm = int(getattr(info, "filling_mode", 0) or 0)
    ordered: list[int] = []
    if fm & 2:  # SYMBOL_FILLING_IOC
        ordered.append(mt5.ORDER_FILLING_IOC)
    if fm & 1:  # SYMBOL_FILLING_FOK
        ordered.append(mt5.ORDER_FILLING_FOK)
    for mode in fallbacks:
        if mode not in ordered:
            ordered.append(mode)
    return ordered


def _send_with_filling(base_request: dict[str, Any], symbol: str):
    """order_send, retrying across filling modes if the broker rejects one."""
    result = None
    for filling in _filling_modes(symbol):
        req = {**base_request, "type_filling": filling}
        result = mt5.order_send(req)
        log.info(
            "order_send(filling=%s) -> retcode=%s comment=%s | last_error=%s",
            filling,
            getattr(result, "retcode", None),
            getattr(result, "comment", None),
            mt5.last_error(),
        )
        if _is_done(result):
            return result
        # 10030 = Unsupported filling mode — try the next candidate
        if result is None or result.retcode != 10030:
            break
    return result


def _result_payload(result) -> dict[str, Any]:
    return {
        "ticket": getattr(result, "order", None),
        "deal": getattr(result, "deal", None),
        "retcode": getattr(result, "retcode", None),
        "comment": getattr(result, "comment", None),
        "price": getattr(result, "price", None),
        "volume": getattr(result, "volume", None),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Trade comment — every EA-Cloud-executed order MUST carry the "| EA CLOUD" marker
# ──────────────────────────────────────────────────────────────────────────────
EA_CLOUD_SUFFIX = " | EA CLOUD"
MT5_COMMENT_MAX = 31  # MT5 silently truncates order comments beyond 31 chars


def _build_trade_comment(raw: Optional[str]) -> tuple[str, str]:
    """Return (bot_name, comment) where comment always ends with " | EA CLOUD".

    The backend sends the bot name (sometimes already suffixed). We normalize so
    every order carries EXACTLY ONE marker, fall back to the default when empty,
    and trim the bot name (never the marker) to fit MT5's 31-char comment limit.
    """
    base = (raw or COMMENT).strip()
    # Drop any marker the caller already appended so we never double it up.
    if base.lower().endswith(EA_CLOUD_SUFFIX.lower()):
        base = base[: -len(EA_CLOUD_SUFFIX)].rstrip(" |").strip()
    bot_name = base or COMMENT
    comment = f"{bot_name}{EA_CLOUD_SUFFIX}"
    if len(comment) > MT5_COMMENT_MAX:
        keep = MT5_COMMENT_MAX - len(EA_CLOUD_SUFFIX)
        bot_name = bot_name[:keep].rstrip()
        comment = f"{bot_name}{EA_CLOUD_SUFFIX}"
    return bot_name, comment


# ──────────────────────────────────────────────────────────────────────────────
# Health & root
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/")
def root() -> dict[str, str]:
    return {"service": "EA Cloud MT5 Trade Execution Service", "status": "ok"}


@app.get("/mt5-health", response_model=ApiResponse)
def mt5_health() -> ApiResponse:
    """Report whether the MT5 package and terminal are available."""
    with MT5_LOCK:
        init_ok = mt5.initialize()
        log.info("[health] initialize() -> %s | last_error=%s", init_ok, mt5.last_error())
        if not init_ok:
            return ApiResponse(
                success=False,
                message="MT5 terminal not available",
                last_error=_last_error(),
            )
        term = mt5.terminal_info()
        version = mt5.version()
        return ApiResponse(
            success=True,
            message="MT5 terminal is available",
            data={
                "version": list(version) if version else None,
                "terminal": term._asdict() if term else None,
            },
        )


# ──────────────────────────────────────────────────────────────────────────────
# Account verification (kept for backward compatibility with /connect-mt5)
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/connect-mt5", response_model=ApiResponse)
def connect_mt5(payload: MT5Login) -> ApiResponse:
    with MT5_LOCK:
        err = _connect(payload.login, payload.password, payload.server)
        if err is not None:
            return err
        acc = mt5.account_info()
        if acc is None:
            return ApiResponse(success=False, message="Could not read account info", last_error=_last_error())
        a = acc._asdict()
        return ApiResponse(
            success=True,
            message="MT5 account connected",
            data={
                "login": a.get("login"),
                "server": a.get("server"),
                "name": a.get("name"),
                "broker": a.get("company"),
                "balance": a.get("balance"),
                "equity": a.get("equity"),
                "currency": a.get("currency"),
                "leverage": a.get("leverage"),
            },
        )


# ──────────────────────────────────────────────────────────────────────────────
# Execute trade (BUY / SELL)
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/execute-trade", response_model=ApiResponse)
def execute_trade(payload: ExecuteTradeRequest) -> ApiResponse:
    with MT5_LOCK:
        err = _connect(payload.login, payload.password, payload.server)
        if err is not None:
            return err

        if not _select_symbol(payload.symbol):
            return ApiResponse(
                success=False,
                message=f"Symbol {payload.symbol} is not available on this account",
                last_error=_last_error(),
            )

        tick = mt5.symbol_info_tick(payload.symbol)
        if tick is None:
            return ApiResponse(success=False, message="No price tick for symbol", last_error=_last_error())

        if payload.action == "BUY":
            order_type = mt5.ORDER_TYPE_BUY
            price = tick.ask
        else:  # SELL
            order_type = mt5.ORDER_TYPE_SELL
            price = tick.bid

        # Force the EA Cloud marker onto every executed trade, regardless of
        # what the backend sent. This is the ONLY place order_send sets comment.
        bot_name, trade_comment = _build_trade_comment(payload.comment)
        log.info(
            "Sending trade:\nBot Name: %s\nMT5 Comment: %s",
            bot_name,
            trade_comment,
        )

        request: dict[str, Any] = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": payload.symbol,
            "volume": float(payload.volume),
            "type": order_type,
            "price": price,
            "deviation": DEVIATION,
            "magic": MAGIC,
            "comment": trade_comment,
            "type_time": mt5.ORDER_TIME_GTC,
        }
        if payload.sl is not None:
            request["sl"] = float(payload.sl)
        if payload.tp is not None:
            request["tp"] = float(payload.tp)

        result = _send_with_filling(request, payload.symbol)
        if result is None:
            return ApiResponse(success=False, message="order_send returned no result", last_error=_last_error())

        if not _is_done(result):
            return ApiResponse(
                success=False,
                message=f"Order rejected (retcode {result.retcode}: {result.comment})",
                data=_result_payload(result),
                last_error=_last_error(),
            )

        partial = _is_partial(result)
        log.info(
            "execute-trade OK ticket=%s symbol=%s action=%s partial=%s",
            result.order, payload.symbol, payload.action, partial,
        )
        return ApiResponse(
            success=True,
            message=f"{payload.action} order executed{' (partial fill)' if partial else ''}",
            data={
                **_result_payload(result),
                "symbol": payload.symbol,
                "action": payload.action,
                "partial": partial,
            },
        )


# ──────────────────────────────────────────────────────────────────────────────
# Close trade (full or partial)
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/close-trade", response_model=ApiResponse)
def close_trade(payload: CloseTradeRequest) -> ApiResponse:
    with MT5_LOCK:
        err = _connect(payload.login, payload.password, payload.server)
        if err is not None:
            return err

        positions = mt5.positions_get(ticket=payload.ticket)
        log.info("positions_get(ticket=%s) -> %s | last_error=%s", payload.ticket, positions, mt5.last_error())
        if not positions:
            return ApiResponse(
                success=False,
                message=f"No open position with ticket {payload.ticket}",
                last_error=_last_error(),
            )

        pos = positions[0]
        if not _select_symbol(pos.symbol):
            return ApiResponse(success=False, message=f"Symbol {pos.symbol} unavailable", last_error=_last_error())

        tick = mt5.symbol_info_tick(pos.symbol)
        if tick is None:
            return ApiResponse(success=False, message="No price tick for symbol", last_error=_last_error())

        # Close = send an opposite deal referencing the position ticket
        if pos.type == mt5.POSITION_TYPE_BUY:
            close_type = mt5.ORDER_TYPE_SELL
            price = tick.bid
        else:
            close_type = mt5.ORDER_TYPE_BUY
            price = tick.ask

        # Determine close volume — full position by default, validated for partials.
        if payload.volume is None:
            volume = float(pos.volume)
        else:
            volume = float(payload.volume)
            if volume > float(pos.volume) + 1e-9:
                return ApiResponse(
                    success=False,
                    message=f"Requested close volume {volume} exceeds position volume {pos.volume}",
                )
            sinfo = mt5.symbol_info(pos.symbol)
            if sinfo is not None:
                step = float(getattr(sinfo, "volume_step", 0) or 0)
                vmin = float(getattr(sinfo, "volume_min", 0) or 0)
                if step > 0:
                    # Snap down to the broker's volume step to avoid rejections.
                    volume = round(round(volume / step) * step, 8)
                if vmin > 0 and volume < vmin:
                    return ApiResponse(
                        success=False,
                        message=f"Requested close volume is below the symbol minimum {vmin}",
                    )

        request: dict[str, Any] = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": volume,
            "type": close_type,
            "position": pos.ticket,
            "price": price,
            "deviation": DEVIATION,
            "magic": MAGIC,
            "comment": f"{COMMENT} close",
            "type_time": mt5.ORDER_TIME_GTC,
        }

        result = _send_with_filling(request, pos.symbol)
        if result is None:
            return ApiResponse(success=False, message="order_send returned no result", last_error=_last_error())

        if not _is_done(result):
            return ApiResponse(
                success=False,
                message=f"Close rejected (retcode {result.retcode}: {result.comment})",
                data=_result_payload(result),
                last_error=_last_error(),
            )

        log.info("close-trade OK ticket=%s volume=%s partial=%s", payload.ticket, volume, _is_partial(result))
        return ApiResponse(
            success=True,
            message="Position closed",
            data={**_result_payload(result), "closed_ticket": payload.ticket, "closed_volume": volume},
        )


# ──────────────────────────────────────────────────────────────────────────────
# Modify SL / TP
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/modify-trade", response_model=ApiResponse)
def modify_trade(payload: ModifyTradeRequest) -> ApiResponse:
    with MT5_LOCK:
        err = _connect(payload.login, payload.password, payload.server)
        if err is not None:
            return err

        positions = mt5.positions_get(ticket=payload.ticket)
        log.info("positions_get(ticket=%s) -> %s | last_error=%s", payload.ticket, positions, mt5.last_error())
        if not positions:
            return ApiResponse(
                success=False,
                message=f"No open position with ticket {payload.ticket}",
                last_error=_last_error(),
            )

        pos = positions[0]
        # Keep existing levels if a field is omitted
        new_sl = float(payload.sl) if payload.sl is not None else pos.sl
        new_tp = float(payload.tp) if payload.tp is not None else pos.tp

        request: dict[str, Any] = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": pos.symbol,
            "position": pos.ticket,
            "sl": new_sl,
            "tp": new_tp,
            "magic": MAGIC,
        }

        result = mt5.order_send(request)
        log.info(
            "modify order_send -> retcode=%s comment=%s | last_error=%s",
            getattr(result, "retcode", None), getattr(result, "comment", None), mt5.last_error(),
        )
        if result is None:
            return ApiResponse(success=False, message="order_send returned no result", last_error=_last_error())

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return ApiResponse(
                success=False,
                message=f"Modify rejected (retcode {result.retcode}: {result.comment})",
                data=_result_payload(result),
                last_error=_last_error(),
            )
        # Note: SL/TP modification (TRADE_ACTION_SLTP) only returns DONE, never partial.

        log.info("modify-trade OK ticket=%s sl=%s tp=%s", payload.ticket, new_sl, new_tp)
        return ApiResponse(
            success=True,
            message="Stop loss / take profit updated",
            data={"ticket": payload.ticket, "sl": new_sl, "tp": new_tp, "retcode": result.retcode},
        )


# ──────────────────────────────────────────────────────────────────────────────
# Positions
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/positions", response_model=ApiResponse)
def get_positions(
    login: int = Query(..., examples=[12345678]),
    password: str = Query(..., examples=["decrypted-password"]),
    server: str = Query(..., examples=["Broker-MT5"]),
) -> ApiResponse:
    with MT5_LOCK:
        err = _connect(login, password, server)
        if err is not None:
            return err

        positions = mt5.positions_get()
        log.info("positions_get() -> %s positions | last_error=%s",
                 0 if positions is None else len(positions), mt5.last_error())
        if positions is None:
            return ApiResponse(success=False, message="Could not read positions", last_error=_last_error())

        rows = [
            {
                "ticket": p.ticket,
                "symbol": p.symbol,
                "type": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": p.volume,
                "price_open": p.price_open,
                "price_current": p.price_current,
                "sl": p.sl,
                "tp": p.tp,
                "profit": p.profit,
                "magic": p.magic,
                "comment": p.comment,
                "time": p.time,
            }
            for p in positions
        ]
        return ApiResponse(success=True, message=f"{len(rows)} open position(s)", data={"positions": rows})


# ──────────────────────────────────────────────────────────────────────────────
# Account info
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/account-info", response_model=ApiResponse)
def account_info(
    login: int = Query(..., examples=[12345678]),
    password: str = Query(..., examples=["decrypted-password"]),
    server: str = Query(..., examples=["Broker-MT5"]),
) -> ApiResponse:
    with MT5_LOCK:
        err = _connect(login, password, server)
        if err is not None:
            return err

        acc = mt5.account_info()
        if acc is None:
            return ApiResponse(success=False, message="Could not read account info", last_error=_last_error())
        a = acc._asdict()
        return ApiResponse(
            success=True,
            message="Account info",
            data={
                "login": a.get("login"),
                "server": a.get("server"),
                "name": a.get("name"),
                "broker": a.get("company"),
                "currency": a.get("currency"),
                "leverage": a.get("leverage"),
                "balance": a.get("balance"),
                "equity": a.get("equity"),
                "margin": a.get("margin"),
                "margin_free": a.get("margin_free"),
                "margin_level": a.get("margin_level"),
                "profit": a.get("profit"),
            },
        )

# Scanner operations are read-only and have separate service-token authentication.
from scanner_api import register_scanner_routes
register_scanner_routes(app, mt5, MT5_LOCK, _filling_modes)

# Observer execution is separately authenticated; Scanner remains read-only.
from observer_sync import register_observer_routes
register_observer_routes(app, mt5, MT5_LOCK, _connect, _send_with_filling)
