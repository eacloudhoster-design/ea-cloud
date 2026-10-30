"""Authenticated absolute-exposure synchronization. Legacy endpoints are untouched.
The journal and MT5 lock prevent HTTP retry duplication. A crash in the broker
submission window fails closed rather than guessing whether an order filled.
"""
import hashlib
import hmac
import json
import math
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field, SecretStr

class ObserverSync(BaseModel):
    login: int = Field(gt=0)
    password: SecretStr
    server: str = Field(min_length=1, max_length=100)
    sourceKey: str = Field(pattern=r"^[a-f0-9]{64}$")
    revision: int = Field(gt=0)
    symbol: str = Field(min_length=1, max_length=64)
    target: float
    sl: float = Field(ge=0)
    tp: float = Field(ge=0)
    maxVolume: float = Field(gt=0)
    maxOpenTrades: int = Field(ge=1,le=10000,default=10)
    maxDailyDrawdown: float = Field(gt=0,le=100,default=5)

class SyncJournal:
    def __init__(self, path):
        self.path = str(path)
    def open(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA synchronous=FULL")
        db.execute("CREATE TABLE IF NOT EXISTS allocations(scope TEXT PRIMARY KEY, account TEXT NOT NULL, source TEXT NOT NULL, magic INTEGER NOT NULL, symbol TEXT NOT NULL, revision INTEGER NOT NULL, phase TEXT NOT NULL, response TEXT, UNIQUE(account,magic))")
        db.execute("CREATE TABLE IF NOT EXISTS daily_risk(account TEXT NOT NULL, day TEXT NOT NULL, equity REAL NOT NULL, PRIMARY KEY(account,day))")
        return db

def reply(ok, message, **extra):
    return {"success": ok, "message": message, "retriable": False, **extra}

def synchronize(mt5, payload, journal, connect, send):
    if not all(math.isfinite(x) for x in [payload.target,payload.sl,payload.tp,payload.maxVolume]):
        return reply(False,"Invalid numeric position target")
    if abs(payload.target)>payload.maxVolume+1e-9:
        return reply(False,"Position target exceeds the client's configured maximum")
    account=json.dumps([payload.login,payload.server],separators=(',',':'))
    scope=hashlib.sha256((account+payload.sourceKey).encode()).hexdigest()
    magic=(int(hashlib.sha256(payload.sourceKey.encode()).hexdigest()[:8],16)&0x3fffffff)|0x40000000
    db=journal.open()
    try:
        row=db.execute("SELECT * FROM allocations WHERE scope=?",[scope]).fetchone()
        if row and payload.symbol!=row['symbol']:
            return reply(False,"Broker symbol changed for an existing allocation; manual reconciliation required")
        if row and payload.revision<row['revision']:
            return reply(False,"Stale position revision rejected")
        if row and row['phase']=='dispatching':
            return reply(False,"Broker submission outcome is uncertain after restart; reconcile account history before retrying",uncertain=True)
        if row and row['phase']=='external_reduction' and payload.target!=0:
            return reply(False,"Client exposure was reduced externally; reconcile manually or first process source-flat state")
        if row and payload.revision==row['revision'] and row['phase']=='done':
            return json.loads(row['response'])
        if row is None:
            collision=db.execute("SELECT scope FROM allocations WHERE account=? AND magic=?",[account,magic]).fetchone()
            if collision:return reply(False,"Source magic allocation collision; no order submitted")
            db.execute("INSERT INTO allocations VALUES(?,?,?,?,?,?,'planned',NULL)",[scope,account,payload.sourceKey,magic,payload.symbol,payload.revision]);db.commit()
        else:
            db.execute("UPDATE allocations SET revision=?,phase='planned',response=NULL WHERE scope=?",[payload.revision,scope]);db.commit()
        def finish(result):
            db.execute("UPDATE allocations SET phase='done',response=? WHERE scope=?",[json.dumps(result),scope]);db.commit();return result
        error=connect(payload.login,payload.password.get_secret_value(),payload.server)
        if error is not None:return finish(reply(False,"Client MT5 connection failed"))
        info=mt5.symbol_info(payload.symbol)
        if info is None or not mt5.symbol_select(payload.symbol,True):return finish(reply(False,"Broker symbol unavailable"))
        account_info=mt5.account_info()
        if account_info is None:return finish(reply(False,"Account information unavailable"))
        equity=float(getattr(account_info,'equity',float('nan')))
        if not math.isfinite(equity) or equity<=0:return finish(reply(False,"Account equity unavailable for risk checks"))
        day=datetime.now(timezone.utc).date().isoformat()
        db.execute("INSERT OR IGNORE INTO daily_risk VALUES(?,?,?)",[account,day,equity]);db.commit()
        baseline=db.execute("SELECT equity FROM daily_risk WHERE account=? AND day=?",[account,day]).fetchone()['equity']
        hedging=account_info.margin_mode==getattr(mt5,'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING',2)
        step=float(getattr(info,'volume_step',0) or 0)
        minimum=float(getattr(info,'volume_min',0) or 0)
        maximum=float(getattr(info,'volume_max',0) or 0)
        if step<=0 or minimum<=0 or maximum<=0:return finish(reply(False,"Invalid broker volume constraints"))
        target=math.copysign(math.floor((abs(payload.target)+1e-10)/step)*step,payload.target) if payload.target else 0.0
        if target and abs(target)<minimum:return finish(reply(False,"Target is below broker minimum; no volume increase was invented"))
        tolerance=step/4
        for attempt in range(32):
            positions=mt5.positions_get(symbol=payload.symbol)
            if positions is None:return finish(reply(False,"Could not reconcile broker positions"))
            owned=[p for p in positions if int(p.magic)==magic]
            if not hedging and any(int(p.magic)!=magic for p in positions):return finish(reply(False,"Netting symbol contains unrelated exposure; no orders submitted"))
            if not hedging:
                others=db.execute("SELECT scope FROM allocations WHERE account=? AND symbol=? AND scope<>? AND phase='dispatching'",[account,payload.symbol,scope]).fetchone()
                if others:return finish(reply(False,"Another source has an unresolved broker submission"))
            signed=lambda p:float(p.volume)*(1 if p.type==mt5.POSITION_TYPE_BUY else -1)
            actual=sum(signed(p) for p in owned)
            # A client SL/TP or manual reduction must not be silently reopened by
            # a later unchanged source snapshot. Reductions/closure remain allowed.
            previous=json.loads(row['response']) if row and row['response'] else None
            expected=(previous or {}).get('data',{}).get('volume',0) if (previous or {}).get('success') else 0
            if attempt==0 and abs(actual)+tolerance<abs(expected) and abs(target)>abs(actual)+tolerance:
                db.execute("UPDATE allocations SET phase='external_reduction' WHERE scope=?",[scope]);db.commit()
                return reply(False,"Client exposure was reduced outside the observer; manual reconciliation required before increasing it")
            wrong=[p for p in owned if target==0 or signed(p)*target<0]
            surplus=max(0,abs(actual)-abs(target)) if actual*target>=0 else abs(actual)
            close=wrong[0] if wrong else (owned[0] if surplus>tolerance and owned else None)
            request=None
            if close is not None:
                tick=mt5.symbol_info_tick(payload.symbol)
                if tick is None:return finish(reply(False,"No current broker quote"))
                amount=min(float(close.volume),abs(signed(close)) if wrong else surplus)
                amount=math.floor((amount+1e-10)/step)*step
                if amount<minimum or (float(close.volume)-amount>tolerance and float(close.volume)-amount<minimum):return finish(reply(False,"Partial close leaves an invalid broker volume; reconciliation required"))
                action=mt5.ORDER_TYPE_SELL if close.type==mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                request={"action":mt5.TRADE_ACTION_DEAL,"position":int(close.ticket),"symbol":payload.symbol,"volume":round(amount,8),"type":action,"price":tick.bid if action==mt5.ORDER_TYPE_SELL else tick.ask}
            elif abs(actual-target)>tolerance:
                all_positions=mt5.positions_get()
                if all_positions is None:return finish(reply(False,"Account positions unavailable for risk checks"))
                if len(all_positions)>=payload.maxOpenTrades:return finish(reply(False,"Client maximum open trades reached"))
                current=mt5.account_info()
                current_equity=float(getattr(current,'equity',float('nan')))
                if not math.isfinite(current_equity) or 100*(baseline-current_equity)/baseline>=payload.maxDailyDrawdown:return finish(reply(False,"Client daily equity drawdown limit reached"))
                tick=mt5.symbol_info_tick(payload.symbol)
                if tick is None:return finish(reply(False,"No current broker quote"))
                amount=min(abs(target-actual),maximum)
                amount=math.floor((amount+1e-10)/step)*step
                if amount<minimum:return finish(reply(False,"Adjustment is below broker minimum"))
                action=mt5.ORDER_TYPE_BUY if target>actual else mt5.ORDER_TYPE_SELL
                request={"action":mt5.TRADE_ACTION_DEAL,"symbol":payload.symbol,"volume":round(amount,8),"type":action,"price":tick.ask if action==mt5.ORDER_TYPE_BUY else tick.bid,"sl":payload.sl,"tp":payload.tp}
            else:
                modify=next((p for p in owned if abs(float(p.sl)-payload.sl)>float(info.point)/2 or abs(float(p.tp)-payload.tp)>float(info.point)/2),None)
                if modify is None:return finish(reply(True,"Exposure reconciled",data={"ticket":str(owned[0].ticket) if owned else None,"tickets":[str(p.ticket) for p in owned],"volume":actual,"target":target,"retcode":getattr(mt5,'TRADE_RETCODE_DONE',10009)}))
                request={"action":mt5.TRADE_ACTION_SLTP,"position":int(modify.ticket),"symbol":payload.symbol,"sl":payload.sl,"tp":payload.tp}
            request.update({"magic":magic,"deviation":20,"comment":"OBS "+scope[:12]+" | EA CLOUD","type_time":mt5.ORDER_TIME_GTC})
            # Commit BEFORE sending. If the process dies in this window, never
            # guess/retry the order after restart: require history reconciliation.
            db.execute("UPDATE allocations SET phase='dispatching' WHERE scope=?",[scope]);db.commit()
            result=send(request,payload.symbol)
            if result is None:return reply(False,"Broker returned no execution result; manual reconciliation required",uncertain=True)
            if result.retcode not in [getattr(mt5,'TRADE_RETCODE_DONE',10009),getattr(mt5,'TRADE_RETCODE_DONE_PARTIAL',10010)]:
                return finish(reply(False,"Broker rejected position synchronization",data={"retcode":int(result.retcode)}))
            db.execute("UPDATE allocations SET phase='planned' WHERE scope=?",[scope]);db.commit()
        return finish(reply(False,"Reconciliation action limit reached; inspect partial fills"))
    finally:db.close()

def register_observer_routes(app, mt5, lock, connect, send, journal_path=None):
    journal=SyncJournal(journal_path or Path(__file__).with_name('observer-journal.sqlite3'))
    def authorized(value):
        expected=os.environ.get('OBSERVER_MT5_VPS_TOKEN','')
        if len(expected)<32:raise HTTPException(503,'Observer execution service is not configured')
        if not value or not hmac.compare_digest(value,'Bearer '+expected):raise HTTPException(401,'Invalid service credential')
    @app.get('/observer/capabilities')
    def capabilities(authorization:Optional[str]=Header(default=None)):
        authorized(authorization)
        with lock:
            db=journal.open();db.close()
        return {"version":2,"persistentJournal":True,"absoluteTargets":True}
    @app.post('/observer/sync-position')
    def sync(payload:ObserverSync,authorization:Optional[str]=Header(default=None)):
        authorized(authorization)
        with lock:return synchronize(mt5,payload,journal,connect,send)
