"""Official SDK driver for the existing account worker/reconciler.

No import, credential read or SDK call at module import/construction. Only a
private signed DEMO session grant + owned journal can initialize the real SDK.
Simulation workers never import this driver. No approval issuer is implemented.
"""
from contextlib import contextmanager,closing
from contextvars import ContextVar
from decimal import Decimal
import hashlib
import importlib
import math
import ntpath
import os
import re
from pathlib import Path
import sqlite3
import sys
import time
from types import SimpleNamespace
from typing import Literal

from pydantic import Field
from private_ipc import StrictModel,canonical,verify
from worker_state import StateLease
from broker_profiles import filling_policy


class Mt5IntegrationError(PermissionError):pass


class DemoSessionGrant(StrictModel):
    protocol: Literal['ea-mt5-demo-session-v1']
    scope: Literal['connect-read','connect-execute-demo']
    authorization_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    assignment_digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    issued_ms: int = Field(gt=0)
    expires_ms: int = Field(gt=0)


def assignment_digest(config,gateway_id):
    if not re.fullmatch(r'[a-f0-9]{32}',gateway_id):raise Mt5IntegrationError('GATEWAY_ID_INVALID')
    return hashlib.sha256(canonical(dict(gateway_id=gateway_id,config=config.model_dump()))).hexdigest()


def verify_session_grant(frame,key,config,gateway_id,now):
    try:
        if type(key) is not bytes or len(key)!=32:raise ValueError()
        grant=DemoSessionGrant.model_validate(verify(frame,key,'request'))
        if grant.assignment_digest!=assignment_digest(config,gateway_id):raise ValueError()
        if not 0<grant.expires_ms-grant.issued_ms<=3600000 or not grant.issued_ms<=now<grant.expires_ms:raise ValueError()
        if config.account_mode!='demo':raise ValueError()
        if grant.scope=='connect-execute-demo' and (config.role!='client' or not config.enabled or not config.execution_approved):raise ValueError()
        return grant
    except Exception:raise Mt5IntegrationError('SESSION_AUTHORIZATION_INVALID') from None


def load_official_sdk():
    if sys.platform!='win32' or sys.maxsize<=2**32:raise Mt5IntegrationError('WINDOWS_X64_REQUIRED')
    return importlib.import_module('MetaTrader5')


_CONSTANTS=frozenset(('ACCOUNT_TRADE_MODE_DEMO','ACCOUNT_MARGIN_MODE_RETAIL_HEDGING','POSITION_TYPE_BUY',
    'ORDER_TYPE_BUY','ORDER_TYPE_SELL','TRADE_ACTION_DEAL','TRADE_ACTION_SLTP','ORDER_TIME_GTC',
    'TRADE_RETCODE_DONE','TRADE_RETCODE_DONE_PARTIAL','ORDER_FILLING_FOK','ORDER_FILLING_IOC',
    'ORDER_FILLING_RETURN','SYMBOL_TRADE_EXECUTION_MARKET'))


class RealMt5Adapter:
    simulation=False
    def __init__(self,config,gateway_id,authorization_frame,verification_key,credential_provider,*,
                 stop_checker,clock=lambda:time.time_ns()//1000000,monotonic=time.monotonic,sdk_loader=load_official_sdk):
        # Revalidate immutable approved config; do not retain the mutable HTTP config object.
        self.__config=type(config).model_validate(config.model_dump())
        if not self.__config.expected_sdk_version:raise Mt5IntegrationError('PINNED_SDK_VERSION_REQUIRED')
        if self.__config.credential_ref in ('api-token','gateway-id','mt5-session-verifier-key','mt5-session-authorization'):
            raise Mt5IntegrationError('INVALID_CREDENTIAL_REFERENCE')
        self.__digest=assignment_digest(self.__config,gateway_id)
        self.__grant=verify_session_grant(authorization_frame,verification_key,self.__config,gateway_id,clock())
        self.__binding=hashlib.sha256(canonical(dict(assignment=self.__digest,key_hash=hashlib.sha256(verification_key).hexdigest()))).hexdigest()
        self.__provider,self.__stop,self.__clock,self.__loader=credential_provider,stop_checker,clock,sdk_loader
        self.__sdk=None;self.__owner=None;self.__epoch=None;self.__claimed=False;self.__initialized=False
        self.__volatile_hold=False
        self.__highwater=clock()
        self.__monotonic=monotonic;self.__started=monotonic()
        self.__deadline=self.__started+(self.__grant.expires_ms-self.__highwater)/1000
        self.__permit=ContextVar('real_mt5_final_permit',default=None)

    def attach_owner(self,owner):
        if type(owner) is not StateLease or owner.stream is None or owner.path!=Path(self.__config.journal_path+'.owner'):
            raise Mt5IntegrationError('JOURNAL_OWNERSHIP_REQUIRED')
        self.__owner=owner

    def __getattr__(self,name):
        if name not in _CONSTANTS or self.__sdk is None:raise AttributeError(name)
        return getattr(self.__sdk,name)

    def _authorized(self):
        if self.__owner is None or self.__owner.stream is None:raise Mt5IntegrationError('JOURNAL_OWNERSHIP_REQUIRED')
        elapsed=self.__monotonic()
        if not self.__started<=elapsed<self.__deadline:raise Mt5IntegrationError('SESSION_AUTHORIZATION_EXPIRED')
        now=self.__clock()
        if type(now) is not int or now<self.__highwater or not self.__grant.issued_ms<=now<self.__grant.expires_ms:raise Mt5IntegrationError('SESSION_AUTHORIZATION_EXPIRED')
        self.__highwater=now
        if self.__stop() is not False:raise Mt5IntegrationError('EMERGENCY_STOP_ACTIVE')
        if self.__epoch is not None:
            with closing(sqlite3.connect(self.__config.journal_path,timeout=.1)) as db:
                row=db.execute('SELECT binding,epoch,highwater_ms FROM real_sdk_state WHERE id=1').fetchone()
                if not row or row[:2]!=(self.__binding,self.__epoch) or now<row[2]:raise Mt5IntegrationError('STALE_SESSION_FENCE')
                with db:db.execute('UPDATE real_sdk_state SET highwater_ms=? WHERE id=1',[now])

    def _claim(self):
        if self.__claimed:return
        with closing(sqlite3.connect(self.__config.journal_path,timeout=.1)) as db:
            db.execute('PRAGMA synchronous=FULL');db.execute('BEGIN IMMEDIATE')
            exists=db.execute("SELECT 1 FROM sqlite_master WHERE name='real_sdk_state'").fetchone()
            witness=Path(self.__config.journal_path+'.real-sdk-binding')
            if exists:
                if witness.is_symlink() or witness.read_text()!=self.__binding:raise Mt5IntegrationError('SESSION_LEDGER_WITNESS_MISMATCH')
            elif witness.exists():raise Mt5IntegrationError('SESSION_LEDGER_MISSING')
            if not exists:
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='sdk_adapter_installation'").fetchone():raise Mt5IntegrationError('SIMULATION_JOURNAL_FORBIDDEN')
                db.execute('CREATE TABLE real_sdk_state(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT,epoch INTEGER,held INTEGER,highwater_ms INTEGER)')
                db.execute('CREATE TABLE real_sdk_authorizations(id_hash TEXT PRIMARY KEY,scope TEXT,issued_ms INTEGER,expires_ms INTEGER,accepted_ms INTEGER,epoch INTEGER)')
                db.execute('INSERT INTO real_sdk_state VALUES(1,?,0,0,0)',[self.__binding])
                # A missing/replaced journal must not silently reset replay/hold state.
                with witness.open('x') as stream:
                    stream.write(self.__binding);stream.flush();os.fsync(stream.fileno())
            row=db.execute('SELECT binding,epoch,highwater_ms FROM real_sdk_state WHERE id=1').fetchone()
            if not row or row[0]!=self.__binding or self.__clock()<row[2]:raise Mt5IntegrationError('SESSION_ASSIGNMENT_CONFLICT')
            aid=hashlib.sha256(self.__grant.authorization_id.encode()).hexdigest()
            if db.execute('SELECT 1 FROM real_sdk_authorizations WHERE id_hash=?',[aid]).fetchone():raise Mt5IntegrationError('SESSION_AUTHORIZATION_REPLAYED')
            self.__epoch=row[1]+1
            db.execute('INSERT INTO real_sdk_authorizations VALUES(?,?,?,?,?,?)',[aid,self.__grant.scope,self.__grant.issued_ms,self.__grant.expires_ms,self.__clock(),self.__epoch])
            db.execute('UPDATE real_sdk_state SET epoch=?,highwater_ms=? WHERE id=1',[self.__epoch,self.__clock()]);db.commit()
        self.__claimed=True

    def _hold(self):
        self.__volatile_hold=True
        if self.__epoch is not None:
            try:
                with Path(self.__config.journal_path+'.real-sdk-hold').open('x') as stream:
                    stream.write('REVIEW_REQUIRED');stream.flush();os.fsync(stream.fileno())
            except FileExistsError:pass
            except OSError:pass
        if self.__epoch is not None:
            try:
                with closing(sqlite3.connect(self.__config.journal_path,timeout=.1)) as db:
                    with db:db.execute('UPDATE real_sdk_state SET held=1 WHERE binding=?',[self.__binding])
            except Exception:pass

    @property
    def held(self):
        if self.__volatile_hold or os.path.lexists(self.__config.journal_path+'.real-sdk-hold'):return True
        if self.__epoch is None:return False
        try:
            with closing(sqlite3.connect(self.__config.journal_path,timeout=.1)) as db:
                row=db.execute('SELECT held FROM real_sdk_state WHERE binding=?',[self.__binding]).fetchone()
            return not row or row[0]!=0
        except Exception:return True

    @property
    def execution_authorized(self):
        try:self._authorized();return self.__grant.scope=='connect-execute-demo' and not self.held
        except Exception:return False

    def initialize(self,path,*,login,password,server,portable,timeout):
        try:
            self._authorized()
            cfg=self.__config
            if (path,login,server,portable)!=(cfg.terminal_path,cfg.login,cfg.server,True) or not 1<=timeout<=15000:
                raise Mt5IntegrationError('SESSION_SWITCH_FORBIDDEN')
            self._claim();self._authorized()
            with closing(sqlite3.connect(cfg.journal_path,timeout=.1)) as db:
                if db.execute("SELECT 1 FROM allocations WHERE phase IN ('dispatching','reconciled_hold','external_reduction') LIMIT 1").fetchone():self._hold()
            if self.__sdk is None:self.__sdk=self.__loader()
            if getattr(self.__sdk,'__version__',None)!=cfg.expected_sdk_version:raise Mt5IntegrationError('SDK_VERSION_MISMATCH')
            # Credential reference resolves only after private authorization and ownership.
            secret=self.__provider()
            if type(secret) is not str or not secret:raise Mt5IntegrationError('CREDENTIAL_UNAVAILABLE')
            if not self.__sdk.initialize(cfg.terminal_path,login=cfg.login,password=secret,server=cfg.server,portable=True,timeout=timeout):
                raise Mt5IntegrationError('TERMINAL_INITIALIZATION_FAILED')
            self.__initialized=True;self._identity();return True
        except Exception:
            self._hold();self.shutdown()
            raise Mt5IntegrationError('SESSION_INITIALIZATION_REFUSED') from None

    def _identity(self):
        try:
            self._authorized()
            if not self.__initialized:raise Mt5IntegrationError('SESSION_NOT_INITIALIZED')
            account=self.__sdk.account_info();terminal=self.__sdk.terminal_info();cfg=self.__config
            norm=lambda p:ntpath.normcase(ntpath.normpath(p))
            directory=norm(ntpath.dirname(cfg.terminal_path))
            if not account or (account.login,account.server,account.trade_mode,account.margin_mode)!=(cfg.login,cfg.server,0,2):
                self._hold();raise Mt5IntegrationError('DEMO_HEDGING_IDENTITY_MISMATCH')
            if not terminal or not terminal.connected or any(norm(getattr(terminal,k,''))!=directory for k in ('path','data_path')):
                self._hold();raise Mt5IntegrationError('TERMINAL_IDENTITY_MISMATCH')
            return account,terminal
        except Exception:
            self._hold();raise Mt5IntegrationError('SESSION_IDENTITY_UNAVAILABLE') from None

    def _read(self,name,*args,**kwargs):
        try:
            self._identity();value=getattr(self.__sdk,name)(*args,**kwargs)
            if value is None:raise Mt5IntegrationError('SDK_READ_UNAVAILABLE')
            self._identity();return value
        except Exception:
            self._hold();raise Mt5IntegrationError('SDK_READ_FAILED') from None

    def account_info(self):return self._identity()[0]
    def terminal_info(self):return self._identity()[1]
    def symbol_info(self,symbol):return self._read('symbol_info',symbol)
    def symbol_info_tick(self,symbol):return self._read('symbol_info_tick',symbol)
    def symbol_select(self,symbol,selected):
        if not self.execution_authorized or selected is not True:raise Mt5IntegrationError('SYMBOL_SELECTION_NOT_AUTHORIZED')
        return self._read('symbol_select',symbol,True)
    def positions_get(self,**filters):return self._read('positions_get',**filters)
    def orders_get(self,**filters):return self._read('orders_get',**filters)
    def history_orders_get(self,*args,**filters):return self._read('history_orders_get',*args,**filters)
    def history_deals_get(self,*args,**filters):return self._read('history_deals_get',*args,**filters)
    def version(self):return self._read('version')

    @contextmanager
    def execution_scope(self,permit):
        token=self.__permit.set(permit)
        try:yield
        finally:self.__permit.reset(token)

    def order_send(self,request):return self.send(request,request.get('symbol'))

    def _allocation_positions(self,symbol,magic):
        rows=[p for p in self.positions_get(symbol=symbol) if p.magic==magic]
        if len({p.ticket for p in rows})!=len(rows) or any(type(p.ticket) is not int or p.ticket<=0 or p.type not in (0,1) or not math.isfinite(p.volume) or p.volume<=0 or getattr(p,'symbol',symbol)!=symbol for p in rows):
            raise Mt5IntegrationError('ALLOCATION_SNAPSHOT_INVALID')
        return rows

    def send(self,request,symbol):
        permit=self.__permit.get()
        if not self.execution_authorized or permit is None or permit() is not True:
            raise Mt5IntegrationError('GUARDED_GATEWAY_REQUIRED')
        allowed={'action','symbol','position','volume','type','price','sl','tp','magic','deviation','comment','type_time','type_filling'}
        if type(request) is not dict or set(request)-allowed or request.get('symbol')!=symbol or not re.fullmatch(r'EC:[a-f0-9]{28}',request.get('comment','')):
            raise Mt5IntegrationError('INVALID_ORDER_REQUEST')
        order=dict(request);action=order.get('action')
        if type(action) is not int or action not in (1,6):raise Mt5IntegrationError('UNSUPPORTED_ORDER_ACTION')
        for field in ('volume','price','sl','tp'):
            if field in order and (type(order[field]) not in (int,float) or not math.isfinite(order[field]) or order[field]<0):raise Mt5IntegrationError('INVALID_ORDER_NUMBER')
        if type(symbol) is not str or not 1<=len(symbol)<=64 or symbol!=symbol.strip() or any(ord(c)<32 or ord(c)==127 for c in symbol):raise Mt5IntegrationError('INVALID_SYMBOL')
        if type(order.get('magic')) is not int or order['magic']<=0:raise Mt5IntegrationError('INVALID_ALLOCATION')
        if 'position' in order and (type(order['position']) is not int or order['position']<=0):raise Mt5IntegrationError('INVALID_POSITION')
        if action==6 and 'position' not in order:raise Mt5IntegrationError('POSITION_REQUIRED')
        if action==1 and (type(order.get('type')) is not int or order['type'] not in (0,1)):raise Mt5IntegrationError('INVALID_ORDER_SIDE')
        info=self.symbol_info(symbol)
        if getattr(info,'name',symbol)!=symbol:raise Mt5IntegrationError('SYMBOL_IDENTITY_MISMATCH')
        if action==1:
            volume=Decimal(str(order.get('volume',0)));step=Decimal(str(info.volume_step))
            if step<=0 or not Decimal(str(info.volume_min))<=volume<=Decimal(str(info.volume_max)) or volume%step:raise Mt5IntegrationError('BROKER_VOLUME_CONSTRAINT')
            order['type_filling']=filling_policy(self,info)
        before=[SimpleNamespace(ticket=p.ticket,type=p.type,volume=float(p.volume),sl=p.sl,tp=p.tp) for p in self._allocation_positions(symbol,order['magic'])]
        if 'position' in order:
            selected=[p for p in before if p.ticket==order['position']]
            if len(selected)!=1 or (action==1 and (selected[0].type==order['type'] or order['volume']>selected[0].volume+1e-8)):
                raise Mt5IntegrationError('POSITION_OWNERSHIP_MISMATCH')
        account,terminal=self._identity()
        if not account.trade_allowed or not getattr(account,'trade_expert',False) or not terminal.trade_allowed or getattr(terminal,'tradeapi_disabled',True):raise Mt5IntegrationError('TERMINAL_TRADING_BLOCKED')
        if not self.execution_authorized or permit() is not True:raise Mt5IntegrationError('FINAL_EXECUTION_GATE_FAILED')
        try:
            check=self.__sdk.order_check(order)
            if check is None or type(check.retcode) is not int or check.retcode!=0:
                raise Mt5IntegrationError('BROKER_ORDER_CHECK_FAILED')
            # Preflight itself may block or race with a stop/identity change.
            self._identity()
            if not self.execution_authorized or permit() is not True:raise Mt5IntegrationError('FINAL_EXECUTION_GATE_FAILED')
            receipt=self.__sdk.order_send(order)
            if receipt is None:raise ValueError()
            retcode=receipt.retcode
            if type(retcode) is not int:raise ValueError()
            # Only conclusive outcomes are returned; timeout/placed/connection/unknown stay held.
            if retcode not in (10009,10010,10004,10006,10007,10013,10014,10015,10016,10017,10018,10019,10021,10022,10024,10026,10027,10030):raise ValueError()
            result={name:getattr(receipt,name,0) for name in ('retcode','order','deal','volume','price')}
            if any(type(result[k]) is not int for k in ('order','deal')):raise ValueError()
            if any(type(value) not in (int,float) or not math.isfinite(value) or value<0 for value in result.values()):raise ValueError()
            if action==1 and retcode in (10009,10010):
                if not result['order'] or not result['deal'] or not 0<result['volume']<=order['volume']+1e-8:raise ValueError()
                if retcode==10009 and abs(result['volume']-order['volume'])>1e-8:raise ValueError()
            self._identity()
            if permit() is not True:raise Mt5IntegrationError('RECEIPT_AFTER_EXECUTION_DEADLINE')
            observed=True
            if retcode==10009:
                after=self._allocation_positions(symbol,order['magic'])
                if action==1:
                    signed=lambda rows:sum(p.volume*(1 if p.type==0 else -1) for p in rows)
                    gross=lambda rows:sum(p.volume for p in rows)
                    expected=signed(before)+order['volume']*(1 if order['type']==0 else -1)
                    expected_gross=gross(before)+order['volume']*(-1 if 'position' in order else 1)
                    observed=abs(signed(after)-expected)<=1e-8 and abs(gross(after)-expected_gross)<=1e-8
                else:
                    position=next((p for p in after if p.ticket==order['position']),None)
                    observed=position is not None and abs(position.sl-order.get('sl',0))<=info.point/2 and abs(position.tp-order.get('tp',0))<=info.point/2
            if retcode==10010 or not observed:
                # A partial receipt or lagging position view cannot justify another
                # order. Preserve the receipt and hold; never chase the residual.
                self._hold();result['reconciliation_required']=True
            return SimpleNamespace(**result)
        except Exception:
            self._hold();return None

    def shutdown(self):
        if self.__sdk is not None:
            try:self.__sdk.shutdown()
            except Exception:self._hold()
        self.__initialized=False
