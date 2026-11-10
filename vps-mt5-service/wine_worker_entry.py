"""Simulation-only binary stdio entry. No broker SDK or terminal launch path."""
import hashlib
import importlib.abc
import os
import socket
import sys
import time
from pathlib import Path


def install_offline_guard():
    class NoVendor(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname.split('.')[0].lower() == 'metatrader5':
                raise ImportError('Vendor SDK forbidden in simulation worker')
    sys.meta_path.insert(0, NoVendor())
    original = socket.socket.connect
    original_ex = socket.socket.connect_ex
    def connect(sock, address):
        if isinstance(address, tuple):
            raise PermissionError('Network forbidden in simulation worker')
        return original(sock, address)
    def connect_ex(sock, address):
        if isinstance(address, tuple):
            raise PermissionError('Network forbidden in simulation worker')
        return original_ex(sock, address)
    socket.socket.connect, socket.socket.connect_ex = connect, connect_ex


def main():
    engine = None
    try:
        if sys.argv[1:] != ['--simulation-stdio-worker']:
            return 64
        install_offline_guard()
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
        root = Path(__file__).resolve().parent
        sys.path.insert(0, str(root))
        from framed_stdio import FramedPipe, decode_bootstrap, source_hashes, fixture_stop_active
        from private_ipc import sign, verify
        from sdk_ipc_candidate import CandidateEngine, SimulationFaults
        pipe = FramedPipe(sys.stdin.buffer, sys.stdout.buffer)
        # stdout is exclusively framed bytes, including on Windows (no CRLF translation).
        sys.stdout = sys.stderr
        bootstrap = decode_bootstrap(pipe.recv_bytes())
        if bootstrap.source_hashes != source_hashes(root):
            return 65
        if bootstrap.faults.exit_before_ready:
            return 71
        checker = (lambda: fixture_stop_active(bootstrap.root, bootstrap.binding)) if bootstrap.mock_stop else None
        engine = CandidateEngine(bootstrap.root, bootstrap.binding, bytes.fromhex(bootstrap.key),
            stop_checker=checker, faults=SimulationFaults(
                before_send_ms=bootstrap.faults.before_send_ms,
                crash_after_fill=bootstrap.faults.crash_after_fill))
        if bootstrap.faults.startup_delay_ms:
            time.sleep(bootstrap.faults.startup_delay_ms / 1000)
        ready = dict(version=1, kind='simulation-ready', binding=bootstrap.binding.digest(),
            challenge='0' * 64 if bootstrap.faults.bad_challenge else bootstrap.challenge,
            platform=sys.platform, python_sha256=hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest(),
            python_version=sys.version.split()[0], held=engine._held(), stopped=engine._stopped(), financial_execution=False)
        pipe.send_bytes(sign(ready, bytes.fromhex(bootstrap.key), 'response'))
        if bootstrap.faults.exit_after_ready:
            return 72
        while True:
            frame = pipe.recv_bytes()
            response = engine.handle(frame)
            if bootstrap.faults.disconnect_after_sync and verify(frame, bytes.fromhex(bootstrap.key))['operation'] == 'sync':
                return 73
            if bootstrap.faults.reply_delay_ms:
                time.sleep(bootstrap.faults.reply_delay_ms / 1000)
            pipe.send_bytes(response)
    except EOFError:
        return 0
    except Exception:
        return 70  # No raw request, bootstrap key or arbitrary exception text is emitted.
    finally:
        if engine is not None:
            engine.close()


if __name__ == '__main__':
    raise SystemExit(main())
