"""Account-scoped process workers around the existing observer reconciliation engine.
Simulation is explicit and cannot import or call the real MetaTrader5 API.
"""
from __future__ import annotations
import fcntl, json, multiprocessing as mp, os, threading
from pathlib import Path
from observer_sync import ObserverSync, SyncJournal, synchronize

from simulation_sdk import Account,SimulatedBroker,BROKERS

def _worker(pipe, account, directory):
    os.umask(0o077)
    root=Path(directory);root.mkdir(parents=True,exist_ok=True,mode=0o700)
    broker=SimulatedBroker(account,root)
    journal=SyncJournal(root/'observer-journal.sqlite3')
    while True:
        try:message=pipe.recv()
        except EOFError:break
        if message is None:break
        try:
            payload=ObserverSync(**message)
            if payload.login!=account.login or payload.server!=account.server or account.role!='client':
                result={'success':False,'message':'Account identity or role mismatch','retriable':False}
            else:
                result=synchronize(broker,payload,journal,lambda *args: 'Simulated disconnect' if account.disconnected else None,broker.send)
            result.update(simulation=True,account_id=account.id,worker_pid=os.getpid())
            pipe.send(result)
        except Exception:
            # Request bodies and exception text may contain secrets; do not echo.
            pipe.send({'success':False,'message':'Worker failed; reconcile before retry','uncertain':True,'retriable':False,'simulation':True})
    broker.db.close();pipe.close()

class AccountWorkers:
    """One bounded, serialized process and durable journal per configured account."""
    def __init__(self, accounts, root, timeout=8, max_workers=8):
        if len(accounts)>max_workers:raise ValueError('Worker capacity exceeded')
        self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.lease=(self.root/'gateway.lock').open('a')
        try:fcntl.flock(self.lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.lease.close();raise ValueError('Account worker state already owned by another gateway')
        self.accounts={};self.workers={};self.locks={};self.timeout=timeout
        try:
            ids=set()
            for account in accounts:
                account.validate();key=(account.login,account.server)
                if key in self.accounts or account.id in ids:raise ValueError('Duplicate account binding')
                ids.add(account.id);self.accounts[key]=account;self.locks[key]=threading.Lock()
        except Exception:self.close();raise
    def _bind_state(self, account):
        """Fail closed before opening state that belongs to another identity.

        Legacy state without a binding needs explicit offline verification; it is
        never silently adopted or reset. The gateway lease serializes creation.
        """
        root = self.root / account.id
        root.mkdir(mode=0o700, exist_ok=True)
        if root.is_symlink():
            raise ValueError('Account state directory must not be a symlink')
        binding = root / 'account-binding.json'
        expected = dict(version=1, id=account.id, broker=account.broker,
                        login=account.login, server=account.server, role=account.role)
        if binding.exists():
            if binding.is_symlink() or json.loads(binding.read_text()) != expected:
                raise ValueError('Account state identity mismatch')
            return
        if any(root.iterdir()):
            raise ValueError('Unbound legacy account state requires offline verification')
        # Exclusive creation plus fsync; a torn file fails closed on next start.
        fd = os.open(binding, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(expected, stream, sort_keys=True)
            stream.flush(); os.fsync(stream.fileno())
        directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)

    def _start(self,key):
        account=self.accounts[key];self._bind_state(account);context=mp.get_context('spawn');parent,child=context.Pipe()
        process=context.Process(target=_worker,args=(child,account,str(self.root/account.id)),daemon=True)
        process.start();child.close();self.workers[key]=(process,parent)
        return process,parent
    def _stop(self,key):
        existing=self.workers.pop(key,None)
        if not existing:return
        process,pipe=existing
        try:pipe.send(None)
        except (BrokenPipeError,EOFError,OSError):pass
        process.join(.2)
        if process.is_alive():process.terminate();process.join(1)
        if process.is_alive():process.kill();process.join(1)
        pipe.close()
    def dispatch(self,payload):
        key=(payload.login,payload.server)
        if key not in self.accounts or self.accounts[key].role!='client':
            return {'success':False,'message':'No authorized account worker','retriable':False,'simulation':True}
        with self.locks[key]:
            process,pipe=self.workers.get(key,(None,None))
            if process is None or not process.is_alive():
                self._stop(key)
                try:process,pipe=self._start(key)
                except (ValueError,OSError):
                    return {'success':False,'message':'Account state binding unavailable or unverified; offline review required','retriable':False,'simulation':True}
            try:
                # SecretStr never enters the simulation process or its journal.
                message=payload.model_dump(exclude={'password'});message['password']='simulation-only'
                pipe.send(message)
                if not pipe.poll(self.timeout):raise TimeoutError()
                result=pipe.recv()
                if result.get('uncertain'):self._stop(key)
                return result
            except (EOFError,OSError,TimeoutError):
                self._stop(key)
                return {'success':False,'message':'Worker interrupted; submission outcome uncertain','uncertain':True,'retriable':False,'simulation':True}
    def close(self):
        for key in list(self.workers):self._stop(key)
        self.lease.close()
