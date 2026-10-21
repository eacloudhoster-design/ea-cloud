"""Isolated scanner read-only quotes/broker checks. Never calls order_send."""
import hmac
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

def register_scanner_routes(app, mt5, lock, filling_modes=None):
    def authenticate(token):
        expected = os.environ.get('SCANNER_MT5_VPS_TOKEN', '')
        if len(expected) < 32:
            raise HTTPException(503, 'Scanner bridge is not configured')
        if not token or not hmac.compare_digest(token, expected):
            raise HTTPException(401, 'Unauthorized scanner bridge')

    def connect(payload):
        if not mt5.initialize() or not mt5.login(login=payload.login, password=payload.password, server=payload.server):
            raise HTTPException(503, 'MT5 authentication unavailable')
        account = mt5.account_info()
        if not account or account.login != payload.login or account.server != payload.server:
            raise HTTPException(503, 'MT5 account identity mismatch')
        if not mt5.symbol_select(payload.symbol, True):
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
