"""Simulation-only Windows-compatible SDK/IPC candidate; no real SDK import/launcher.

The controller and child run in the same Python platform (spawn + inherited pipe).
Actual Linux-to-Wine handle transfer/runtime acceptance is deliberately unclaimed.
"""
import hashlib
import json
import multiprocessing as mp
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

from pydantic import Field
from demo_worker import emergency_stop_active
from observer_sync import SyncJournal, synchronize
from worker_state import StateLease, bind_identity
from simulation_sdk import Account, SimulatedBroker
from private_ipc import (Binding, StrictModel, SyncTarget, Envelope, Response, LeaseGrant, Renewal, Status, SyncReceipt,
                         MAX_FRAME, ProtocolError, canonical, sign, verify, result)

MAX_NONCES = 10000
MAX_AUDIT = 30000
LEASE_MS = 2000


class SimulationFaults(StrictModel):
    before_send_ms: int = Field(default=0, ge=0, le=1000)
    crash_after_fill: bool = False


def wall_ms():
    return time.time_ns() // 1000000


def _safe_root(root):
    root = Path(root).absolute()
    if root.resolve() != root or root.is_symlink() or not root.is_dir():
        raise ValueError('Private simulation directory required')
    meta = root.stat()
    if os.name != 'nt' and (meta.st_uid != os.getuid() or meta.st_mode & 0o077):
        raise ValueError('Private simulation directory required')
    for name in ('simulation.json', 'observer.sqlite3', 'observer.sqlite3.owner', 'simulated-broker.sqlite3'):
        path = root / name
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise ValueError('Unsafe simulation state path')
    return root


def prepare_simulation(root, binding):
    """Explicit, empty-fixture-only provisioning; never adopts existing state."""
    binding = Binding.model_validate(binding)
    root = Path(root)
    root.mkdir(mode=0o700, parents=False, exist_ok=True)
    root = _safe_root(root)
    if any(root.iterdir()):
        raise ValueError('Simulation fixture must be empty')
    fd = os.open(root / 'simulation.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(canonical(binding.model_dump()))
        stream.flush()
        os.fsync(stream.fileno())


def check_simulation(root, binding):
    root = _safe_root(root)
    marker = root / 'simulation.json'
    if marker.stat().st_size > 2048 or marker.read_bytes() != canonical(binding.model_dump()):
        raise ValueError('Simulation identity mismatch')
    return root


def bridge_stop_active(root):
    """A sticky bridge fault is also a stop for standalone/recovered candidates."""
    try:
        _safe_root(root)
        try:
            (Path(root) / 'bridge-stop.json').lstat()
        except FileNotFoundError:
            _safe_root(root)
            return False
        return True
    except (OSError, ValueError):
        return True


class CandidateEngine:
    """Single-owner worker. No operation can clear a hold or accept live bindings."""
    def __init__(self, root, binding, key, *, stop_checker=None, clock=wall_ms,
                 monotonic=time.monotonic, faults=None):
        self.binding = Binding.model_validate(binding)
        if type(key) is not bytes or len(key) < 32:
            raise ValueError('Strong private IPC key required')
        self.root = check_simulation(root, self.binding)
        self.key, self.clock, self.monotonic = key, clock, monotonic
        self.stop_checker = stop_checker or emergency_stop_active
        self.faults = SimulationFaults.model_validate(faults or {})
        self.journal = SyncJournal(self.root / 'observer.sqlite3')
        self.owner = StateLease(self.journal.path)
        self.db = self.sdk = None
        self.lock = threading.Lock()
        self.deadline = 0.0
        self.owner.acquire()
        try:
            bind_identity(self.journal, {**self.binding.model_dump(), 'ipc_version': 1})
            self.db = self.journal.open()
            self.db.executescript('''
                CREATE TABLE IF NOT EXISTS ipc_state(
                  id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL,
                  controller TEXT NOT NULL,token_hash TEXT NOT NULL,expires_ms INTEGER NOT NULL,
                  highwater_ms INTEGER NOT NULL,held INTEGER NOT NULL);
                INSERT OR IGNORE INTO ipc_state VALUES(1,0,'','',0,0,0);
                CREATE TABLE IF NOT EXISTS ipc_nonces(nonce TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS ipc_requests(
                  id TEXT PRIMARY KEY,hash TEXT NOT NULL,state TEXT NOT NULL,response TEXT);
                CREATE TABLE IF NOT EXISTS ipc_audit(
                  id INTEGER PRIMARY KEY,event TEXT NOT NULL,observed_ms INTEGER NOT NULL,
                  epoch INTEGER NOT NULL,request_ref TEXT,controller_ref TEXT);
            ''')
            # Restart invalidates grants, not holds. A new explicit acquire is required.
            self.db.execute("UPDATE ipc_state SET epoch=epoch+1,controller='',token_hash='',expires_ms=0")
            if self.db.execute("SELECT 1 FROM ipc_requests WHERE state='processing'").fetchone():
                self.db.execute('UPDATE ipc_state SET held=1')
            if self.db.execute("SELECT 1 FROM sqlite_master WHERE name='ipc_transport_hold'").fetchone():
                if self.db.execute('SELECT 1 FROM ipc_transport_hold').fetchone():
                    self.db.execute('UPDATE ipc_state SET held=1')
            self.db.commit()
            self.sdk = self._construct_sdk()
            self._audit('WORKER_STARTED')
        except Exception:
            self.close()
            raise

    def _construct_sdk(self):
        """Internal construction seam, after journal ownership; never a wire selector.

        The default remains hardcoded simulation. No real binding or loader exists.
        """
        account = Account(self.binding.account, self.binding.broker, self.binding.login,
                          self.binding.server, delay_ms=0,
                          crash_after_commit=self.faults.crash_after_fill)
        return SimulatedBroker(account, self.root)

    def _state(self):
        return self.db.execute('SELECT * FROM ipc_state WHERE id=1').fetchone()

    def _audit(self, event, request=None):
        if self.db.execute('SELECT count(*) FROM ipc_audit').fetchone()[0] >= MAX_AUDIT:
            self.db.execute('UPDATE ipc_state SET held=1')
            self.db.commit()
            raise ProtocolError('AUDIT_FULL')
        digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
        self.db.execute('INSERT INTO ipc_audit(event,observed_ms,epoch,request_ref,controller_ref) VALUES(?,?,?,?,?)',
                        [event, self.clock(), self._state()['epoch'],
                         digest(request.request_id) if request else None,
                         digest(request.controller) if request else None])
        self.db.commit()

    def _held(self):
        return bool(bridge_stop_active(self.root) or self._state()['held'] or self.db.execute(
            "SELECT 1 FROM allocations WHERE phase IN ('dispatching','reconciled_hold','external_reduction')").fetchone())

    def _valid_lease(self, request):
        state = self._state()
        return (request.controller == state['controller'] and request.epoch == state['epoch']
                and state['highwater_ms'] <= self.clock() < state['expires_ms'] and self.monotonic() < self.deadline
                and secrets.compare_digest(hashlib.sha256(request.lease_token.encode()).hexdigest(), state['token_hash']))

    def _stopped(self):
        try:
            return bridge_stop_active(self.root) or self.stop_checker() is not False
        except Exception:
            return True

    def _sdk_bound(self):
        try:
            account = self.sdk.account_info()
            return (account is not None and type(account.login) is int and account.login == self.binding.login
                    and type(account.server) is str and account.server == self.binding.server
                    and type(account.trade_mode) is int and account.trade_mode == 0)
        except Exception:
            return False

    def handle(self, frame):
        # The transport dispatches on one owning thread; SQLite/SDK stay there.
        with self.lock:
            request = None
            try:
                request = Envelope.model_validate(verify(frame, self.key))
                if request.binding != self.binding.digest():
                    raise ProtocolError('IDENTITY_MISMATCH')
                request.validate_time(self.clock())
                if request.operation == 'sync':
                    if 'password' in request.body:
                        raise ProtocolError('INVALID_BODY')
                    target = SyncTarget.model_validate(request.body)
                    if target.login != self.binding.login or target.server != self.binding.server:
                        raise ProtocolError('IDENTITY_MISMATCH')
                elif request.body:
                    raise ProtocolError('INVALID_BODY')
                state = self._state()
                if self.clock() < state['highwater_ms']:
                    self.db.execute('UPDATE ipc_state SET held=1')
                    self.db.commit()
                    raise ProtocolError('CLOCK_REVERSED')
                self.db.execute('UPDATE ipc_state SET highwater_ms=?', [self.clock()])
                if self.db.execute('SELECT 1 FROM ipc_nonces WHERE nonce=?', [request.nonce]).fetchone():
                    raise ProtocolError('REPLAY')
                if self.db.execute('SELECT count(*) FROM ipc_nonces').fetchone()[0] >= MAX_NONCES:
                    raise ProtocolError('REPLAY_STORAGE_FULL')
                self.db.execute('INSERT INTO ipc_nonces VALUES(?)', [request.nonce])
                self.db.commit()
                self._audit('REQUEST_ACCEPTED', request)
                if request.operation == 'acquire':
                    if request.epoch != 0 or request.lease_token:
                        raise ProtocolError('LEASE_INVALID')
                    if state['expires_ms'] > self.clock():
                        raise ProtocolError('OWNER_CONFLICT')
                    token = secrets.token_hex(32)
                    epoch = state['epoch'] + 1
                    expires = self.clock() + LEASE_MS
                    self.db.execute('UPDATE ipc_state SET controller=?,epoch=?,token_hash=?,expires_ms=?',
                                    [request.controller, epoch, hashlib.sha256(token.encode()).hexdigest(), expires])
                    self.db.commit()
                    self.deadline = self.monotonic() + LEASE_MS / 1000
                    self._audit('LEASE_ACQUIRED', request)
                    outcome = result('LEASED', True, data=dict(epoch=epoch, lease_token=token, expires_ms=expires))
                else:
                    if not self._valid_lease(request):
                        raise ProtocolError('LEASE_INVALID')
                    if request.operation == 'renew':
                        expires = self.clock() + LEASE_MS
                        self.db.execute('UPDATE ipc_state SET expires_ms=?', [expires])
                        self.db.commit()
                        self.deadline = self.monotonic() + LEASE_MS / 1000
                        self._audit('LEASE_RENEWED', request)
                        outcome = result('RENEWED', True, data=dict(expires_ms=expires))
                    elif request.operation == 'status':
                        outcome = result('STATUS', True, data=dict(held=self._held(), stopped=self._stopped()))
                    else:
                        outcome = self._sync(request, target)
            except Exception as error:
                self.db.rollback()
                code = str(error) if isinstance(error, ProtocolError) else 'INVALID_REQUEST'
                # Never emit arbitrary exception strings, raw requests or SDK output.
                uncertain = False
                try:
                    self._audit('REQUEST_REJECTED', request)
                except Exception:
                    self.db.execute('UPDATE ipc_state SET held=1')
                    self.db.commit()
                    code, uncertain = 'AUDIT_FAILED', True
                outcome = result(code, uncertain=uncertain)
            if request is None:
                return sign(dict(binding=self.binding.digest(), controller='0' * 32,
                                 request_id='0' * 32, nonce='0' * 64, result=outcome), self.key, 'response')
            return sign(dict(binding=request.binding, controller=request.controller,
                             request_id=request.request_id, nonce=request.nonce, result=outcome), self.key, 'response')

    def _sync(self, request, target):
        if self._held():
            return result('HELD', uncertain=True)
        if self._stopped():
            return result('STOPPED')
        if not self._sdk_bound():
            return result('SDK_IDENTITY_MISMATCH')
        fingerprint = hashlib.sha256(canonical(dict(binding=request.binding, body=request.body))).hexdigest()
        prior = self.db.execute('SELECT * FROM ipc_requests WHERE id=?', [request.request_id]).fetchone()
        if prior:
            if prior['hash'] != fingerprint:
                return result('IDEMPOTENCY_CONFLICT')
            if prior['state'] != 'done':
                return result('HELD', uncertain=True)
            self._audit('IDEMPOTENT_RECEIPT', request)
            return json.loads(prior['response'])
        self.db.execute('INSERT INTO ipc_requests VALUES(?,?,?,NULL)',
                        [request.request_id, fingerprint, 'processing'])
        self.db.commit()
        self._audit('SYNC_INTENT', request)

        def send(order, symbol):
            if self.faults.before_send_ms:
                time.sleep(self.faults.before_send_ms / 1000)
            self._audit('SIMULATED_SEND_INTENT', request)
            # All gates are sampled again immediately before every mock SDK send.
            if (self._stopped() or not self._sdk_bound() or not self._valid_lease(request)
                    or self.clock() >= request.deadline_ms):
                return None
            return self.sdk.send(order, symbol)

        try:
            receipt = synchronize(self.sdk, target, self.journal, lambda *args: None, send)
            outcome = result('SYNCED' if receipt['success'] else 'SYNC_REJECTED',
                             receipt['success'], receipt.get('uncertain', False), receipt.get('data'))
        except Exception:
            outcome = result('WORKER_HELD', uncertain=True)
        if outcome['uncertain']:
            self.db.execute('UPDATE ipc_state SET held=1')
        self.db.execute("UPDATE ipc_requests SET state='done',response=? WHERE id=?",
                        [canonical(outcome).decode(), request.request_id])
        self.db.commit()
        self._audit('SYNC_HELD' if outcome['uncertain'] else 'SYNC_COMPLETED', request)
        return outcome

    def close(self):
        if self.sdk is not None:
            self.sdk.db.close()
            self.sdk = None
        if self.db is not None:
            self.db.close()
            self.db = None
        self.owner.close()


def _serve(pipe, root, binding, key, mock_stop, faults):
    os.umask(0o077)
    engine = None
    try:
        # Explicit simulation fixture injection only; default uses the real fail-closed checker.
        checker = (lambda: mock_stop.value != 0) if mock_stop is not None else None
        engine = CandidateEngine(root, binding, key, stop_checker=checker, faults=faults)
        while True:
            frame = pipe.recv_bytes(MAX_FRAME)
            pipe.send_bytes(engine.handle(frame))
    except Exception:
        # The controller records a transport hold; never print arbitrary child details.
        pass
    finally:
        if engine is not None:
            engine.close()
        pipe.close()


def hold_after_transport_failure(root, binding):
    """After confirmed child death, take the same ownership lock and preserve a hold."""
    root = check_simulation(root, binding)
    journal = SyncJournal(root / 'observer.sqlite3')
    owner = StateLease(journal.path)
    owner.acquire()
    try:
        record_transport_hold(root, binding)
    finally:
        owner.close()


def record_transport_hold(root, binding):
    """Internal: caller must already own the Linux journal lock after child quiescence."""
    root = check_simulation(root, binding)
    journal = SyncJournal(root / 'observer.sqlite3')
    bind_identity(journal, {**binding.model_dump(), 'ipc_version': 1})
    with sqlite3.connect(journal.path, timeout=1) as db:
        db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS ipc_transport_hold(id INTEGER PRIMARY KEY CHECK(id=1))')
        db.execute('INSERT OR IGNORE INTO ipc_transport_hold VALUES(1)')
        if db.execute("SELECT 1 FROM sqlite_master WHERE name='ipc_state'").fetchone():
            db.execute('UPDATE ipc_state SET held=1')
            if db.execute("SELECT 1 FROM sqlite_master WHERE name='ipc_audit'").fetchone():
                if db.execute('SELECT count(*) FROM ipc_audit').fetchone()[0] < MAX_AUDIT:
                    epoch = db.execute('SELECT epoch FROM ipc_state WHERE id=1').fetchone()[0]
                    db.execute("INSERT INTO ipc_audit(event,observed_ms,epoch) VALUES('TRANSPORT_HELD',?,?)",
                               [wall_ms(), epoch])
        db.commit()


class SimulationController:
    """Private inherited-handle IPC. No automatic acquire, restart or request replay."""
    def __init__(self, root, binding, key, *, timeout=3.0, controller=None, mock_stop=None, faults=None):
        self.binding = Binding.model_validate(binding)
        self.root = check_simulation(root, self.binding)
        if type(timeout) not in (int, float) or not .05 <= timeout <= 5 or type(key) is not bytes or len(key) < 32:
            raise ValueError('Bounded timeout and strong key required')
        self.key, self.timeout = key, timeout
        self.controller = controller or secrets.token_hex(16)
        if not re.fullmatch(r'[a-f0-9]{32}', self.controller):
            raise ValueError('Invalid controller identity')
        self.epoch, self.token = 0, ''
        self.lock = threading.Lock()
        self.failed = False
        context = mp.get_context('spawn')
        self.pipe, child = context.Pipe()
        self.process = context.Process(target=_serve,
            args=(child, str(self.root), self.binding.model_dump(), key, mock_stop, faults), daemon=True)
        self.process.start()
        child.close()

    def request(self, operation, body=None, *, request_id=None):
        with self.lock:
            if type(self.timeout) not in (int, float) or not .05 <= self.timeout <= 5:
                raise ValueError('Bounded timeout required')
            if self.failed or not self.process.is_alive():
                return result('UNAVAILABLE', uncertain=True)
            now = wall_ms()
            request = Envelope(version=1, binding=self.binding.digest(), controller=self.controller,
                request_id=request_id or secrets.token_hex(16), nonce=secrets.token_hex(32),
                issued_ms=now, deadline_ms=now + int(self.timeout * 1000),
                epoch=0 if operation == 'acquire' else self.epoch,
                lease_token='' if operation == 'acquire' else self.token,
                operation=operation, body={} if body is None else body)
            frame = sign(request.model_dump(), self.key)
            responses = []
            errors = []

            def exchange():
                try:
                    self.pipe.send_bytes(frame)
                    responses.append(self.pipe.recv_bytes(MAX_FRAME))
                except Exception:
                    errors.append(True)

            io = threading.Thread(target=exchange, daemon=True)
            io.start()
            io.join(self.timeout)
            try:
                if io.is_alive() or errors or not responses:
                    raise ProtocolError('TRANSPORT_FAILED')
                reply = Response.model_validate(verify(responses[0], self.key, 'response'))
                if (reply.binding, reply.controller, reply.request_id, reply.nonce) != (
                        request.binding, request.controller, request.request_id, request.nonce):
                    raise ProtocolError('RESPONSE_MISMATCH')
                if wall_ms() >= request.deadline_ms:
                    raise ProtocolError('DEADLINE')
                outcome = reply.result.model_dump()
                if outcome['success']:
                    self._validate_success(request, outcome)
                if outcome['code'] == 'LEASED':
                    if not outcome['success'] or operation != 'acquire':
                        raise ProtocolError('INVALID_RESPONSE')
                    self.epoch, self.token = outcome['data']['epoch'], outcome['data']['lease_token']
                return outcome
            except Exception:
                self.failed = True
                self._stop()
                if self.process.is_alive():
                    return result('WORKER_STOP_UNCONFIRMED', uncertain=True)
                try:
                    self._persist_transport_hold()
                except Exception:
                    return result('TRANSPORT_HOLD_UNRECORDED', uncertain=True)
                io.join(1)
                return result('TRANSPORT_HELD', uncertain=True)

    def _validate_success(self, request, outcome):
        schemas = {'acquire': ('LEASED', LeaseGrant), 'renew': ('RENEWED', Renewal),
                   'status': ('STATUS', Status), 'sync': ('SYNCED', SyncReceipt)}
        code, schema = schemas[request.operation]
        if outcome['code'] != code or outcome['uncertain']:
            raise ProtocolError('INVALID_RESPONSE')
        parsed = schema.model_validate(outcome['data'])
        if request.operation == 'acquire' and (parsed.epoch <= self.epoch or parsed.expires_ms <= wall_ms()
                                       or parsed.expires_ms > wall_ms() + LEASE_MS):
            raise ProtocolError('INVALID_RESPONSE')
        if request.operation == 'sync' and (parsed.sourceKey != request.body.get('sourceKey')
                                   or parsed.symbol != request.body.get('symbol')):
            raise ProtocolError('INVALID_RESPONSE')

    def _persist_transport_hold(self):
        hold_after_transport_failure(self.root, self.binding)

    def _stop(self):
        for stop in (self.process.terminate, self.process.kill):
            try:
                if self.process.is_alive():
                    stop()
                self.process.join(1)
            except (OSError, ValueError):
                # The caller distinguishes unconfirmed death from a persisted hold.
                pass
        try:
            self.pipe.close()
        except OSError:
            pass

    def close(self):
        with self.lock:
            self._stop()


if __name__ == '__main__':
    raise SystemExit('Offline library candidate only; no broker/runtime launch entry is available')
