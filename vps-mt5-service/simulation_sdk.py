"""Existing durable offline SDK mock, shared by simulation workers only.
No MetaTrader5 import, network connection or real broker path exists here.
"""
from __future__ import annotations
import json,os,sqlite3,time
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace as NS

BROKERS = ('deriv', 'exness', 'justmarkets', 'xm', 'rcg')

@dataclass(frozen=True)
class Account:
    id: str
    broker: str
    login: int
    server: str
    role: str = 'client'
    delay_ms: float = 20
    disconnected: bool = False  # isolated simulation connectivity fault only
    crash_after_commit: bool = False  # isolated simulation fault injection only

    def validate(self):
        import re
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,47}', self.id):
            raise ValueError('Invalid account worker identifier')
        if self.broker not in BROKERS or self.role not in ('mentor','client') or self.login <= 0 or not self.server:
            raise ValueError('Invalid account binding')
        if not 0 <= self.delay_ms <= 1000:
            raise ValueError('Invalid simulated broker delay')

class SimulatedBroker:
    """Durable synthetic positions. No MT5 import, sockets, or live order path."""
    ACCOUNT_MARGIN_MODE_RETAIL_HEDGING=2
    POSITION_TYPE_BUY=0
    ORDER_TYPE_BUY=0
    ORDER_TYPE_SELL=1
    TRADE_ACTION_DEAL=1
    TRADE_ACTION_SLTP=6
    ORDER_TIME_GTC=0
    TRADE_RETCODE_DONE=10009
    TRADE_RETCODE_DONE_PARTIAL=10010
    def __init__(self, account: Account, root: Path):
        self.account=account
        self.db=sqlite3.connect(root/'simulated-broker.sqlite3')
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS positions(ticket INTEGER PRIMARY KEY AUTOINCREMENT,magic INTEGER,type INTEGER,volume REAL,sl REAL,tp REAL,symbol TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS fills(id INTEGER PRIMARY KEY AUTOINCREMENT,committed_ns INTEGER,request TEXT)')
        self.db.commit()
    def symbol_info(self, symbol):
        return NS(volume_step=.01,volume_min=.01,volume_max=10,point=.00001)
    def symbol_select(self,*args):return True
    def symbol_info_tick(self,*args):return NS(bid=1.1,ask=1.1001)
    def account_info(self):return NS(login=self.account.login,server=self.account.server,margin_mode=2,equity=10000,trade_mode=0)
    def positions_get(self,**kw):
        rows=self.db.execute('SELECT * FROM positions'+(' WHERE symbol=?' if 'symbol' in kw else ''),[kw['symbol']] if 'symbol' in kw else []).fetchall()
        return tuple(NS(**dict(r)) for r in rows)
    def send(self, request, symbol):
        time.sleep(self.account.delay_ms/1000)
        with self.db:
            if request['action']==6:
                self.db.execute('UPDATE positions SET sl=?,tp=? WHERE ticket=?',[request['sl'],request['tp'],request['position']])
            elif 'position' in request:
                self.db.execute('UPDATE positions SET volume=round(volume-?,8) WHERE ticket=?',[request['volume'],request['position']])
                self.db.execute('DELETE FROM positions WHERE volume<=0')
            else:
                self.db.execute('INSERT INTO positions(magic,type,volume,sl,tp,symbol) VALUES(?,?,?,?,?,?)',[request['magic'],request['type'],request['volume'],request.get('sl',0),request.get('tp',0),symbol])
            fill=self.db.execute('INSERT INTO fills(committed_ns,request) VALUES(?,?)',[time.time_ns(),json.dumps(request,sort_keys=True)]).lastrowid
        if self.account.crash_after_commit:
            os._exit(70)
        return NS(retcode=10009,order=fill,deal=fill,volume=request.get('volume',0))
