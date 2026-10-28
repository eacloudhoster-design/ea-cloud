"""Isolated scanner read-only quotes/broker checks. Never calls order_send."""
import hmac
from contextlib import contextmanager
import os
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

class ScannerQuoteRequest(BaseModel):
    login: int = Field(gt=0)
    password: str
    server: str
    symbol: str = Field(min_length=1, max_length=40)

class ScannerCheckRequest(ScannerQuoteRequest):
    direction: Literal['BUY', 'SELL']
    orderType: Literal['MARKET', 'BUY LIMIT', 'SELL LIMIT']
    entry: float = Field(gt=0, allow_inf_nan=False)
    stopLoss: float = Field(gt=0, allow_inf_nan=False)
    takeProfit: float = Field(gt=0, allow_inf_nan=False)
    volume: float = Field(gt=0, allow_inf_nan=False)

class ScannerActivityRequest(BaseModel):
    login: int = Field(gt=0)
    password: str
    server: str
    symbols: list[str] = Field(default_factory=list, max_length=20)

class ScannerCandlesRequest(ScannerQuoteRequest):
    timeframe: Literal['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']

def register_scanner_routes(app, mt5, lock, filling_modes=None):
    @contextmanager
    def market_read_slot():
        # Live analysis must not build a terminal-lock queue ahead of execution.
        if not lock.acquire(blocking=False):
            raise HTTPException(503, 'MT5 terminal is busy; retry market data later')
        try:
            yield
        finally:
            lock.release()

    def authenticate(token):
        expected = os.environ.get('SCANNER_MT5_VPS_TOKEN', '')
        if len(expected) < 32:
            raise HTTPException(503, 'Scanner bridge is not configured')
        if not token or not hmac.compare_digest(token, expected):
            raise HTTPException(401, 'Unauthorized scanner bridge')

    def connect(payload, select_symbol=True):
        if not mt5.initialize() or not mt5.login(login=payload.login, password=payload.password, server=payload.server):
            raise HTTPException(503, 'MT5 authentication unavailable')
        account = mt5.account_info()
        if not account or account.login != payload.login or account.server != payload.server:
            raise HTTPException(503, 'MT5 account identity mismatch')
        if select_symbol and not mt5.symbol_select(payload.symbol, True):
            raise HTTPException(422, 'Exact broker symbol unavailable')
        return account

    def snapshot(payload, account):
        info, tick, terminal = mt5.symbol_info(payload.symbol), mt5.symbol_info_tick(payload.symbol), mt5.terminal_info()
        if not info or not tick or not terminal:
            raise HTTPException(503, 'MT5 quote unavailable')
        positions = mt5.positions_get(symbol=payload.symbol)
        orders = mt5.orders_get(symbol=payload.symbol)
        if positions is None or orders is None:
            raise HTTPException(503, 'Broker exposure could not be checked')
        modes = {0:'disabled',1:'long_only',2:'short_only',3:'close_only',4:'full'}
        return dict(symbol=payload.symbol,bid=tick.bid,ask=tick.ask,timeMs=tick.time_msc,
            digits=info.digits,point=info.point,tickSize=info.trade_tick_size,stopsLevel=info.trade_stops_level,
            minLot=info.volume_min,maxLot=info.volume_max,lotStep=info.volume_step,volumeLimit=info.volume_limit,
            openVolume=sum(p.volume for p in positions)+sum(o.volume_current for o in orders),
            connected=bool(terminal.connected),tradeAllowed=bool(terminal.trade_allowed and account.trade_allowed and account.trade_expert),
            # Tick freshness/order_check are not a verified trading calendar.
            marketOpen=None,marketOrders=bool(info.order_mode & 1),limitOrders=bool(info.order_mode & 2),
            tradeMode=modes.get(info.trade_mode,'disabled'))

    @app.post('/scanner/activity-snapshot')
    def activity_snapshot(payload: ScannerActivityRequest, x_scanner_token: str = Header(default='')):
        authenticate(x_scanner_token)
        with lock:
            try:
                # Verify identity without requiring any particular symbol to exist.
                if not mt5.initialize() or not mt5.login(login=payload.login, password=payload.password, server=payload.server):
                    raise HTTPException(503, 'MT5 authentication unavailable')
                account, terminal = mt5.account_info(), mt5.terminal_info()
                if not account or not terminal or account.login != payload.login or account.server != payload.server:
                    raise HTTPException(503, 'MT5 account identity mismatch')
                return dict(connected=bool(terminal.connected),tradeAllowed=bool(terminal.trade_allowed and account.trade_allowed and account.trade_expert),
                    account=dict(balance=account.balance,equity=account.equity,profit=account.profit,currency=account.currency),
                    symbols=[dict(symbol=s,available=mt5.symbol_info(s) is not None) for s in payload.symbols if 0<len(s)<=40])
            finally:
                mt5.shutdown()

    @app.post('/scanner/symbols')
    def symbols(payload: ScannerActivityRequest, x_scanner_token: str = Header(default='')):
        authenticate(x_scanner_token)
        with market_read_slot():
            try:
                if not mt5.initialize() or not mt5.login(login=payload.login, password=payload.password, server=payload.server):
                    raise HTTPException(503, 'MT5 authentication unavailable')
                account = mt5.account_info()
                if not account or account.login != payload.login or account.server != payload.server:
                    raise HTTPException(503, 'MT5 account identity mismatch')
                available = mt5.symbols_get()
                if available is None:
                    raise HTTPException(503, 'Broker symbols unavailable')
                return dict(symbols=sorted(set(s.name for s in available if 0 < len(s.name) <= 40))[:5000])
            finally:
                mt5.shutdown()

    @app.post('/scanner/candles')
    def candles(payload: ScannerCandlesRequest, x_scanner_token: str = Header(default='')):
        authenticate(x_scanner_token)
        with market_read_slot():
            try:
                connect(payload, select_symbol=False)
                rates = mt5.copy_rates_from_pos(payload.symbol, getattr(mt5, 'TIMEFRAME_' + payload.timeframe), 0, 400)
                tick, info, terminal = mt5.symbol_info_tick(payload.symbol), mt5.symbol_info(payload.symbol), mt5.terminal_info()
                if rates is None or len(rates) < 30 or not tick or not info or not terminal:
                    raise HTTPException(503, 'Broker candle history unavailable')
                import time
                return dict(symbol=payload.symbol, timeframe=payload.timeframe,
                    candles=[dict(time=int(r['time']), open=float(r['open']), high=float(r['high']), low=float(r['low']), close=float(r['close'])) for r in rates],
                    lastPrice=float(tick.bid), tickTime=int(tick.time_msc), observedAt=int(time.time()*1000),
                    digits=int(info.digits), connected=bool(terminal.connected), marketStatus='unknown')
            finally:
                mt5.shutdown()

    @app.post('/scanner/quote')
    def quote(payload: ScannerQuoteRequest, x_scanner_token: str = Header(default='')):
        authenticate(x_scanner_token)
        with lock:
            try:
                account = connect(payload)
                return dict(quote=snapshot(payload,account))
            finally:
                mt5.shutdown()

    @app.post('/scanner/check-order')
    def check(payload: ScannerCheckRequest, x_scanner_token: str = Header(default='')):
        authenticate(x_scanner_token)
        with lock:
            try:
                account = connect(payload)
                q = snapshot(payload,account)
                buy = payload.direction == 'BUY'
                if payload.orderType == 'BUY LIMIT' and (not buy or payload.entry >= q['ask']):
                    raise HTTPException(422, 'Invalid BUY LIMIT side')
                if payload.orderType == 'SELL LIMIT' and (buy or payload.entry <= q['bid']):
                    raise HTTPException(422, 'Invalid SELL LIMIT side')
                pending = payload.orderType != 'MARKET'
                request = dict(action=mt5.TRADE_ACTION_PENDING if pending else mt5.TRADE_ACTION_DEAL,
                    symbol=payload.symbol,volume=payload.volume,
                    type=(mt5.ORDER_TYPE_BUY_LIMIT if buy else mt5.ORDER_TYPE_SELL_LIMIT) if pending else (mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL),
                    price=payload.entry if pending else (q['ask'] if buy else q['bid']),sl=payload.stopLoss,tp=payload.takeProfit,
                    type_time=mt5.ORDER_TIME_GTC,type_filling=mt5.ORDER_FILLING_RETURN if pending else mt5.ORDER_FILLING_FOK)
                modes = [mt5.ORDER_FILLING_RETURN] if pending else (filling_modes(payload.symbol) if filling_modes else [mt5.ORDER_FILLING_FOK])
                result = None
                for mode in modes:
                    request['type_filling'] = mode
                    result = mt5.order_check(request)
                    if result is None or result.retcode != 10030:
                        break
                if result and result.retcode == 10018:
                    q['marketOpen'] = False
                return dict(quote=q,brokerChecked=bool(result is not None and result.retcode == 0))
            finally:
                mt5.shutdown()
