"""Isolated, simulation-only Linux -> Wine stdio bridge; never launches MT5."""
import hashlib
import json
import os
import re
import secrets
import signal
import stat
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from framed_stdio import Bootstrap, EntryFaults, Ready, FramedPipe, source_hashes, SOURCE_FILES
from private_ipc import Binding, canonical, verify, result
from sdk_ipc_candidate import (SimulationController, check_simulation, _safe_root, wall_ms,
                               hold_after_transport_failure, record_transport_hold)
from worker_state import StateLease


def wine_path(value):
    path = Path(value)
    if not path.is_absolute() or '..' in path.parts or path.resolve() != path:
        raise ValueError('Canonical absolute path required')
    reserved = {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}
    for part in path.parts[1:]:
        if (any(ord(c) < 32 or c in '<>"|?*:\\' for c in part) or part.endswith(('.', ' '))
                or part.split('.')[0].upper() in reserved):
            raise ValueError('Ambiguous Windows path')
    return 'Z:' + str(path).replace('/', '\\')


def trusted_file(value, header=None, executable=False):
    path = Path(value)
    if not path.is_absolute() or path.resolve() != path or path.is_symlink():
        raise ValueError('Canonical file required')
    meta = path.stat()
    if not stat.S_ISREG(meta.st_mode) or meta.st_uid not in (0, os.getuid()) or meta.st_mode & 0o022:
        raise ValueError('Untrusted file permissions')
    if executable and not os.access(path, os.X_OK):
        raise ValueError('Executable required')
    if header:
        with path.open('rb') as stream:
            if stream.read(len(header)) != header:
                raise ValueError('Wrong runtime format')
    return path


def prepare_prefix(prefix, binding):
    """Create a marker only in a new empty simulation prefix; does not run Wine."""
    binding = Binding.model_validate(binding)
    path = Path(prefix)
    path.mkdir(mode=0o700, parents=False, exist_ok=True)
    path = _safe_root(path)
    if any(path.iterdir()):
        raise ValueError('Prefix preparation requires an empty directory')
    fd = os.open(path / 'simulation-prefix.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(canonical(dict(simulation=True, binding=binding.digest())))
        stream.flush()
        os.fsync(stream.fileno())


@dataclass(frozen=True)
class Runtime:
    kind: str
    python: Path
    wine: Path | None = None
    wineserver: Path | None = None

    @classmethod
    def reference(cls):
        # Explicit Linux fixture, not evidence of Windows/Wine compatibility.
        return cls('reference', Path(sys.executable).resolve())

    def validate(self):
        if sys.platform != 'linux':
            raise ValueError('Linux controller required')
        if self.kind == 'reference':
            if Path(self.python) != Path(sys.executable).resolve() or self.wine or self.wineserver:
                raise ValueError('Reference fixture must use this interpreter')
            # Managed sandboxes may map immutable system files to nobody. Only
            # this exact already-running interpreter gets the reference exception.
            meta = self.python.stat()
            if not stat.S_ISREG(meta.st_mode) or meta.st_mode & 0o022 or not os.access(self.python, os.X_OK):
                raise ValueError('Untrusted reference interpreter')
            with self.python.open('rb') as stream:
                if stream.read(4) != b'\x7fELF':
                    raise ValueError('Native reference interpreter required')
        elif self.kind == 'wine':
            trusted_file(self.python, b'MZ')
            trusted_file(self.wine, b'\x7fELF', True)
            trusted_file(self.wineserver, b'\x7fELF', True)
            wine_path(self.python)
        else:
            raise ValueError('Unsupported simulation runtime')


class ProcessView:
    def __init__(self, bridge):
        self.bridge = bridge

    @property
    def pid(self):
        return self.bridge.child.pid

    def is_alive(self):
        b = self.bridge
        return b.child.poll() is None or not b.quiesced


class WineBridge(SimulationController):
    protocol = 'absolute-target'
    """Reuse the existing controller's validation, leases, deadlines and failure policy."""
    def __init__(self, root, prefix, binding, key, runtime, *, startup_timeout=15.,
                 shutdown_timeout=2., timeout=3., mock_stop=False, faults=None):
        for value, high in ((startup_timeout, 30), (shutdown_timeout, 5), (timeout, 5)):
            if type(value) not in (int, float) or not .05 <= value <= high:
                raise ValueError('Bounded startup/shutdown/request timeout required')
        if type(key) is not bytes or len(key) != 32 or type(mock_stop) is not bool:
            raise ValueError('Explicit fixture mode and 32-byte IPC key required')
        runtime.validate()
        self.binding = Binding.model_validate(binding)
        self.root = check_simulation(root, self.binding)
        history_present=os.path.lexists(self.root/'history-worker.json') or os.path.lexists(self.root/'history-authority')
        if history_present != (self.protocol=='trade-history-wine'):
            raise ValueError('Wine bridge protocol mismatch')
        self.prefix = _safe_root(prefix)
        if self.root == self.prefix:
            raise ValueError('Separate state directory and prefix required')
        marker = trusted_file(self.prefix / 'simulation-prefix.json')
        if marker.read_bytes() != canonical(dict(simulation=True, binding=self.binding.digest())):
            raise ValueError('Prefix identity mismatch')
        self.source = Path(__file__).resolve().parent
        for name in SOURCE_FILES:
            trusted_file(self.source / name)
        if runtime.kind == 'wine':
            wine_path(self.source)
            wine_path(self.root)
            wine_path(self.prefix)
            if not (self.prefix / 'drive_c').is_dir() or not (self.prefix / 'dosdevices/z:').is_symlink():
                raise ValueError('Explicitly initialized isolated Wine prefix required')
            if os.readlink(self.prefix / 'dosdevices/z:') != '/':
                raise ValueError('Unexpected Wine Z mapping')
        self.runtime, self.key, self.timeout = runtime, key, timeout
        self.startup_timeout, self.shutdown_timeout = startup_timeout, shutdown_timeout
        self.controller, self.epoch, self.token = secrets.token_hex(16), 0, ''
        self.lock, self.failed, self.audit_failed = threading.RLock(), False, False
        self.closed = False
        self.child = self.pipe = None
        self.launch_attempted = False
        self.launched, self.quiesced = False, True
        self.prefix_owner = StateLease(self.prefix / 'bridge')
        self.bridge_owner = StateLease(self.root / 'bridge')
        self.linux_owner = StateLease(self.root / 'observer.sqlite3') if runtime.kind == 'wine' else None
        self.prefix_owner.acquire()
        try:
            self.bridge_owner.acquire()
            if self.linux_owner:
                # Linux flock fences Linux controllers. The Windows child retains
                # its native msvcrt journal lock; neither lock is treated as the other.
                self.linux_owner.acquire()
            self.environment = dict(PATH='/usr/bin:/bin', LANG='C.UTF-8', HOME=str(self.prefix),
                WINEPREFIX=str(self.prefix), WINEARCH='win64', WINEDEBUG='-all',
                WINEDLLOVERRIDES='mscoree,mshtml=d')
            if runtime.kind == 'wine':
                # Never kill a previously active prefix as part of startup.
                self._server('-w', min(3., startup_timeout))
            self._audit('STARTING')
            entry = self.source / 'wine_worker_entry.py'
            command = ([str(runtime.wine), wine_path(runtime.python), '-u', wine_path(entry)]
                       if runtime.kind == 'wine' else [str(runtime.python), '-u', str(entry)])
            command.append('--simulation-stdio-worker')
            self.launch_attempted = True
            diagnostics=None
            try:
                if self.protocol=='trade-history-wine':
                    fd=os.open(self.root/'wine-worker-errors.jsonl',os.O_WRONLY|os.O_APPEND|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
                    diagnostics=os.fdopen(fd,'ab')
                    meta=os.fstat(fd)
                    if not stat.S_ISREG(meta.st_mode) or meta.st_uid!=os.getuid() or meta.st_mode&0o077 or meta.st_size>65536:
                        raise ValueError('Private diagnostic capacity/permissions unavailable')
                self.child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=diagnostics if diagnostics else subprocess.DEVNULL, env=self.environment, cwd=self.prefix,
                    start_new_session=True, close_fds=True, bufsize=0, umask=0o077)
            finally:
                if diagnostics:diagnostics.close()
            self.launched, self.quiesced = True, False
            self.process = ProcessView(self)
            self.pipe = FramedPipe(self.child.stdout, self.child.stdin)
            challenge = secrets.token_hex(32)
            bootstrap = Bootstrap(version=1, protocol=self.protocol, binding=self.binding,
                root=wine_path(self.root) if runtime.kind == 'wine' else str(self.root),
                key=key.hex(), challenge=challenge, source_hashes=source_hashes(self.source),
                mock_stop=mock_stop, faults=EntryFaults.model_validate(faults or {}))
            frames, errors = [], []
            def handshake():
                try:
                    self.pipe.send_bytes(canonical(bootstrap.model_dump()))
                    frames.append(self.pipe.recv_bytes())
                except Exception:
                    errors.append(True)
            thread = threading.Thread(target=handshake, daemon=True)
            thread.start()
            thread.join(startup_timeout)
            if thread.is_alive() or errors or not frames:
                raise ValueError('Bounded worker readiness failed')
            ready = Ready.model_validate(verify(frames[0], key, 'response'))
            expected_platform = 'win32' if runtime.kind == 'wine' else sys.platform
            if (ready.challenge != challenge or ready.binding != self.binding.digest()
                    or ready.platform != expected_platform
                    or ready.python_sha256 != hashlib.sha256(runtime.python.read_bytes()).hexdigest()):
                raise ValueError('Readiness identity mismatch')
            self.ready = ready
            self._audit('READY')
        except Exception:
            if not self.launch_attempted:
                # Known pre-launch refusal cannot have submitted work. Do not
                # stop or mark an existing controller/prefix belonging to someone else.
                if self.bridge_owner.stream:
                    try:
                        self._audit('STARTUP_REJECTED')
                    except Exception:
                        pass
                self._release_if_quiescent()
                raise ValueError('Simulation bridge preflight/ownership failed') from None
            self.failed = True
            self._sticky_hold()
            try:
                self._audit('STARTUP_FAILED')
            except Exception:
                self.audit_failed = True
            self._stop()
            if self.quiesced:
                try:
                    self._persist_transport_hold()
                except Exception:
                    pass  # Sticky marker is independently enforced by the candidate.
            self._release_if_quiescent()
            raise ValueError('Simulation bridge startup failed; inspect lifecycle/hold evidence') from None

    def _server(self, operation, timeout):
        subprocess.run([str(self.runtime.wineserver), operation], env=self.environment,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=timeout, check=True)

    def _audit(self, event):
        path = self.root / 'bridge-lifecycle.jsonl'
        flags = os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
        fd = os.open(path, flags, 0o600)
        try:
            meta = os.fstat(fd)
            if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or meta.st_mode & 0o077 or meta.st_size > 1048576:
                raise ValueError('Private audit capacity/permissions unavailable')
            record = canonical(dict(event=event, observed_ms=wall_ms(), binding=self.binding.digest(),
                                    pid=self.child.pid if self.child else None)) + b'\n'
            if os.write(fd, record) != len(record):
                raise OSError('Incomplete lifecycle audit')
            os.fsync(fd)
        finally:
            os.close(fd)
        self._sync_directory()

    def _sync_directory(self):
        fd = os.open(self.root, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def _sticky_hold(self):
        try:
            path = self.root / 'bridge-stop.json'
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(canonical(dict(simulation=True, binding=self.binding.digest(), held=True)))
                stream.flush()
                os.fsync(stream.fileno())
            self._sync_directory()
        except FileExistsError:
            pass  # Existing malformed/link/directory markers also remain stopped.
        except Exception:
            self.audit_failed = True

    def _persist_transport_hold(self):
        self._sticky_hold()
        if not self.quiesced:
            raise ValueError('Worker quiescence unconfirmed')
        if self.linux_owner and self.linux_owner.stream:
            record_transport_hold(self.root, self.binding)
        else:
            hold_after_transport_failure(self.root, self.binding)
        self._audit('TRANSPORT_HELD')

    def request(self, *args, **kwargs):
        with self.lock:
            if self.closed:
                return result('UNAVAILABLE', uncertain=True)
            if not self.failed:
                try:
                    self._audit('IPC_EXCHANGE')
                except Exception:
                    self.audit_failed = self.failed = True
                    self._sticky_hold()
                    self._stop()
                    return result('AUDIT_FAILED', uncertain=True)
            return super().request(*args, **kwargs)

    def _stop(self):
        if self.closed:
            return
        if self.failed:
            self._sticky_hold()
        if self.child is None:
            return  # Startup never touched a running Wine prefix.
        if not self.failed and self.child.poll() is None:
            try:
                self.child.stdin.close()  # Idle graceful EOF, never a replay/financial command.
                self.child.wait(timeout=self.shutdown_timeout)
            except (OSError, subprocess.TimeoutExpired):
                self.failed = True
                self._sticky_hold()
        for sig in (signal.SIGTERM, signal.SIGKILL):
            if self.child.poll() is None:
                try:
                    os.killpg(self.child.pid, sig)
                    self.child.wait(timeout=self.shutdown_timeout)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        self.quiesced = self.child.poll() is not None
        if self.launched and self.runtime.kind == 'wine':
            try:
                self._server('-k', self.shutdown_timeout)
            except (OSError, subprocess.SubprocessError):
                pass  # An already-exited server may reject -k; still require -w proof.
            try:
                self._server('-w', self.shutdown_timeout)
            except (OSError, subprocess.SubprocessError):
                self.quiesced = False
        if self.pipe:
            self.pipe.close()
        if not self.quiesced:
            self.failed = True
            self._sticky_hold()
        try:
            self._audit('STOPPED' if self.quiesced else 'STOP_UNCONFIRMED')
        except Exception:
            self.audit_failed = True
            self._sticky_hold()

    def _release_if_quiescent(self):
        if self.quiesced:
            if self.linux_owner:
                self.linux_owner.close()
            self.bridge_owner.close()
            self.prefix_owner.close()
            self.closed = True

    def close(self):
        with self.lock:
            self._stop()
            self._release_if_quiescent()
