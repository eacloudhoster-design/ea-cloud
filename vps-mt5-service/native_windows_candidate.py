"""Native Windows simulation candidate; no terminal, vendor SDK or live release.

Linux reference mode is explicit and tests behavior, never native Windows APIs.
The financial protocol and journal implementation remain the existing candidate.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import threading
import time
from contextlib import contextmanager, closing
from typing import Literal

from framed_stdio import Bootstrap, Ready, FramedPipe, EntryFaults, fixture_stop_active
from private_ipc import Binding, canonical, verify, result, _unique
from sdk_ipc_candidate import SimulationController, check_simulation, hold_after_transport_failure, wall_ms
from worker_state import StateLease
from windows_simulation_security import Win32Inspector, LinuxReferenceInspector, WindowsJob, SOURCES


_QUARANTINE = set()  # Retain handles/ownership when startup cleanup cannot be proven.

def hashes():
    root = Path(__file__).resolve().parent
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in SOURCES}


class NativeBootstrap(Bootstrap):
    backend: Literal['windows', 'linux-reference']


def private_tree(root, inspector):
    inspector.check(root, anchor=True)
    entries = list(Path(root).rglob('*'))
    if len(entries) > 128:
        raise ValueError('Bounded private fixture required')
    for path in entries:
        inspector.check(path)


@contextmanager
def open_lifecycle(root, inspector, *, create=False):
    private_tree(root, inspector)
    path = Path(root) / 'native-lifecycle.sqlite3'
    if create:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
    inspector.check(path)
    db = sqlite3.connect(path, timeout=.1)
    db.execute('PRAGMA synchronous=FULL')
    try:
        with db:
            yield db
    finally:
        db.close()


def stop_active(root, binding, backend):
    """Only account-bound synthetic stop metadata; never maps or clears host gates."""
    try:
        if backend not in ('windows', 'linux-reference'):
            return True
        inspector = Win32Inspector() if backend == 'windows' else LinuxReferenceInspector()
        private_tree(root, inspector)
        path = Path(root) / 'mock-stop.json'
        before = path.stat()
        if not path.is_file() or before.st_size > 1024:
            return True
        with open_lifecycle(root, inspector) as db:
            state = db.execute('SELECT binding,active,held FROM native_state WHERE id=1').fetchone()
            db.execute('SELECT event,binding,observed_ms,pid FROM native_audit LIMIT 1')
            if not state or state[0] != binding.digest() or state[1] != 1 or state[2]:
                return True
        stopped = fixture_stop_active(root, binding)
        after = path.stat()
        if (before.st_ino, before.st_dev, before.st_mtime_ns, before.st_size) != (
                after.st_ino, after.st_dev, after.st_mtime_ns, after.st_size):
            return True
        private_tree(root, inspector)
        return stopped
    except Exception:
        return True


class View:
    def __init__(self, launcher):
        self.launcher = launcher

    @property
    def pid(self):
        return self.launcher.child.pid

    def is_alive(self):
        return not self.launcher.quiesced


class NativeWindowsSimulation(SimulationController):
    @classmethod
    def linux_reference(cls, *args, **kwargs):
        return cls(*args, _reference=True, **kwargs)

    def __init__(self, root, binding, key, *, timeout=3., startup_timeout=10.,
                 shutdown_timeout=2., faults=None, _reference=False):
        if (_reference and sys.platform != 'linux') or (not _reference and sys.platform != 'win32'):
            raise ValueError('Native Windows required; Linux reference must be selected explicitly')
        if sys.version_info[:2] != (3, 12) or sys.maxsize <= 2**32:
            raise ValueError('Pinned CPython 3.12 x64 candidate required')
        for value, maximum in ((timeout, 5), (startup_timeout, 30), (shutdown_timeout, 5)):
            if type(value) not in (int, float) or not .05 <= value <= maximum:
                raise ValueError('Bounded lifecycle timeout required')
        if type(key) is not bytes or len(key) != 32:
            raise ValueError('32-byte private IPC key required')
        self.binding = Binding.model_validate(binding)
        self.backend = 'linux-reference' if _reference else 'windows'
        self.inspector = LinuxReferenceInspector() if _reference else Win32Inspector()
        self.root = Path(root).absolute()
        private_tree(self.root, self.inspector)
        check_simulation(self.root, self.binding)
        lifecycle = self.root / 'native-lifecycle.sqlite3'
        if lifecycle.exists():
            # Never recreate lost/corrupt lifecycle authorization on recovery.
            with closing(sqlite3.connect(lifecycle.as_uri() + '?mode=ro', uri=True, timeout=.1)) as db:
                row = db.execute('SELECT binding,active,held FROM native_state WHERE id=1').fetchone()
                db.execute('SELECT event,binding,observed_ms,pid FROM native_audit LIMIT 1')
                if not row or row[0] != self.binding.digest() or row[1] not in (0, 1) or row[2] not in (0, 1):
                    raise ValueError('Existing lifecycle metadata is not trustworthy')
        elif any((self.root / name).exists() for name in ('observer.sqlite3', 'simulated-broker.sqlite3')):
            raise ValueError('Existing journal requires offline lifecycle verification')
        self.source = Path(__file__).resolve().parent
        for name in SOURCES:
            self.inspector.check(self.source / name, private=False)
        self.inspector.check(self.source, private=False)
        self.python = Path(sys.executable).resolve()
        if not _reference:
            # Inspect the whole application-local runtime, including DLLs/site hooks.
            for path in (self.python.parent, *self.python.parent.rglob('*')):
                self.inspector.check(path, private=False)
        self.key, self.timeout = key, timeout
        self.startup_timeout, self.shutdown_timeout = startup_timeout, shutdown_timeout
        self.controller, self.epoch, self.token = secrets.token_hex(16), 0, ''
        self.lock = threading.RLock()
        self.failed = self.closed = False
        self.quiesced = True
        self.child = self.pipe = self.job = None
        self.owner = StateLease(self.root / 'native-controller')
        self.owner.acquire()
        try:
            self._begin()
            self._audit('STARTING')
            if not _reference:
                self.job = WindowsJob()
            env = dict(PATH=str(self.python.parent), LANG='C.UTF-8', PYTHONDONTWRITEBYTECODE='1')
            if not _reference:
                # Windows loader needs SystemRoot; verify the fixed OS directory.
                env['SystemRoot'] = self.inspector.system_root()
            env.update(TEMP=str(self.root), TMP=str(self.root), HOME=str(self.root))
            self.child = subprocess.Popen([str(self.python), '-I', '-u',
                str(self.source / 'native_windows_worker.py'), '--simulation-only'],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                env=env, cwd=self.root, close_fds=True, bufsize=0)
            self.quiesced = False
            if self.job:
                self.job.attach(self.child)
            self.process = View(self)
            self.pipe = FramedPipe(self.child.stdout, self.child.stdin)
            challenge = secrets.token_hex(32)
            boot = NativeBootstrap(version=1, binding=self.binding, root=str(self.root), key=key.hex(),
                challenge=challenge, source_hashes=hashes(), mock_stop=True,
                backend=self.backend, faults=EntryFaults.model_validate(faults or {}))
            frames, errors = [], []
            def exchange():
                try:
                    self.pipe.send_bytes(canonical(boot.model_dump()))
                    frames.append(self.pipe.recv_bytes())
                except Exception:
                    errors.append(True)
            thread = threading.Thread(target=exchange, daemon=True)
            thread.start()
            thread.join(startup_timeout)
            if thread.is_alive() or errors or not frames:
                raise ValueError('Readiness unavailable')
            ready = Ready.model_validate(verify(frames[0], key, 'response'))
            if (ready.challenge != challenge or ready.binding != self.binding.digest()
                    or ready.platform != sys.platform
                    or ready.python_sha256 != hashlib.sha256(self.python.read_bytes()).hexdigest()):
                raise ValueError('Readiness identity mismatch')
            self.ready = ready
            self._audit('READY')
        except Exception:
            self.failed = True
            self._hold()
            self._stop()
            if self.quiesced:
                try:
                    self._persist_transport_hold()
                except Exception:
                    pass  # Failure remains explicit; active/held state is never cleared.
                self._release()
            else:
                _QUARANTINE.add(self)
            raise ValueError('Native simulation startup refused; sticky holds preserved') from None

    def _begin(self):
        with open_lifecycle(self.root, self.inspector, create=not (self.root / 'native-lifecycle.sqlite3').exists()) as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS native_state(
                id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL,active INTEGER NOT NULL,held INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS native_audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,
                binding TEXT NOT NULL,observed_ms INTEGER NOT NULL,pid INTEGER);''')
            state = db.execute('SELECT binding,active,held FROM native_state WHERE id=1').fetchone()
            if state and state[0] != self.binding.digest():
                raise ValueError('Lifecycle tenant/account conflict')
            if state:
                # Interrupted controller recovery creates a sticky hold; never clears one.
                db.execute('UPDATE native_state SET held=MAX(held,active),active=1 WHERE id=1')
            else:
                db.execute('INSERT INTO native_state VALUES(1,?,1,0)', [self.binding.digest()])

    def _audit(self, event):
        if event not in {'STARTING', 'READY', 'IPC', 'STOPPED', 'STOP_UNCONFIRMED', 'HELD'}:
            raise ValueError('Static audit event required')
        with open_lifecycle(self.root, self.inspector) as db:
            if db.execute('SELECT COUNT(*) FROM native_audit').fetchone()[0] >= 10000:
                raise ValueError('Audit capacity exhausted')
            db.execute('INSERT INTO native_audit(event,binding,observed_ms,pid) VALUES(?,?,?,?)',
                       [event, self.binding.digest(), wall_ms(), self.child.pid if self.child else None])

    def _hold(self):
        try:
            with open_lifecycle(self.root, self.inspector) as db:
                changed = db.execute('UPDATE native_state SET held=1 WHERE id=1').rowcount
                if changed != 1:
                    raise ValueError('Missing lifecycle hold record')
            return True
        except Exception:
            self.failed = True  # An unreadable/missing state remains stopped in the worker.
            return False

    def _persist_transport_hold(self):
        if not self._hold():
            raise ValueError('Lifecycle hold write unconfirmed')
        if not self.quiesced:
            raise ValueError('Quiescence unconfirmed')
        try:
            hold_after_transport_failure(self.root, self.binding)
            self._audit('HELD')
        except Exception:
            self.failed = True
            raise ValueError('Observer hold/audit write unconfirmed') from None

    def request(self, *args, **kwargs):
        with self.lock:
            if self.closed or self.failed:
                return result('UNAVAILABLE', uncertain=True)
            try:
                private_tree(self.root, self.inspector)
                self._audit('IPC')
            except Exception:
                self.failed = True
                self._hold()
                self._stop()
                return result('SECURITY_OR_AUDIT_FAILED', uncertain=True)
            return super().request(*args, **kwargs)

    def _stop(self):
        if self.closed:
            return
        if self.failed:
            self._hold()
        if self.child:
            if self.child.poll() is not None and not self.quiesced:
                self.failed = True
                self._hold()
            if not self.failed and self.child.poll() is None:
                try:
                    self.child.stdin.close()
                    self.child.wait(timeout=self.shutdown_timeout)
                except (OSError, subprocess.SubprocessError):
                    self.failed = True
                    self._hold()
            if self.child.poll() not in (None, 0):
                self.failed = True
                self._hold()
            for method in (self.child.terminate, self.child.kill):
                if self.child.poll() is None:
                    try:
                        method()
                        self.child.wait(timeout=self.shutdown_timeout)
                    except (OSError, subprocess.SubprocessError):
                        pass
            if self.job:
                try:
                    self.job.terminate()
                except OSError:
                    self.failed = True
            self.quiesced = self.child.poll() is not None and (self.job is None or self.job.empty())
            if self.pipe and self.quiesced:
                self.pipe.close()
        if not self.quiesced:
            self.failed = True
            self._hold()
            _QUARANTINE.add(self)
        try:
            self._audit('STOPPED' if self.quiesced else 'STOP_UNCONFIRMED')
        except Exception:
            self.failed = True
            self._hold()
        if self.failed and self.quiesced:
            try:
                self._persist_transport_hold()
            except Exception:
                pass  # request's shared failure path separately reports an unrecorded hold.

    def _release(self):
        if self.closed:
            return
        if self.quiesced:
            if not self.failed:
                try:
                    with open_lifecycle(self.root, self.inspector) as db:
                        db.execute('UPDATE native_state SET active=0 WHERE id=1')
                except Exception:
                    self.failed = True
                    self._hold()
            if self.job:
                self.job.close()
            self.owner.close()
            self.closed = True
            _QUARANTINE.discard(self)

    def close(self):
        with self.lock:
            self._stop()
            self._release()
            return self.quiesced
