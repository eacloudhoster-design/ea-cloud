"""Private synthetic worker entry. No vendor API, terminal or broker entry point."""
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time


def install_guard():
    if any(name.split('.')[0].lower() == 'metatrader5' for name in sys.modules):
        raise ImportError('Vendor module already loaded')
    from wine_worker_entry import install_offline_guard
    install_offline_guard()
    # Only this trusted worker is allowed. No child process/terminal or UDP path.
    import subprocess
    def forbidden(*args, **kwargs):
        raise PermissionError('Simulation worker forbids native launch/network')
    subprocess.Popen = forbidden
    os.system = forbidden
    socket.socket.sendto = forbidden


def main():
    engine = None
    try:
        if sys.argv[1:] != ['--simulation-only']:
            return 64
        sys.dont_write_bytecode = True
        source = Path(__file__).resolve().parent
        sys.path.insert(0, str(source))
        install_guard()
        os.umask(0o077)
        allowed = ('PATH', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'LANG')
        env = {k: v for k, v in os.environ.items() if k in allowed}
        os.environ.clear()
        os.environ.update(env)
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
        from native_windows_candidate import NativeBootstrap, hashes, stop_active, private_tree, check_worker_protocol
        from windows_simulation_security import Win32Inspector, LinuxReferenceInspector, SOURCES
        from framed_stdio import FramedPipe
        from private_ipc import _unique, sign, verify
        from sdk_ipc_candidate import SimulationFaults
        from sdk_adapter_candidate import AdapterEngine
        pipe = FramedPipe(sys.stdin.buffer, sys.stdout.buffer)
        sys.stdout = sys.stderr
        data = json.loads(pipe.recv_bytes(), object_pairs_hook=_unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        boot = NativeBootstrap.model_validate(data)
        expected = 'windows' if sys.platform == 'win32' else 'linux-reference' if sys.platform == 'linux' else None
        if boot.backend != expected or boot.source_hashes != hashes() or boot.mock_stop is not True:
            return 65
        inspector = Win32Inspector() if boot.backend == 'windows' else LinuxReferenceInspector()
        private_tree(boot.root, inspector)
        check_worker_protocol(boot.root,boot.binding,boot.protocol,inspector)
        for name in SOURCES:
            inspector.check(source / name, private=False)
        if boot.faults.exit_before_ready:
            return 71
        factory=AdapterEngine
        if boot.protocol=='trade-history':
            from native_history_pipeline import HistoryWorkerEngine
            if boot.backend!='linux-reference':return 65
            factory=HistoryWorkerEngine
        engine = factory(boot.root, boot.binding, bytes.fromhex(boot.key),
            stop_checker=lambda: stop_active(boot.root, boot.binding, boot.backend),
            faults=SimulationFaults(before_send_ms=boot.faults.before_send_ms,
                                    crash_after_fill=boot.faults.crash_after_fill))
        if boot.faults.startup_delay_ms:
            time.sleep(boot.faults.startup_delay_ms / 1000)
        ready = dict(version=1, kind='simulation-ready', binding=boot.binding.digest(),
            challenge='0' * 64 if boot.faults.bad_challenge else boot.challenge,
            platform=sys.platform, python_sha256=hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest(),
            python_version=sys.version.split()[0], stopped=engine._stopped(), held=engine._held(), financial_execution=False)
        pipe.send_bytes(sign(ready, bytes.fromhex(boot.key), 'response'))
        if boot.faults.exit_after_ready:
            return 72
        while True:
            frame = pipe.recv_bytes()
            reply = engine.handle(frame)
            if boot.faults.disconnect_after_sync and verify(frame, bytes.fromhex(boot.key))['operation'] == 'sync':
                return 73
            if boot.faults.reply_delay_ms:
                time.sleep(boot.faults.reply_delay_ms / 1000)
            pipe.send_bytes(reply)
    except EOFError:
        return 0
    except Exception:
        return 70
    finally:
        if engine is not None:
            engine.close()


if __name__ == '__main__':
    raise SystemExit(main())
