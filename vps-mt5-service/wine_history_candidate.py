"""History mode in the existing Linux-to-Wine bridge, synthetic execution only."""
from contextlib import closing
from pathlib import Path
import secrets
import re
import sqlite3

from private_ipc import Binding, canonical, result
from native_history_pipeline import prepare_history_worker, validate_history_success, HistoryWorkerSimulation, HistoryWorkerEngine
from native_windows_candidate import private_tree
from windows_simulation_security import LinuxReferenceInspector
from shared_lease_simulation import private, touch_private
from worker_state import StateLease
from history_authority_simulation import HistoryAuthority
from wine_bridge import WineBridge


def prepare_wine_history(root,binding,key):
    prepare_history_worker(root,binding,key)
    marker=Path(root)/'wine-history-fixture.json';touch_private(marker)
    with marker.open('wb') as stream:
        stream.write(canonical(dict(simulation=True,binding=binding.digest(),kind='wine-history')))
        stream.flush()
        import os
        os.fsync(stream.fileno())


class WineHistoryAuthority(HistoryAuthority):
    # Trusted protocol policy only, never an IPC/request-controlled parameter.
    # Final controller lease, stop and request-deadline checks remain unchanged.
    execution_budget=1.5


class WineHistoryEngine(HistoryWorkerEngine):
    authority_type=WineHistoryAuthority


class WineHistoryBridge(WineBridge):
    protocol='trade-history-wine'
    _pipeline_audit=HistoryWorkerSimulation._pipeline_audit

    def __init__(self,root,prefix,binding,key,runtime,**kwargs):
        binding=Binding.model_validate(binding)
        self.history_owner=StateLease(Path(root)/'history-authority'/'shared-authority')
        private_tree(Path(root),LinuxReferenceInspector())
        marker=Path(root)/'wine-history-fixture.json';private(marker)
        if marker.read_bytes()!=canonical(dict(simulation=True,binding=binding.digest(),kind='wine-history')):
            raise ValueError('Wine fixture identity mismatch')
        if kwargs.get('mock_stop') is not True:raise ValueError('Explicit mock stop required')
        if runtime.kind=='wine':self.history_owner.acquire()
        try:super().__init__(root,prefix,binding,key,runtime,**kwargs)
        except Exception:
            if not getattr(self,'launch_attempted',False) or getattr(self,'quiesced',False):self.history_owner.close()
            raise

    def _validate_success(self,request,outcome):
        if request.operation=='sync':return validate_history_success(request,outcome)
        return super()._validate_success(request,outcome)

    def _persist_transport_hold(self):
        self._sticky_hold()
        if not self.quiesced:raise ValueError('Wine quiescence unconfirmed')
        path=self.root/'history-authority'/'authority.sqlite3';private(path)
        with closing(sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1)) as db:
            db.execute('PRAGMA synchronous=FULL')
            row=db.execute('SELECT descriptor FROM accounts WHERE binding=?',[self.binding.digest()]).fetchone()
            if not row or row[0]!=canonical(self.binding.model_dump()).decode():raise ValueError('Hold identity mismatch')
            with db:
                if db.execute('UPDATE accounts SET held=1 WHERE binding=?',[self.binding.digest()]).rowcount!=1:
                    raise ValueError('Shared hold unrecorded')
        self._audit('TRANSPORT_HELD')

    def request(self,operation,body=None,*,request_id=None):
        rid=request_id or secrets.token_hex(16)
        if type(rid) is not str or not re.fullmatch('[a-f0-9]{32}',rid) or operation not in ('acquire','renew','status','sync'):
            raise ValueError('Invalid pipeline request metadata')
        with self.lock:
            if self.closed or self.failed:return result('UNAVAILABLE',uncertain=True)
            try:
                private_tree(self.root,LinuxReferenceInspector())
                self._pipeline_audit('REQUEST',rid,operation)
                reply=super().request(operation,body,request_id=rid)
                self._pipeline_audit('RESULT',rid,operation,reply['code'])
                return reply
            except Exception:
                self.failed=True;self._sticky_hold();self._stop()
                return result('HISTORY_PIPELINE_HELD',uncertain=True)

    def _stop(self):
        if self.closed:return
        if self.child and self.child.poll() not in (None,0):self.failed=True
        super()._stop()
        if self.failed and self.quiesced:
            try:self._persist_transport_hold()
            except Exception:self.audit_failed=True

    def _release_if_quiescent(self):
        super()._release_if_quiescent()
        if self.quiesced:self.history_owner.close()
