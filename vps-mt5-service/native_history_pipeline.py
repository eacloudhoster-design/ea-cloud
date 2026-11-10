"""Explicit history protocol in the existing guarded simulation subprocess.

Linux reference acceptance only. No sockets, vendor loading or SDK execution.
The native Windows port of the shared authority remains deliberately blocked.
"""
from contextlib import closing
import os
from pathlib import Path
import sys
import sqlite3
import secrets
import hashlib
import re
import time
from typing import Literal

from pydantic import Field, model_validator, field_validator
from private_ipc import (Binding, Envelope, Response, StrictModel, ProtocolError,
                         canonical, sign, verify, result)
from native_windows_candidate import NativeWindowsSimulation
from shared_lease_simulation import SharedEnvelope, SharedResponse, private, touch_private
from history_authority_simulation import HistoryAuthority, prepare_history_authority
from synthetic_trade_history import HistoryBook, COMMAND, Reconcile, units, LIMIT
from sdk_ipc_candidate import prepare_simulation, SimulationFaults


class ExecutionReceipt(StrictModel):
    order_id: str = Field(pattern=r'^[a-f0-9]{28}$')
    state: Literal['active','filled','cancelled']
    requested_volume: float = Field(gt=0,le=10)
    executed_volume: float = Field(ge=0,le=10)
    remaining_volume: float = Field(ge=0,le=10)
    active_remaining_volume: float = Field(ge=0,le=10)
    cancelled_volume: float = Field(ge=0,le=10)

    @model_validator(mode='after')
    def balanced(self):
        def quantity(value):
            return units(value) if value else 0
        requested,executed,remaining,active,cancelled=map(quantity,(self.requested_volume,self.executed_volume,
            self.remaining_volume,self.active_remaining_volume,self.cancelled_volume))
        if requested!=executed+remaining or active!=(remaining if self.state=='active' else 0) or cancelled!=(remaining if self.state=='cancelled' else 0):
            raise ValueError('Receipt volume mismatch')
        if (self.state=='filled') != (remaining==0):raise ValueError('Receipt state mismatch')
        return self


class HistoryCertificate(StrictModel):
    sequence: int = Field(ge=0,le=LIMIT)
    history_digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    orders: int = Field(ge=0,le=LIMIT)
    deals: int = Field(ge=0,le=LIMIT)
    positions: int = Field(ge=0,le=10)
    automatic_retry_allowed: Literal[False]
    hold_required: bool

    @field_validator('automatic_retry_allowed',mode='before')
    @classmethod
    def explicit_no_retry(cls,value):
        if value is not False:raise ValueError('Explicit false required')
        return value


def validate_history_success(request,outcome):
    command=COMMAND.validate_python(request.body)
    code='HISTORY_VERIFIED' if isinstance(command,Reconcile) else 'SIMULATED_HISTORY_APPLIED'
    if outcome['code']!=code or outcome['uncertain']:raise ProtocolError('INVALID_HISTORY_RESPONSE')
    if isinstance(command,Reconcile):HistoryCertificate.model_validate(outcome['data'])
    else:
        receipt=ExecutionReceipt.model_validate(outcome['data'])
        if receipt.order_id!=command.order_id:raise ProtocolError('HISTORY_ORDER_MISMATCH')
        if command.action in ('create','modify') and receipt.requested_volume!=command.volume:
            raise ProtocolError('HISTORY_VOLUME_MISMATCH')
        if command.action=='cancel' and receipt.state!='cancelled':raise ProtocolError('HISTORY_STATE_MISMATCH')


def prepare_history_worker(root,binding,key):
    """Operator fixture provisioning only; existing data is never adopted."""
    if sys.platform!='linux':raise ValueError('Linux reference fixture required')
    binding=Binding.model_validate(binding)
    if type(key) is not bytes or len(key)!=32:raise ValueError('32-byte account key required')
    root=Path(root).absolute();prepare_simulation(root,binding)
    prepare_history_authority(root/'history-authority')
    authority=HistoryAuthority(root/'history-authority',stop_checker=lambda _:True)
    try:authority.register(binding,key)
    finally:authority.close()
    audit=root/'history-pipeline.sqlite3';touch_private(audit)
    with closing(sqlite3.connect(audit)) as db:
        db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE events(id INTEGER PRIMARY KEY,kind TEXT,request_id TEXT,controller_ref TEXT,operation TEXT,code TEXT,pid INTEGER)')
        db.execute('CREATE TABLE metadata(binding TEXT PRIMARY KEY,started INTEGER NOT NULL)')
        with db:db.execute('INSERT INTO metadata VALUES(?,0)',[binding.digest()])
    marker=root/'history-worker.json';touch_private(marker)
    with marker.open('wb') as stream:
        stream.write(canonical(dict(binding=binding.digest(),protocol='trade-history')))
        stream.flush();os.fsync(stream.fileno())


class HistoryWorkerEngine:
    """One immutable bootstrap account, original signed Envelope on stdio.

    Shared frames are derived only after outer authentication; neither host nor
    service identity is supplied by an untrusted request body.
    """
    authority_type=HistoryAuthority

    def __init__(self,root,binding,key,*,stop_checker,faults=None):
        self.binding=Binding.model_validate(binding);self.key=key
        self.faults=SimulationFaults.model_validate(faults or {})
        self.checker=stop_checker
        self.authority=self.authority_type(Path(root)/'history-authority',stop_checker=lambda _:stop_checker())
        try:self.authority.register(self.binding,key)
        except Exception:self.authority.close();raise

    def _stopped(self):return self.authority._stopped(self.binding.digest())
    def _held(self):return bool(self.authority._row(self.binding.digest())['held'])

    def handle(self,frame):
        request=Envelope.model_validate(verify(frame,self.key))
        if request.binding!=self.binding.digest():
            outcome=result('IDENTITY_MISMATCH')
        else:
            if self.faults.before_send_ms and request.operation=='sync':
                time.sleep(self.faults.before_send_ms/1000)
            shared=SharedEnvelope(**request.model_dump(),service=self.authority.service,host='native-history-worker')
            reply=SharedResponse.model_validate(verify(self.authority.handle(sign(shared.model_dump(),self.key)),self.key,'response'))
            for field in ('service','host','binding','controller','request_id','nonce'):
                if getattr(shared,field)!=getattr(reply,field):raise ProtocolError('HISTORY_RESPONSE_MISMATCH')
            outcome=reply.result.model_dump()
            if outcome['success'] and request.operation=='status':
                outcome['data'].pop('epoch')  # Preserve the original strict Status contract.
            if (self.faults.crash_after_fill and request.operation=='sync' and
                request.body.get('action')=='fill' and outcome['success']):
                os._exit(70)  # Test-only crash after the durable book/authority commit.
        return sign(dict(binding=request.binding,controller=request.controller,request_id=request.request_id,
                         nonce=request.nonce,result=outcome),self.key,'response')

    def close(self):self.authority.close()


class HistoryWorkerSimulation(NativeWindowsSimulation):
    protocol='trade-history'

    def __init__(self,*args,**kwargs):
        if sys.platform!='linux' or kwargs.get('_reference') is not True:
            raise ValueError('History worker requires explicit Linux reference; native Windows acceptance blocked')
        root=Path(args[0] if args else kwargs['root'])
        if (root/'wine-history-fixture.json').exists():raise ValueError('Wine-only history fixture')
        super().__init__(*args,**kwargs)

    def _begin(self):
        super()._begin()
        path=self.root/'history-pipeline.sqlite3';private(path)
        with closing(sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1)) as db:
            db.execute('PRAGMA synchronous=FULL')
            with db:
                if db.execute('UPDATE metadata SET started=1 WHERE binding=?',[self.binding.digest()]).rowcount!=1:
                    raise ValueError('History lifecycle witness missing')

    def _pipeline_audit(self,kind,rid,operation,code=None):
        path=self.root/'history-pipeline.sqlite3';private(path)
        with closing(sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1)) as db:
            db.execute('PRAGMA synchronous=FULL')
            if db.execute('SELECT count(*) FROM events').fetchone()[0]>=10000:
                raise ValueError('Pipeline audit capacity')
            with db:db.execute('INSERT INTO events(kind,request_id,controller_ref,operation,code,pid) VALUES(?,?,?,?,?,?)',
                [kind,rid,hashlib.sha256(self.controller.encode()).hexdigest(),operation,code,self.child.pid])

    def request(self,operation,body=None,*,request_id=None):
        rid=request_id or secrets.token_hex(16)
        if type(rid) is not str or not re.fullmatch('[a-f0-9]{32}',rid) or operation not in ('acquire','renew','status','sync'):
            raise ValueError('Invalid pipeline request metadata')
        with self.lock:
            if self.closed or self.failed:return result('UNAVAILABLE',uncertain=True)
            try:
                self._pipeline_audit('REQUEST',rid,operation)
                outcome=super().request(operation,body,request_id=rid)
                self._pipeline_audit('RESULT',rid,operation,outcome['code'])
                return outcome
            except Exception:
                self.failed=True;self._hold();self._stop()
                return result('PIPELINE_AUDIT_HELD',uncertain=True)

    def _validate_success(self,request,outcome):
        if request.operation!='sync':return super()._validate_success(request,outcome)
        validate_history_success(request,outcome)

    def _persist_transport_hold(self):
        if not self._hold() or not self.quiesced:raise ValueError('History lifecycle hold unconfirmed')
        authority=HistoryAuthority(self.root/'history-authority',stop_checker=lambda _:True)
        try:
            authority.register(self.binding,self.key)
            authority._latch(self.binding.digest())
            if not authority._row(self.binding.digest())['held']:raise ValueError('Shared hold unrecorded')
        finally:authority.close()
        self._audit('HELD')
