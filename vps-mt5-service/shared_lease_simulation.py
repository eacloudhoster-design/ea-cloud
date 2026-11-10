"""Offline single-authority/gateway simulation of cross-host controller fencing.

No sockets, vendor SDK or production service. Hosts are signed simulated clients;
all mock account effects stay at one serialized, durable execution gateway.
"""
from contextlib import closing
from contextvars import ContextVar
import hashlib
import json
import os
import re
from pathlib import Path
import secrets
import sqlite3
import sys
import threading
import time

from pydantic import Field
from private_ipc import (Binding, Envelope, Response, LeaseGrant, SyncTarget, SyncReceipt, Result, canonical,
                         sign, verify, result, _unique, MAX_FRAME)
from framed_stdio import fixture_stop_active
from sdk_adapter_candidate import AdapterEngine, persist_shared_hold
from sdk_ipc_candidate import prepare_simulation, check_simulation, wall_ms, SimulationFaults
from worker_state import StateLease
from windows_simulation_security import LinuxReferenceInspector

_wine_private = ContextVar('isolated_wine_private', default=None)

TTL_MS = 2000
MAX_ROWS = 10000


class AuthorityError(ValueError):
    pass


class SharedEnvelope(Envelope):
    service: str = Field(pattern=r'^[a-f0-9]{32}$')
    host: str = Field(pattern=r'^[a-z][a-z0-9-]{0,47}$')


class SharedResponse(Response):
    service: str = Field(pattern=r'^[a-f0-9]{32}$')
    host: str = Field(pattern=r'^[a-z][a-z0-9-]{0,47}$')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def private(path):
    if sys.platform=='win32' and _wine_private.get() is not None:
        from wine_history_paths import WineMappedInspector
        inspector=_wine_private.get()
        if type(inspector) is not WineMappedInspector:raise AuthorityError('INVALID_WINE_INSPECTOR')
        return inspector.check(path)
    if sys.platform != 'linux' or os.geteuid() == 0:
        raise AuthorityError('ORDINARY_USER_LINUX_SIMULATION_REQUIRED')
    return LinuxReferenceInspector().check(path)


def touch_private(path):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)


def prepare_authority(root):
    """Explicit new empty development fixture only; never adopts/rebuilds state."""
    root = Path(root).absolute()
    root.mkdir(mode=0o700, parents=False, exist_ok=True)
    private(root)
    if any(root.iterdir()):
        raise AuthorityError('EMPTY_AUTHORITY_FIXTURE_REQUIRED')
    service = secrets.token_hex(16)
    path = root / 'authority.sqlite3'
    touch_private(path)
    with closing(sqlite3.connect(path)) as db:
        db.execute('PRAGMA synchronous=FULL')
        db.executescript('''CREATE TABLE metadata(service TEXT PRIMARY KEY,version INTEGER NOT NULL);
            CREATE TABLE accounts(binding TEXT PRIMARY KEY,descriptor TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,
                broker TEXT NOT NULL,login INTEGER NOT NULL,server TEXT NOT NULL,epoch INTEGER NOT NULL,
                host TEXT NOT NULL,controller TEXT NOT NULL,token_hash TEXT NOT NULL,expires INTEGER NOT NULL,
                highwater INTEGER NOT NULL,held INTEGER NOT NULL,UNIQUE(broker,login,server));
            CREATE TABLE nonces(binding TEXT NOT NULL,nonce TEXT NOT NULL,PRIMARY KEY(binding,nonce));
            CREATE TABLE commands(binding TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,
                phase TEXT NOT NULL,response TEXT,PRIMARY KEY(binding,id));
            CREATE TABLE audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,binding TEXT NOT NULL,
                host_ref TEXT,controller_ref TEXT,epoch INTEGER NOT NULL,observed_ms INTEGER NOT NULL);''')
        with db:db.execute('INSERT INTO metadata VALUES(?,1)', [service])
    marker = root / 'simulation-authority.json'
    touch_private(marker)
    with marker.open('wb') as stream:
        stream.write(canonical(dict(simulation=True,service=service)))
        stream.flush();os.fsync(stream.fileno())
    (root/'accounts').mkdir(mode=0o700)
    return service


class FencedEngine(AdapterEngine):
    def __init__(self,*args,shared_permit,**kwargs):
        self.shared_permit=shared_permit
        super().__init__(*args,**kwargs)

    def _valid_lease(self,request):
        return super()._valid_lease(request) and self.shared_permit() is True


class SharedAuthority:
    history_protocol = False

    def __init__(self,root,*,clock=wall_ms,monotonic=time.monotonic,stop_checker=None,worker_faults=None):
        self.root=Path(root).absolute();private(self.root)
        if os.path.lexists(self.root/'history-mode.json') != self.history_protocol:
            raise AuthorityError('AUTHORITY_PROTOCOL_MISMATCH')
        marker=self.root/'simulation-authority.json';private(marker)
        if marker.stat().st_size>1024:raise AuthorityError('INVALID_AUTHORITY_MARKER')
        data=json.loads(marker.read_bytes(),object_pairs_hook=_unique)
        if (set(data)!={'simulation','service'} or data['simulation'] is not True
                or type(data['service']) is not str or not re.fullmatch(r'[a-f0-9]{32}',data['service'])):
            raise AuthorityError('INVALID_AUTHORITY_MARKER')
        self.service=data['service'];self.clock=clock;self.monotonic=monotonic
        self.stop_checker=stop_checker;self.worker_faults=SimulationFaults.model_validate(worker_faults or {})
        self.lock=threading.RLock();self.keys={};self.deadlines={};self.available=True;self.closed=False
        self.owner=StateLease(self.root/'shared-authority');self.owner.acquire();self.db=None
        try:
            path=self.root/'authority.sqlite3';private(path)
            self.db=sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1,check_same_thread=False)
            self.db.row_factory=sqlite3.Row;self.db.execute('PRAGMA synchronous=FULL')
            meta=self.db.execute('SELECT service,version FROM metadata').fetchall()
            if len(meta)!=1 or tuple(meta[0])!=(self.service,1):raise AuthorityError('AUTHORITY_IDENTITY_MISMATCH')
            history_schema=bool(self.db.execute("SELECT 1 FROM sqlite_master WHERE name='history_installations'").fetchone())
            if history_schema != self.history_protocol:raise AuthorityError('AUTHORITY_PROTOCOL_MISMATCH')
            # Server restart never carries a live grant into a new monotonic clock domain.
            with self.db:
                for row in self.db.execute('SELECT * FROM accounts').fetchall():
                    row=self._row(row['binding'])
                    if row['epoch']>=2**63-2:raise AuthorityError('FENCE_CAPACITY_EXHAUSTED')
                    pending=self.db.execute("SELECT 1 FROM commands WHERE binding=? AND (phase<>'done' OR response IS NULL)",[row['binding']]).fetchone()
                    self.db.execute("UPDATE accounts SET epoch=epoch+1,host='',controller='',token_hash='',expires=0,held=MAX(held,?) WHERE binding=?",[bool(pending),row['binding']])
                    self._audit('RESTART_FENCED',row['binding'],row['epoch']+1)
        except Exception:
            if self.db:self.db.close()
            self.owner.close();self.closed=True
            raise

    def account_root(self,binding):
        return self.root/'accounts'/Binding.model_validate(binding).digest()

    def register(self,binding,key):
        """Operator-only explicit fixture provisioning; not an RPC or host action."""
        binding=Binding.model_validate(binding)
        if type(key) is not bytes or len(key)!=32:raise AuthorityError('STRONG_ACCOUNT_KEY_REQUIRED')
        with self.lock:
            self._online()
            row=self.db.execute('SELECT * FROM accounts WHERE binding=?',[binding.digest()]).fetchone()
            account_root=self.account_root(binding)
            if row:
                if row['descriptor']!=canonical(binding.model_dump()).decode() or row['key_hash']!=hashlib.sha256(key).hexdigest():
                    raise AuthorityError('ACCOUNT_CAPABILITY_MISMATCH')
                private(account_root);check_simulation(account_root,binding);self._witness_info(binding)
                for name in ('observer.sqlite3','simulated-broker.sqlite3'):private(account_root/name)
            else:
                if self.db.execute('SELECT 1 FROM accounts WHERE key_hash=?',[hashlib.sha256(key).hexdigest()]).fetchone():
                    raise AuthorityError('ACCOUNT_CAPABILITY_ALREADY_BOUND')
                if self.db.execute('SELECT 1 FROM accounts WHERE broker=? AND login=? AND server=?',
                                   [binding.broker,binding.login,binding.server]).fetchone():
                    raise AuthorityError('PHYSICAL_ACCOUNT_ALREADY_BOUND')
                prepare_simulation(account_root,binding)
                for name in ('observer.sqlite3','simulated-broker.sqlite3'):touch_private(account_root/name)
                witness=account_root/'shared-fence.sqlite3';touch_private(witness)
                with closing(sqlite3.connect(witness)) as db:
                    db.execute('PRAGMA synchronous=FULL')
                    db.execute('CREATE TABLE fence(id INTEGER PRIMARY KEY CHECK(id=1),service TEXT NOT NULL,binding TEXT NOT NULL,epoch INTEGER NOT NULL,holder TEXT NOT NULL,token_hash TEXT NOT NULL)')
                    with db:db.execute("INSERT INTO fence VALUES(1,?,?,0,'','')",[self.service,binding.digest()])
                with self.db:
                    self.db.execute("INSERT INTO accounts VALUES(?,?,?,?,?,?,0,'','','',0,0,0)",
                        [binding.digest(),canonical(binding.model_dump()).decode(),hashlib.sha256(key).hexdigest(),binding.broker,binding.login,binding.server])
                    self._audit('REGISTERED',binding.digest(),0)
            self.keys[binding.digest()]=key

    def _online(self):
        if self.closed or self.available is not True:raise AuthorityError('AUTHORITY_UNAVAILABLE')

    def _row(self,binding):
        row=self.db.execute('SELECT * FROM accounts WHERE binding=?',[binding]).fetchone()
        if row is None:raise AuthorityError('ACCOUNT_NOT_REGISTERED')
        try:
            profile=Binding.model_validate_json(row['descriptor'])
            if profile.digest()!=binding or (profile.broker,profile.login,profile.server)!=(row['broker'],row['login'],row['server']):
                raise ValueError('Registry mismatch')
        except Exception:raise AuthorityError('ACCOUNT_REGISTRY_INVALID') from None
        if (any(type(row[name]) is not int or not 0<=row[name]<2**63 for name in ('epoch','expires','highwater'))
                or type(row['held']) is not int or row['held'] not in (0,1)):
            raise AuthorityError('LEASE_STATE_INVALID')
        return row

    def _now(self,binding):
        self._online();now=self.clock();row=self._row(binding)
        if type(now) is not int or now<=0:raise AuthorityError('AUTHORITY_CLOCK_INVALID')
        if now<row['highwater']:
            self._latch(binding)
            raise AuthorityError('AUTHORITY_CLOCK_REVERSED')
        if now>row['highwater']:
            with self.db:self.db.execute('UPDATE accounts SET highwater=? WHERE binding=?',[now,binding])
        return now

    def _audit(self,event,binding,epoch,request=None):
        if event not in {'REGISTERED','RESTART_FENCED','CLAIMED','RENEWED','INTENT','COMPLETED','CACHED','HELD'}:
            raise AuthorityError('INVALID_AUTHORITY_AUDIT')
        if self.db.execute('SELECT count(*) FROM audit WHERE binding=?',[binding]).fetchone()[0]>=MAX_ROWS:
            raise AuthorityError('AUTHORITY_AUDIT_FULL')
        self.db.execute('INSERT INTO audit(event,binding,host_ref,controller_ref,epoch,observed_ms) VALUES(?,?,?,?,?,?)',
            [event,binding,digest(request.host) if request else None,digest(request.controller) if request else None,epoch,self.clock()])

    def _latch(self,binding):
        try:
            with self.db:self.db.execute('UPDATE accounts SET held=1 WHERE binding=?',[binding])
            row=self._row(binding);profile=Binding.model_validate_json(row['descriptor'])
            persist_shared_hold(self.account_root(profile),profile)
        except Exception:pass  # Unavailable state never authorizes; durable intent remains independent.

    def _stopped(self,binding):
        try:
            profile=Binding.model_validate_json(self._row(binding)['descriptor'])
            return (self.stop_checker(profile) is not False if self.stop_checker is not None
                    else fixture_stop_active(self.account_root(profile),profile))
        except Exception:return True

    def _valid(self,request):
        now=self._now(request.binding);row=self._row(request.binding)
        return (row['epoch']==request.epoch and row['host']==request.host and row['controller']==request.controller
                and now<row['expires'] and now<request.deadline_ms and self.monotonic()<self.deadlines.get(request.binding,0)
                and secrets.compare_digest(row['token_hash'],digest(request.lease_token)))

    def _witness_info(self,binding):
        path=self.account_root(binding)/'shared-fence.sqlite3';private(path)
        with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=.1)) as db:
            row=db.execute('SELECT service,binding,epoch,holder,token_hash FROM fence WHERE id=1').fetchone()
            if not row or row[:2]!=(self.service,binding.digest()) or type(row[2]) is not int or row[2]<0:
                raise AuthorityError('FENCE_WITNESS_UNAVAILABLE')
            return row

    def _fence(self,request):
        profile=Binding.model_validate_json(self._row(request.binding)['descriptor'])
        row=self._witness_info(profile);holder=digest(request.host+':'+request.controller)
        if request.epoch<row[2] or (request.epoch==row[2] and row[3:]!=(holder,digest(request.lease_token))):
            self._latch(request.binding);raise AuthorityError('STALE_AUTHORITY_FENCE')
        path=self.account_root(profile)/'shared-fence.sqlite3'
        with closing(sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1)) as db:
            db.execute('PRAGMA synchronous=FULL')
            with db:db.execute('UPDATE fence SET epoch=?,holder=?,token_hash=? WHERE id=1',
                               [request.epoch,holder,digest(request.lease_token)])

    def handle(self,frame):
        if not self.lock.acquire(timeout=.25):raise AuthorityError('AUTHORITY_BUSY')
        request=None
        try:
            self._online()
            if type(frame) is not bytes or len(frame)>MAX_FRAME:raise AuthorityError('INVALID_SHARED_FRAME')
            wire=json.loads(frame,object_pairs_hook=_unique)
            key=self.keys.get(wire.get('message',{}).get('binding'))
            if key is None:raise AuthorityError('ACCOUNT_NOT_REGISTERED')
            request=SharedEnvelope.model_validate(verify(frame,key))
            if request.service!=self.service:raise AuthorityError('AUTHORITY_IDENTITY_MISMATCH')
            now=self._now(request.binding);request.validate_time(now)
            if request.operation=='sync':
                self._validate_sync(request)
            elif request.body:raise AuthorityError('INVALID_BODY')
            if self.db.execute('SELECT 1 FROM nonces WHERE binding=? AND nonce=?',[request.binding,request.nonce]).fetchone():
                raise AuthorityError('REPLAY')
            if self.db.execute('SELECT count(*) FROM nonces WHERE binding=?',[request.binding]).fetchone()[0]>=MAX_ROWS:raise AuthorityError('REPLAY_STORAGE_FULL')
            with self.db:self.db.execute('INSERT INTO nonces VALUES(?,?)',[request.binding,request.nonce])
            outcome=self._dispatch(request)
        except Exception as error:
            if request is None:raise AuthorityError('UNAUTHENTICATED_SHARED_REQUEST') from None
            self.db.rollback()
            code=str(error) if isinstance(error,AuthorityError) else 'AUTHORITY_UNAVAILABLE'
            outcome=result(code,uncertain=code in {'AUTHORITY_UNAVAILABLE','AUTHORITY_BUSY'})
        finally:
            self.lock.release()
        return sign(dict(service=self.service,host=request.host,binding=request.binding,controller=request.controller,
                         request_id=request.request_id,nonce=request.nonce,result=outcome),self.keys[request.binding],'response')

    def _validate_sync(self,request):
        if 'password' in request.body:raise AuthorityError('INVALID_BODY')
        target=SyncTarget.model_validate(request.body)
        profile=Binding.model_validate_json(self._row(request.binding)['descriptor'])
        if (target.login,target.server)!=(profile.login,profile.server):raise AuthorityError('IDENTITY_MISMATCH')

    def _dispatch(self,request):
        row=self._row(request.binding);now=self._now(request.binding)
        if request.operation=='acquire':
            if request.epoch or request.lease_token:raise AuthorityError('LEASE_INVALID')
            if now<row['expires']:raise AuthorityError('OWNER_CONFLICT')
            profile=Binding.model_validate_json(row['descriptor']);witness=self._witness_info(profile)
            if row['epoch']>=2**63-2 or row['epoch']+1<=witness[2]:
                self._latch(request.binding);raise AuthorityError('STALE_AUTHORITY_FENCE')
            token=secrets.token_hex(32);epoch=row['epoch']+1;expires=now+TTL_MS
            with self.db:
                self.db.execute('UPDATE accounts SET epoch=?,host=?,controller=?,token_hash=?,expires=? WHERE binding=?',
                                [epoch,request.host,request.controller,digest(token),expires,request.binding])
                self._audit('CLAIMED',request.binding,epoch,request)
            self.deadlines[request.binding]=self.monotonic()+TTL_MS/1000
            return result('LEASED',True,data=dict(epoch=epoch,lease_token=token,expires_ms=expires))
        if not self._valid(request):raise AuthorityError('LEASE_INVALID')
        if request.operation=='renew':
            expires=now+TTL_MS
            with self.db:
                self.db.execute('UPDATE accounts SET expires=? WHERE binding=?',[expires,request.binding])
                self._audit('RENEWED',request.binding,request.epoch,request)
            self.deadlines[request.binding]=self.monotonic()+TTL_MS/1000
            return result('RENEWED',True,data=dict(expires_ms=expires))
        if request.operation=='status':
            return result('STATUS',True,data=dict(held=bool(row['held']),stopped=self._stopped(request.binding),epoch=row['epoch']))
        return self._execute(request)

    def _verify_cached_account(self,request,cached):
        """Read-only receipt preflight; never initializes or repairs a journal."""
        profile=Binding.model_validate_json(self._row(request.binding)['descriptor'])
        root=self.account_root(profile);private(root);check_simulation(root,profile)
        paths=[root/name for name in ('observer.sqlite3','simulated-broker.sqlite3')]
        for path in paths:private(path)
        with closing(sqlite3.connect(paths[0].as_uri()+'?mode=ro',uri=True,timeout=.1)) as observer, \
             closing(sqlite3.connect(paths[1].as_uri()+'?mode=ro',uri=True,timeout=.1)) as sdk:
            for db in (observer,sdk):db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
            witness=observer.execute('SELECT binding,version FROM sdk_adapter_installation WHERE id=1').fetchone()
            identity=observer.execute('SELECT identity FROM worker_identity WHERE id=1').fetchone()
            held=observer.execute('SELECT held FROM ipc_state WHERE id=1').fetchone()
            adapter=sdk.execute('SELECT binding,version,held FROM sdk_adapter_state WHERE id=1').fetchone()
            if (witness!=(profile.digest(),1) or not identity or
                json.loads(identity[0])!={**profile.model_dump(),'ipc_version':1} or held!=(0,) or
                adapter!=(profile.digest(),1,0)):
                raise AuthorityError('CACHED_JOURNAL_UNVERIFIABLE')
            if (observer.execute("SELECT 1 FROM allocations WHERE phase IN ('dispatching','reconciled_hold','external_reduction')").fetchone() or
                observer.execute("SELECT 1 FROM ipc_requests WHERE state<>'done' OR response IS NULL").fetchone() or
                sdk.execute("SELECT 1 FROM sdk_adapter_operations WHERE phase<>'done' OR receipt IS NULL").fetchone()):
                raise AuthorityError('CACHED_JOURNAL_HELD')
            if observer.execute("SELECT 1 FROM sqlite_master WHERE name='ipc_transport_hold'").fetchone():
                if observer.execute('SELECT 1 FROM ipc_transport_hold LIMIT 1').fetchone():
                    raise AuthorityError('CACHED_JOURNAL_HELD')
            durable=observer.execute('SELECT state,response FROM ipc_requests WHERE id=?',[request.request_id]).fetchone()
            if not durable or durable[0]!='done' or Result.model_validate_json(durable[1])!=cached:
                raise AuthorityError('CACHED_RECEIPT_UNVERIFIABLE')
            # Required mock history/position schemas must remain readable too.
            sdk.execute('SELECT id,request FROM fills LIMIT 1').fetchall()
            sdk.execute('SELECT ticket,volume FROM positions LIMIT 1').fetchall()

    def _execute(self,request):
        if self._row(request.binding)['held']:return result('HELD',uncertain=True)
        if self._stopped(request.binding):return result('STOPPED')
        self._fence(request)
        fingerprint=hashlib.sha256(canonical(dict(binding=request.binding,body=request.body))).hexdigest()
        prior=self.db.execute('SELECT * FROM commands WHERE binding=? AND id=?',[request.binding,request.request_id]).fetchone()
        if prior:
            if prior['fingerprint']!=fingerprint:return result('IDEMPOTENCY_CONFLICT')
            if prior['phase']!='done':self._latch(request.binding);return result('HELD',uncertain=True)
            try:
                cached=Result.model_validate_json(prior['response'])
                if cached.success:
                    self._verify_cached_account(request,cached)
                    receipt=SyncReceipt.model_validate(cached.data)
                    if receipt.sourceKey!=request.body['sourceKey'] or receipt.symbol!=request.body['symbol']:
                        raise AuthorityError('CACHED_IDENTITY_MISMATCH')
            except Exception:
                self._latch(request.binding)
                return result('HELD',uncertain=True)
            with self.db:self._audit('CACHED',request.binding,request.epoch,request)
            return cached.model_dump()
        with self.db:
            self.db.execute("INSERT INTO commands VALUES(?,?,?,'processing',NULL)",[request.binding,request.request_id,fingerprint])
            self._audit('INTENT',request.binding,request.epoch,request)
        engine=None
        try:
            profile=Binding.model_validate_json(self._row(request.binding)['descriptor']);root=self.account_root(profile)
            private(root);check_simulation(root,profile)
            # Known private account files only, never cloned per host.
            for name in ('observer.sqlite3','simulated-broker.sqlite3'):
                private(root/name)
            command_deadline=self.monotonic()+max(0,(request.deadline_ms-self.clock())/1000)
            permit=lambda: (self.monotonic()<command_deadline and self._valid(request)
                            and not self._stopped(request.binding) and not self._row(request.binding)['held'])
            sdk_key=hashlib.sha256(b'offline-shared-sdk:'+self.service.encode()+request.binding.encode()+self.keys[request.binding]).digest()
            engine=FencedEngine(root,profile,sdk_key,shared_permit=permit,
                               stop_checker=lambda:self._stopped(request.binding),faults=self.worker_faults)
            def internal(operation,body,epoch=0,token=''):
                now=engine.clock()
                command=Envelope(version=1,binding=profile.digest(),controller=request.controller,
                    request_id=request.request_id if operation=='sync' else secrets.token_hex(16),nonce=secrets.token_hex(32),
                    issued_ms=now,deadline_ms=now+TTL_MS,epoch=epoch,lease_token=token,operation=operation,body=body)
                return verify(engine.handle(sign(command.model_dump(),sdk_key)),sdk_key,'response')['result']
            grant=internal('acquire',{})
            if not grant['success']:raise AuthorityError('GATEWAY_LEASE_UNAVAILABLE')
            local=LeaseGrant.model_validate(grant['data'])
            outcome=internal('sync',request.body,local.epoch,local.lease_token)
            if not permit() or outcome['uncertain']:
                self._latch(request.binding)
                outcome=result('HELD',uncertain=True)
            with self.db:
                self.db.execute("UPDATE commands SET phase='done',response=? WHERE binding=? AND id=?",
                                [canonical(outcome).decode(),request.binding,request.request_id])
                self._audit('COMPLETED',request.binding,request.epoch,request)
            return outcome
        except Exception:
            self._latch(request.binding)
            return result('SHARED_EXECUTION_UNCERTAIN',uncertain=True)
        finally:
            if engine:engine.close()

    def close(self):
        with self.lock:
            if not self.closed:
                self.closed=True;self.available=False
                self.db.close();self.owner.close()


class SimulatedLink:
    """Deterministic offline transport faults, not an actual network/RPC client."""
    def __init__(self,authority):
        self.authority=authority;self.partitioned=False;self.drop_reply=False;self.corrupt_reply=False

    def transmit(self,frame):
        if self.partitioned:raise TimeoutError('SIMULATED_PARTITION')
        response=self.authority.handle(frame)
        if self.drop_reply:raise TimeoutError('SIMULATED_LOST_REPLY')
        return response[:-1]+b'!' if self.corrupt_reply else response


class SimulatedHost:
    def __init__(self,link,binding,key,host,*,controller=None,clock=wall_ms):
        self.link=link;self.binding=Binding.model_validate(binding);self.key=key;self.host=host
        self.controller=controller or secrets.token_hex(16);self.clock=clock
        self.service=link.authority.service;self.epoch=0;self.token=''

    def frame(self,operation,body=None,*,request_id=None,nonce=None):
        now=self.clock()
        request=SharedEnvelope(version=1,service=self.service,host=self.host,binding=self.binding.digest(),
            controller=self.controller,request_id=request_id or secrets.token_hex(16),nonce=nonce or secrets.token_hex(32),
            issued_ms=now,deadline_ms=now+TTL_MS,epoch=0 if operation=='acquire' else self.epoch,
            lease_token='' if operation=='acquire' else self.token,operation=operation,body=body or {})
        return request,sign(request.model_dump(),self.key)

    def call(self,operation,body=None,**kwargs):
        try:
            request,frame=self.frame(operation,body,**kwargs)
            reply=SharedResponse.model_validate(verify(self.link.transmit(frame),self.key,'response'))
            for name in ('service','host','binding','controller','request_id','nonce'):
                if getattr(reply,name)!=getattr(request,name):raise AuthorityError('RESPONSE_MISMATCH')
            outcome=reply.result.model_dump()
            if outcome['success'] and outcome['code']=='LEASED':
                grant=LeaseGrant.model_validate(outcome['data'])
                self.epoch,self.token=grant.epoch,grant.lease_token
            return outcome
        except Exception:return result('AUTHORITY_UNAVAILABLE',uncertain=True)
