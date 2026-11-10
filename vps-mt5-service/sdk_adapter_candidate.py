"""Modular reconciliation SDK contract, with an exclusively synthetic implementation.

No vendor import, backend registry, initialize/login, network or real order path.
The shared engine still owns IPC validation, leases, mapping and request receipts.
"""
from contextlib import contextmanager, closing
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import time
from types import SimpleNamespace as NS
from typing import Protocol, runtime_checkable

from pydantic import Field
from private_ipc import Binding, StrictModel, canonical
from sdk_ipc_candidate import CandidateEngine, check_simulation
from simulation_sdk import SimulatedBroker
from worker_state import StateLease

SYMBOLS = ('EURUSD', 'XAUUSD')  # Explicit fixtures, not broker symbol discovery/remapping.
TABLES = {'sdk_adapter_state', 'sdk_adapter_operations', 'sdk_adapter_audit'}


@runtime_checkable
class ReconciliationSdk(Protocol):
    """The narrow interface consumed by existing observer synchronization.

Future implementations also need isolated runtime/history/fill-policy acceptance.
This structural interface is NOT a mechanism to select or load a real backend.
"""
    def account_info(self): ...
    def symbol_info(self, symbol): ...
    def symbol_select(self, symbol, selected): ...
    def symbol_info_tick(self, symbol): ...
    def positions_get(self, **filters): ...
    def send(self, request, symbol): ...


class AdapterFaults(StrictModel):
    delay_ms: int = Field(default=0, ge=0, le=1000)
    fail_read: bool = False
    fail_before_send: bool = False
    fail_after_fill: bool = False
    invalid_receipt: bool = False


class AdapterError(ValueError):
    """Only static error codes; never propagate arbitrary SDK messages or requests."""


def number(value, *, positive=False):
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e9:
        raise AdapterError('INVALID_NUMBER')
    if value < 0 or (positive and value <= 0):
        raise AdapterError('INVALID_NUMBER')
    return value


def persist_shared_hold(root,binding):
    """Latch the existing observer hold too, so older mock engines cannot bypass it."""
    path=Path(root)/'observer.sqlite3'
    with closing(sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1)) as db:
        db.execute('PRAGMA synchronous=FULL')
        witness=db.execute('SELECT binding,version FROM sdk_adapter_installation WHERE id=1').fetchone()
        if witness != (binding.digest(),1):
            raise AdapterError('HOLD_BINDING_UNVERIFIABLE')
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS ipc_transport_hold(id INTEGER PRIMARY KEY CHECK(id=1))')
            db.execute('INSERT OR IGNORE INTO ipc_transport_hold VALUES(1)')
            if db.execute('UPDATE ipc_state SET held=1 WHERE id=1').rowcount != 1:
                raise AdapterError('SHARED_HOLD_UNRECORDED')


class SyntheticSdkAdapter:
    def __init__(self, backend, binding, root, owner, *, faults=None, budget=.25):
        self.binding = Binding.model_validate(binding)
        self.root = check_simulation(root, self.binding)
        if type(backend) is not SimulatedBroker:
            raise AdapterError('SYNTHETIC_BACKEND_REQUIRED')
        if (type(owner) is not StateLease or owner.stream is None
                or owner.path != self.root / 'observer.sqlite3.owner'):
            raise AdapterError('JOURNAL_OWNERSHIP_REQUIRED')
        if type(budget) not in (int, float) or not .01 <= budget <= 1:
            raise AdapterError('BOUNDED_SDK_BUDGET_REQUIRED')
        self.backend, self.db, self.owner = backend, backend.db, owner
        files = self.db.execute('PRAGMA database_list').fetchall()
        if len(files) != 1 or Path(files[0][2]).resolve() != self.root / 'simulated-broker.sqlite3':
            raise AdapterError('SDK_JOURNAL_IDENTITY_MISMATCH')
        account = backend.account
        if (account.id, account.broker, account.login, account.server, account.role) != (
                self.binding.account, self.binding.broker, self.binding.login, self.binding.server, self.binding.role):
            raise AdapterError('SDK_ACCOUNT_MISMATCH')
        self.faults = AdapterFaults.model_validate(faults or {})
        self.budget, self.permit, self.deadline = budget, None, 0.
        self.db.execute('PRAGMA synchronous=FULL')
        existing = {r[0] for r in self.db.execute('SELECT name FROM sqlite_master WHERE type=\'table\'')} & TABLES
        if existing and existing != TABLES:
            raise AdapterError('INCOMPLETE_ADAPTER_JOURNAL')
        # Cross-file installation witness detects deleted SDK ledgers. Never rebuild
        # a previously installed adapter journal or guess from synthetic positions.
        witness = sqlite3.connect(self.root / 'observer.sqlite3', timeout=.1)
        try:
            witness.execute('PRAGMA synchronous=FULL')
            installed = witness.execute("SELECT 1 FROM sqlite_master WHERE name='sdk_adapter_installation'").fetchone()
            if installed:
                recorded = witness.execute('SELECT binding,version FROM sdk_adapter_installation WHERE id=1').fetchone()
                if recorded != (self.binding.digest(),1) or existing != TABLES:
                    raise AdapterError('ADAPTER_INSTALLATION_UNVERIFIABLE')
            else:
                if existing:
                    raise AdapterError('ADAPTER_INSTALLATION_UNVERIFIABLE')
                with witness:
                    witness.execute('CREATE TABLE sdk_adapter_installation(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL,version INTEGER NOT NULL)')
                    witness.execute('INSERT INTO sdk_adapter_installation VALUES(1,?,1)',[self.binding.digest()])
        finally:
            witness.close()
        if not existing:
            with self.db:
                self.db.execute('CREATE TABLE sdk_adapter_state(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL,version INTEGER NOT NULL,held INTEGER NOT NULL)')
                self.db.execute('INSERT INTO sdk_adapter_state VALUES(1,?,1,0)', [self.binding.digest()])
                self.db.execute('CREATE TABLE sdk_adapter_operations(operation TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,phase TEXT NOT NULL,receipt TEXT)')
                self.db.execute('CREATE TABLE sdk_adapter_audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,binding TEXT NOT NULL,operation TEXT,observed_ns INTEGER NOT NULL)')
        state = self.db.execute('SELECT binding,version,held FROM sdk_adapter_state WHERE id=1').fetchone()
        if not state or tuple(state[:2]) != (self.binding.digest(), 1) or state[2] not in (0, 1):
            raise AdapterError('ADAPTER_BINDING_MISMATCH')
        # Interrupted send/reply window is never inferred from fills or auto-replayed.
        if self.db.execute("SELECT 1 FROM sdk_adapter_operations WHERE phase<>'done' OR receipt IS NULL").fetchone():
            self._hold()
        self._audit('STARTED')
        self.account_info()

    def __getattr__(self, name):
        # Only immutable numeric constants required by synchronize, never arbitrary SDK methods.
        if name in {'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING', 'POSITION_TYPE_BUY', 'ORDER_TYPE_BUY',
                    'ORDER_TYPE_SELL', 'TRADE_ACTION_DEAL', 'TRADE_ACTION_SLTP', 'ORDER_TIME_GTC',
                    'TRADE_RETCODE_DONE', 'TRADE_RETCODE_DONE_PARTIAL'}:
            return getattr(SimulatedBroker, name)
        raise AttributeError(name)

    @property
    def held(self):
        try:
            row = self.db.execute('SELECT binding,held FROM sdk_adapter_state WHERE id=1').fetchone()
            return not row or row[0] != self.binding.digest() or row[1] != 0
        except Exception:
            return True

    def _hold(self):
        try:
            with self.db:
                self.db.execute('UPDATE sdk_adapter_state SET held=1 WHERE id=1')
            persist_shared_hold(self.root,self.binding)
        except Exception:
            pass  # Missing/unreadable state is held; observer/IPC intents remain independent.

    def _audit(self, event, operation=None):
        if event not in {'STARTED','INTENT','COMPLETED','DUPLICATE','HELD','REJECTED'}:
            raise AdapterError('INVALID_AUDIT_EVENT')
        try:
            with self.db:
                if self.db.execute('SELECT count(*) FROM sdk_adapter_audit').fetchone()[0] >= 10000:
                    raise AdapterError('ADAPTER_AUDIT_FULL')
                self.db.execute('INSERT INTO sdk_adapter_audit(event,binding,operation,observed_ns) VALUES(?,?,?,?)',
                                [event,self.binding.digest(),operation,time.time_ns()])
        except Exception:
            self._hold()
            raise AdapterError('ADAPTER_AUDIT_FAILED') from None

    def _symbol(self, symbol):
        if type(symbol) is not str or symbol not in SYMBOLS:
            raise AdapterError('SYMBOL_NOT_APPROVED')
        return symbol

    def _read(self, method, *args, **kwargs):
        started = time.monotonic()
        try:
            if self.faults.fail_read:
                raise AdapterError('SYNTHETIC_READ_FAILED')
            value = getattr(self.backend, method)(*args, **kwargs)
            if time.monotonic() - started >= self.budget:
                raise AdapterError('SDK_READ_TIMEOUT')
            return value
        except Exception:
            self._hold()
            raise AdapterError('SDK_READ_FAILED') from None

    def account_info(self):
        account = self.backend.account
        if type(account.delay_ms) not in (int,float) or account.delay_ms != 0 or account.disconnected:
            self._hold()
            raise AdapterError('UNSUPPORTED_SYNTHETIC_RUNTIME')
        if (account.id,account.broker,account.login,account.server,account.role) != (
                self.binding.account,self.binding.broker,self.binding.login,self.binding.server,self.binding.role):
            self._hold()
            raise AdapterError('SDK_ACCOUNT_MISMATCH')
        info = self._read('account_info')
        if (info is None or type(info.login) is not int or info.login != self.binding.login
                or type(info.server) is not str or info.server != self.binding.server
                or type(info.trade_mode) is not int or info.trade_mode != 0
                or type(info.margin_mode) is not int or info.margin_mode != 2):
            self._hold()
            raise AdapterError('SDK_ACCOUNT_MISMATCH')
        try:
            number(info.equity, positive=True)
        except Exception:
            self._hold()
            raise AdapterError('INVALID_ACCOUNT_EQUITY') from None
        return info

    def symbol_info(self, symbol):
        symbol = self._symbol(symbol)
        info = self._read('symbol_info', symbol)
        try:
            for key in ('volume_step','volume_min','volume_max','point'):
                number(getattr(info,key), positive=True)
            if (info.volume_min > info.volume_max or info.volume_step > info.volume_min
                    or Decimal(str(info.volume_min)) % Decimal(str(info.volume_step))
                    or Decimal(str(info.volume_max)) % Decimal(str(info.volume_step))):
                raise AdapterError('INVALID_VOLUME_CONSTRAINTS')
        except Exception:
            self._hold()
            raise AdapterError('INVALID_SYMBOL_INFO') from None
        return info

    def symbol_select(self, symbol, selected):
        self._symbol(symbol)
        if selected is not True or self._read('symbol_select',symbol,True) is not True:
            self._hold()
            raise AdapterError('SYMBOL_SELECTION_FAILED')
        return True

    def symbol_info_tick(self, symbol):
        self._symbol(symbol)
        tick = self._read('symbol_info_tick', symbol)
        try:
            number(tick.bid, positive=True);number(tick.ask, positive=True)
            if tick.ask < tick.bid:
                raise AdapterError('INVALID_QUOTE')
        except Exception:
            self._hold()
            raise AdapterError('INVALID_QUOTE') from None
        return tick

    def positions_get(self, **filters):
        if set(filters) - {'symbol'}:
            raise AdapterError('UNSUPPORTED_POSITION_FILTER')
        if 'symbol' in filters:
            self._symbol(filters['symbol'])
        rows = self._read('positions_get', **filters)
        try:
            if type(rows) is not tuple or len(rows) > 10000:
                raise AdapterError('INVALID_POSITION_SNAPSHOT')
            tickets = set()
            for row in rows:
                if (type(row.ticket) is not int or row.ticket <= 0 or row.ticket in tickets
                        or type(row.magic) is not int or not 0 < row.magic < 2**31
                        or type(row.type) is not int or row.type not in (0,1)):
                    raise AdapterError('INVALID_POSITION_SNAPSHOT')
                tickets.add(row.ticket);self._symbol(row.symbol)
                if filters and row.symbol != filters['symbol']:
                    raise AdapterError('POSITION_SYMBOL_MISMATCH')
                number(row.volume,positive=True);number(row.sl);number(row.tp)
                if Decimal(str(row.volume)) % Decimal(str(self.symbol_info(row.symbol).volume_step)):
                    raise AdapterError('INVALID_POSITION_VOLUME')
        except Exception:
            self._hold()
            raise AdapterError('INVALID_POSITION_SNAPSHOT') from None
        return rows

    @contextmanager
    def operation_scope(self, permit, deadline):
        if self.permit is not None or not callable(permit) or not math.isfinite(deadline):
            raise AdapterError('PRIVATE_OPERATION_SCOPE_REQUIRED')
        self.permit, self.deadline = permit, min(deadline,time.monotonic()+self.budget)
        try:
            yield
        finally:
            self.permit, self.deadline = None, 0.

    def _gate(self):
        if (self.owner.stream is None or self.owner.stream.closed or self.permit is None or self.held
                or time.monotonic() >= self.deadline or self.permit() is not True):
            raise AdapterError('SDK_EXECUTION_GATE_CLOSED')
        self.account_info()
        if time.monotonic() >= self.deadline or self.permit() is not True:
            raise AdapterError('SDK_EXECUTION_GATE_CLOSED')

    def _request(self, request, symbol):
        self._symbol(symbol)
        if type(request) is not dict:
            raise AdapterError('STRICT_ORDER_REQUIRED')
        common = {'action','symbol','magic','deviation','comment','type_time'}
        action = request.get('action')
        if type(action) is not int or action not in (1,6) or request.get('symbol') != symbol:
            raise AdapterError('UNSUPPORTED_ORDER_ACTION')
        expected = common | ({'position','sl','tp'} if action==6 else
                             {'position','volume','type','price'} if 'position' in request else
                             {'volume','type','price','sl','tp'})
        if set(request) != expected:
            raise AdapterError('STRICT_ORDER_FIELDS_REQUIRED')
        if (type(request['magic']) is not int or not 0 < request['magic'] < 2**31
                or type(request['deviation']) is not int or request['deviation'] != 20
                or type(request['type_time']) is not int or request['type_time'] != 0
                or type(request['comment']) is not str or not re.fullmatch(r'EC:[a-f0-9]{28}',request['comment'])):
            raise AdapterError('INVALID_ORDER_IDENTITY')
        if 'position' in request and (type(request['position']) is not int or request['position'] <= 0):
            raise AdapterError('INVALID_POSITION_ID')
        for key in ('sl','tp','volume','price'):
            if key in request:number(request[key],positive=key in ('volume','price'))
        if action==1:
            if type(request['type']) is not int or request['type'] not in (0,1):
                raise AdapterError('INVALID_ORDER_SIDE')
            info=self.symbol_info(symbol);volume=Decimal(str(request['volume']))
            if not Decimal(str(info.volume_min)) <= volume <= Decimal(str(info.volume_max)) or volume % Decimal(str(info.volume_step)):
                raise AdapterError('INVALID_ORDER_VOLUME')
        return dict(request)

    def _lifecycle(self, request, symbol):
        if 'position' in request:
            rows=[p for p in self.positions_get(symbol=symbol) if p.ticket==request['position']]
            if len(rows)!=1 or rows[0].magic!=request['magic']:
                raise AdapterError('POSITION_OWNERSHIP_MISMATCH')
            position=rows[0]
            if request['action']==1 and (request['type']==position.type or request['volume']>position.volume+1e-9):
                raise AdapterError('INVALID_CLOSE')
            side=position.type
        else:side=request['type']
        if 'sl' in request:
            tick=self.symbol_info_tick(symbol);price=tick.ask if side==0 else tick.bid
            sl,tp=request['sl'],request['tp']
            if ((sl and (sl>=price if side==0 else sl<=price)) or (tp and (tp<=price if side==0 else tp>=price))):
                raise AdapterError('INVALID_PROTECTIVE_LEVELS')

    def _receipt(self, receipt, request):
        if receipt is None or type(receipt.retcode) is not int or receipt.retcode != 10009:
            raise AdapterError('INVALID_SDK_RECEIPT')
        for key in ('order','deal'):
            if type(getattr(receipt,key,None)) is not int or getattr(receipt,key)<=0:
                raise AdapterError('INVALID_SDK_RECEIPT')
        if number(receipt.volume) != request.get('volume',0):
            raise AdapterError('INVALID_SDK_RECEIPT')
        return dict(retcode=receipt.retcode,order=receipt.order,deal=receipt.deal,volume=receipt.volume)

    def send(self, request, symbol):
        operation = None
        try:
            self._gate()
            request=self._request(request,symbol)
            operation=hashlib.sha256((self.binding.digest()+request['comment']).encode()).hexdigest()
            fingerprint=hashlib.sha256(canonical(request)).hexdigest()
            prior=self.db.execute('SELECT fingerprint,phase,receipt FROM sdk_adapter_operations WHERE operation=?',[operation]).fetchone()
            if prior:
                if prior[0]!=fingerprint or prior[1]!='done':
                    raise AdapterError('ADAPTER_IDEMPOTENCY_CONFLICT')
                data=json.loads(prior[2])
                receipt=self._receipt(NS(**data),request)
                self._audit('DUPLICATE',operation)
                return NS(**receipt)
            self._lifecycle(request,symbol)
            with self.db:
                self.db.execute("INSERT INTO sdk_adapter_operations VALUES(?,?,'processing',NULL)",[operation,fingerprint])
            self._audit('INTENT',operation)
            delay=self.faults.delay_ms/1000
            remaining=max(0,self.deadline-time.monotonic())
            time.sleep(min(delay,remaining))
            self._gate()  # Recheck stop, fence, account and deadline after synthetic delay.
            if self.faults.fail_before_send or self.backend.account.delay_ms/1000 >= self.deadline-time.monotonic():
                raise AdapterError('SYNTHETIC_SDK_FAILURE')
            receipt=self.backend.send(request,symbol)
            self._gate()
            if self.faults.fail_after_fill or self.faults.invalid_receipt:
                raise AdapterError('SYNTHETIC_RECEIPT_UNAVAILABLE')
            data=self._receipt(receipt,request)
            with self.db:
                self.db.execute("UPDATE sdk_adapter_operations SET phase='done',receipt=? WHERE operation=?",[canonical(data).decode(),operation])
            self._audit('COMPLETED',operation)
            return NS(**data)
        except Exception:
            self._hold()
            try:self._audit('HELD',operation)
            except Exception:pass
            raise AdapterError('SYNTHETIC_ADAPTER_HELD') from None


class AdapterEngine(CandidateEngine):
    """Reuse the existing authenticated engine, with one hardcoded synthetic adapter."""
    def __init__(self,root,binding,key,*,adapter_faults=None,**kwargs):
        # Before the legacy mock constructor could create a missing data file,
        # honor an existing adapter installation witness in the original journal.
        root = check_simulation(root,binding)
        observer = root / 'observer.sqlite3'
        if (root/'simulated-broker.sqlite3').exists() and not observer.exists():
            with closing(sqlite3.connect((root/'simulated-broker.sqlite3').as_uri()+'?mode=ro',uri=True,timeout=.1)) as db:
                if any(db.execute("SELECT 1 FROM sqlite_master WHERE name=?",[name]).fetchone() for name in TABLES):
                    raise AdapterError('OBSERVER_INSTALLATION_WITNESS_MISSING')
        if observer.exists():
            with closing(sqlite3.connect(observer.as_uri()+'?mode=ro',uri=True,timeout=.1)) as db:
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='sdk_adapter_installation'").fetchone():
                    if not (root/'simulated-broker.sqlite3').is_file():
                        raise AdapterError('SDK_JOURNAL_MISSING')
        super().__init__(root,binding,key,**kwargs)
        try:
            self.sdk=SyntheticSdkAdapter(self.sdk,self.binding,self.root,self.owner,faults=adapter_faults)
        except Exception:
            try:persist_shared_hold(self.root,self.binding)
            except Exception:pass
            self.close()
            raise

    def _held(self):
        return super()._held() or (isinstance(self.sdk,SyntheticSdkAdapter) and self.sdk.held)

    def _sync(self,request,target):
        deadline=time.monotonic()+min((request.deadline_ms-self.clock())/1000,self.deadline-self.monotonic())
        permit=lambda: not self._stopped() and self._valid_lease(request) and self.clock()<request.deadline_ms
        with self.sdk.operation_scope(permit,deadline):
            return super()._sync(request,target)
