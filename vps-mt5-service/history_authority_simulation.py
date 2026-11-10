"""Specialized offline history gateway using the existing signed host protocol.

This is a distinct synthetic backend, not an MT5 SDK adapter or a migration of
existing absolute-target accounts. All effects are rows in history.sqlite3.
"""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3

from private_ipc import Binding, Result, canonical, result
from sdk_ipc_candidate import check_simulation, bridge_stop_active
from shared_lease_simulation import (SharedAuthority, AuthorityError, prepare_authority,
                                     private, touch_private)
from synthetic_trade_history import COMMAND, Reconcile, HistoryBook, HistoryError


def prepare_history_authority(root):
    service=prepare_authority(root)
    path=Path(root)/'history-mode.json';touch_private(path)
    with path.open('wb') as stream:
        stream.write(canonical(dict(simulation=True,service=service,kind='trade-history-v1')))
        stream.flush();os.fsync(stream.fileno())
    with closing(sqlite3.connect(Path(root)/'authority.sqlite3')) as db:
        db.execute('CREATE TABLE history_installations(binding TEXT PRIMARY KEY)')
        db.execute('CREATE TABLE history_intents(binding TEXT,id TEXT,event_id TEXT,payload TEXT,PRIMARY KEY(binding,id))')
        db.execute('CREATE TABLE history_reviews(binding TEXT,command_id TEXT,reason TEXT,epoch INTEGER)')
    return service


class HistoryAuthority(SharedAuthority):
    history_protocol=True
    execution_budget=.5

    def __init__(self,root,**kwargs):
        marker=Path(root).absolute()/'history-mode.json';private(marker)
        if marker.stat().st_size>1024:raise AuthorityError('HISTORY_MODE_INVALID')
        mode=json.loads(marker.read_bytes())
        super().__init__(root,**kwargs)
        if mode!=dict(simulation=True,service=self.service,kind='trade-history-v1'):
            self.close();raise AuthorityError('HISTORY_MODE_INVALID')

    def register(self,binding,key):
        profile=Binding.model_validate(binding)
        with self.lock:
            existed=self.db.execute('SELECT 1 FROM accounts WHERE binding=?',[profile.digest()]).fetchone()
            super().register(profile,key)
            path=self.account_root(profile)/'history.sqlite3'
            if existed:
                if not self.db.execute('SELECT 1 FROM history_installations WHERE binding=?',[profile.digest()]).fetchone():
                    self._latch(profile.digest());raise HistoryError('HISTORY_INSTALLATION_MISSING')
                try:
                    book=HistoryBook(path,profile.digest(),lambda:True)
                    try:book.verify()
                    finally:book.close()
                except Exception:
                    self._latch(profile.digest());raise
            else:
                try:
                    HistoryBook.provision(path,profile.digest())
                    with self.db:self.db.execute('INSERT INTO history_installations VALUES(?)',[profile.digest()])
                except Exception:
                    self._latch(profile.digest());raise

    def _stopped(self,binding):
        try:
            profile=Binding.model_validate_json(self._row(binding)['descriptor'])
            root=self.account_root(profile);check_simulation(root,profile)
            if bridge_stop_active(root):return True
            return super()._stopped(binding)
        except Exception:return True

    def _history_permit(self,request,readonly,deadline):
        profile=Binding.model_validate_json(self._row(request.binding)['descriptor'])
        root=self.account_root(profile);check_simulation(root,profile);private(root)
        # Never mix this event backend with an initialized absolute-target SDK.
        for name in ('observer.sqlite3','simulated-broker.sqlite3'):
            private(root/name)
            if (root/name).stat().st_size:raise HistoryError('MIXED_BACKEND_STATE')
        return (self.monotonic()<deadline and self._valid(request) and not self._stopped(request.binding)
                and (readonly or not self._row(request.binding)['held']))

    def _validate_sync(self,request):
        command=COMMAND.validate_python(request.body)
        profile=Binding.model_validate_json(self._row(request.binding)['descriptor'])
        if (command.login,command.server)!=(profile.login,profile.server):raise AuthorityError('IDENTITY_MISMATCH')

    def _execute(self,request):
        command=COMMAND.validate_python(request.body);readonly=isinstance(command,Reconcile)
        if self._row(request.binding)['held'] and not readonly:return result('HELD',uncertain=True)
        if self._stopped(request.binding):return result('STOPPED')
        self._fence(request)
        fingerprint=hashlib.sha256(canonical(dict(binding=request.binding,body=request.body))).hexdigest()
        prior=self.db.execute('SELECT * FROM commands WHERE binding=? AND id=?',[request.binding,request.request_id]).fetchone()
        if prior and prior['fingerprint']!=fingerprint:
            self._latch(request.binding);return result('IDEMPOTENCY_CONFLICT')
        if prior and prior['phase']!='done':
            self._latch(request.binding);return result('HELD',uncertain=True)
        if not prior:
            with self.db:
                self.db.execute("INSERT INTO commands VALUES(?,?,?,'processing',NULL)",
                                [request.binding,request.request_id,fingerprint])
                self._audit('INTENT',request.binding,request.epoch,request)
                if not readonly:
                    self.db.execute('INSERT INTO history_intents VALUES(?,?,?,?)',
                        [request.binding,request.request_id,command.event_id,canonical(command.model_dump()).decode()])
        book=None
        try:
            profile=Binding.model_validate_json(self._row(request.binding)['descriptor'])
            root=self.account_root(profile);private(root)
            deadline=self.monotonic()+min(self.execution_budget,max(0,(request.deadline_ms-self.clock())/1000))
            permit=lambda:self._history_permit(request,readonly,deadline)
            if not self.db.execute('SELECT 1 FROM history_installations WHERE binding=?',[request.binding]).fetchone():
                raise HistoryError('HISTORY_INSTALLATION_MISSING')
            book=HistoryBook(root/'history.sqlite3',request.binding,permit)
            book.verify()
            for event in book.db.execute('SELECT command_id,event_id,payload FROM events'):
                witness=self.db.execute('SELECT event_id,payload FROM history_intents WHERE binding=? AND id=?',
                                        [request.binding,event['command_id']]).fetchone()
                if witness is None or tuple(witness)!=(event['event_id'],event['payload']):
                    raise HistoryError('UNWITNESSED_HISTORY_EVENT')
            for witness in self.db.execute('SELECT * FROM history_intents WHERE binding=? AND id<>?',
                                           [request.binding,request.request_id]):
                event=book.db.execute('SELECT payload,receipt FROM events WHERE event_id=?',[witness['event_id']]).fetchone()
                if event is None or event[0]!=witness['payload']:raise HistoryError('INCOMPLETE_COMMAND_HISTORY')
                rpc=self.db.execute('SELECT phase,response FROM commands WHERE binding=? AND id=?',
                                    [request.binding,witness['id']]).fetchone()
                if rpc is None or rpc['phase'] not in ('processing','done'):
                    raise HistoryError('MISSING_COMMAND_WITNESS')
                if rpc['phase']=='done':
                    receipt=Result.model_validate_json(rpc['response'])
                    if not receipt.success or receipt.code!='SIMULATED_HISTORY_APPLIED' or canonical(receipt.data).decode()!=event[1]:
                        raise HistoryError('COMMAND_RECEIPT_CONFLICT')
            if readonly:
                unresolved=[r[0] for r in self.db.execute("SELECT id FROM commands WHERE binding=? AND phase<>'done' AND id<>?",
                                                        [request.binding,request.request_id])]
                data=book.certificate(unresolved)
                data['hold_required']=bool(self._row(request.binding)['held'])
                outcome=result('HISTORY_VERIFIED',True,data=data)
            else:
                data=book.execute(command,request.request_id)
                outcome=result('SIMULATED_HISTORY_APPLIED',True,data=data)
                if prior and Result.model_validate_json(prior['response']).model_dump()!=outcome:
                    raise HistoryError('CACHED_HISTORY_CONFLICT')
            book.gate()
            with self.db:
                self.db.execute("UPDATE commands SET phase='done',response=? WHERE binding=? AND id=?",
                                [canonical(outcome).decode(),request.binding,request.request_id])
                self._audit('CACHED' if prior else 'COMPLETED',request.binding,request.epoch,request)
            return outcome
        except Exception as error:
            self._latch(request.binding)
            reason=str(error) if isinstance(error,HistoryError) else 'HISTORY_UNAVAILABLE'
            try:
                with self.db:self.db.execute('INSERT INTO history_reviews VALUES(?,?,?,?)',
                    [request.binding,request.request_id,reason,request.epoch])
            except Exception:pass
            # Keep precommitted command unresolved. Recovery cannot infer no-fill.
            return result('HISTORY_REVIEW_REQUIRED',uncertain=True)
        finally:
            if book:book.close()
