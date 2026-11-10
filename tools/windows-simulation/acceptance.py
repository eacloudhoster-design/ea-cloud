"""Native-only synthetic acceptance. Never imports a vendor SDK or starts MT5."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import secrets
import sqlite3
import sys
import unittest

REPO = Path(__file__).resolve().parents[2]
SERVICE = REPO / 'vps-mt5-service'
EXPECTED = 6


def native_host():
    if sys.platform != 'win32' or os.name != 'nt':
        raise RuntimeError('Native Microsoft Windows required; Linux is not acceptance')
    import ctypes
    # Wine exposes win32 too. Reject its native compatibility entry explicitly.
    if hasattr(ctypes.WinDLL('ntdll'), 'wine_get_version'):
        raise RuntimeError('Wine is not native Windows acceptance')
    if platform.python_implementation() != 'CPython' or sys.version_info[:3] != (3, 12, 10) or sys.maxsize <= 2**32:
        raise RuntimeError('Fixture requires CPython 3.12.10 x64')
    return dict(platform=sys.platform, windows=list(sys.getwindowsversion()),
                python=platform.python_version(), machine=platform.machine())


def install_guard():
    if any(name.split('.')[0].lower() == 'metatrader5' for name in sys.modules):
        raise RuntimeError('Preloaded vendor SDK refused')
    sys.path.insert(0, str(SERVICE))
    from wine_worker_entry import install_offline_guard
    install_offline_guard()
    import socket
    def forbidden(*args, **kwargs):
        raise PermissionError('Offline acceptance forbids UDP')
    socket.socket.sendto = forbidden


def load_components():
    global NativeWindowsSimulation, Binding, canonical, sign, verify, Envelope, prepare_simulation, wall_ms
    from native_windows_candidate import NativeWindowsSimulation
    from private_ipc import Binding, canonical, sign, verify, Envelope
    from sdk_ipc_candidate import prepare_simulation, wall_ms


def dependency_versions():
    from importlib.metadata import version, PackageNotFoundError
    lock = json.loads((REPO / 'tools/wine-simulation/runtime.lock.json').read_text())
    versions = {}
    for entry in lock['artifacts']:
        if entry['kind'] != 'windows-wheel':
            continue
        name, expected = Path(entry['path']).name.split('-')[:2]
        actual = version(name)
        if actual != expected:
            raise ValueError('Simulation dependency version mismatch')
        versions[name] = actual
    try:
        version('MetaTrader5')
    except PackageNotFoundError:
        return versions
    raise ValueError('Vendor distribution must be absent')


def validate_fixture_paths(state, evidence, inspector):
    if state == evidence or state in evidence.parents or evidence in state.parents:
        raise ValueError('Separate private fixture paths required')
    # Each account root needs a protected DACL, not merely inherited access.
    # Provision these offline in the VM; this runner never changes ACLs.
    names = unittest.defaultTestLoader.getTestCaseNames(NativeAcceptance)
    if {path.name for path in state.iterdir()} != set(names):
        raise ValueError('Preprovision the six empty protected scenario directories')
    for name in names:
        directory = state / name
        inspector.check(directory, anchor=True)
        if not directory.is_dir() or any(directory.iterdir()):
            raise ValueError('Existing scenario state must not be adopted')


class NativeAcceptance(unittest.TestCase):
    """Reuses the real candidate; no monkeypatched Win32 APIs in native runs."""
    parent = None
    launcher_factory = None

    def setUp(self):
        self.root = self.parent / self._testMethodName
        self.binding = Binding(simulation=True, tenant='native-acceptance', account='synthetic-client',
                               broker='justmarkets', login=1, server='SimulationOnly')
        self.key = secrets.token_bytes(32)
        prepare_simulation(self.root, self.binding)
        self.launchers = []
        self.addCleanup(self.shutdown)

    def shutdown(self):
        for launcher in reversed(self.launchers):
            self.assertTrue(launcher.close(), 'Worker quiescence unconfirmed')

    def launch(self, **kwargs):
        launcher = self.launcher_factory(self.root, self.binding, self.key, **kwargs)
        self.launchers.append(launcher)
        return launcher

    def mirror(self, active):
        # Explicit synthetic fixture only. Does not touch any host safety gate.
        now = wall_ms()
        path = self.root / 'mock-stop.tmp'
        path.write_bytes(canonical(dict(simulation=True, binding=self.binding.digest(), stopped=active,
                                      observed_ms=now, expires_ms=now + 3000)))
        path.chmod(0o600)
        path.replace(self.root / 'mock-stop.json')

    def target(self):
        return dict(login=1, server='SimulationOnly', sourceKey='a'*64, revision=1,
                    symbol='EURUSD', target=.1, sl=0., tp=0., maxVolume=1.)

    def fills(self):
        with sqlite3.connect(self.root / 'simulated-broker.sqlite3') as db:
            return db.execute('SELECT COUNT(*) FROM fills').fetchone()[0]

    def acquire(self, launcher):
        self.assertEqual(launcher.request('acquire')['code'], 'LEASED')

    def test_startup_stopped_and_private_status(self):
        launcher = self.launch()
        self.assertEqual(launcher.ready.platform, sys.platform)
        self.assertTrue(launcher.ready.stopped)
        self.assertFalse(launcher.ready.financial_execution)
        self.acquire(launcher)
        self.assertTrue(launcher.request('status')['success'])
        self.assertFalse(launcher.request('sync', self.target())['success'])
        self.assertEqual(self.fills(), 0)

    def test_conflicting_controller_and_account(self):
        launcher = self.launch()
        self.acquire(launcher)
        with self.assertRaises(ValueError):
            self.launch()
        wrong = self.target(); wrong['login'] = 2
        self.assertFalse(launcher.request('sync', wrong)['success'])
        self.assertTrue(launcher.request('status')['success'])
        self.assertEqual(self.fills(), 0)

    def test_authentication_and_replay(self):
        launcher = self.launch()
        now = wall_ms()
        envelope = Envelope(version=1, binding=self.binding.digest(), controller='a'*32,
                            request_id='b'*32, nonce='c'*64, issued_ms=now, deadline_ms=now+2000,
                            epoch=0, lease_token='', operation='acquire', body={})
        def exchange(frame):
            # Bounded exchange even for a broken pipe implementation.
            import threading
            replies = []
            def run():
                try:
                    launcher.pipe.send_bytes(frame)
                    replies.append(verify(launcher.pipe.recv_bytes(), self.key, 'response'))
                except Exception:
                    pass
            thread = threading.Thread(target=run, daemon=True); thread.start(); thread.join(3)
            if thread.is_alive() or len(replies) != 1:
                launcher.failed = True  # A failed acceptance exchange must retain a hold.
            self.assertFalse(thread.is_alive(), 'IPC deadline exceeded')
            self.assertEqual(len(replies), 1)
            return replies[0]['result']
        self.assertFalse(exchange(sign(envelope.model_dump(), secrets.token_bytes(32)))['success'])
        frame = sign(envelope.model_dump(), self.key)
        self.assertTrue(exchange(frame)['success'])
        self.assertFalse(exchange(frame)['success'])
        self.assertEqual(self.fills(), 0)

    def test_duplicate_request_after_clean_restart(self):
        launcher = self.launch(); self.acquire(launcher); self.mirror(False)
        self.assertTrue(launcher.request('sync', self.target(), request_id='d'*32)['success'])
        self.assertTrue(launcher.close())
        recovered = self.launch(); self.acquire(recovered); self.mirror(False)
        self.assertTrue(recovered.request('sync', self.target(), request_id='d'*32)['success'])
        self.assertEqual(self.fills(), 1)

    def test_active_stop_blocks_synthetic_execution(self):
        launcher = self.launch(); self.acquire(launcher); self.mirror(True)
        self.assertFalse(launcher.request('sync', self.target())['success'])
        self.assertEqual(self.fills(), 0)

    def test_crash_recovery_retains_hold(self):
        launcher = self.launch(faults=dict(crash_after_fill=True))
        self.acquire(launcher); self.mirror(False)
        self.assertFalse(launcher.request('sync', self.target())['success'])
        self.assertEqual(self.fills(), 1)
        self.assertTrue(launcher.close())
        recovered = self.launch(); self.acquire(recovered); self.mirror(False)
        self.assertFalse(recovered.request('sync', self.target())['success'])
        with sqlite3.connect(self.root / 'native-lifecycle.sqlite3') as db:
            self.assertEqual(db.execute('SELECT held FROM native_state').fetchone()[0], 1)
        self.assertEqual(self.fills(), 1)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-parent', required=True, type=Path)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--confirm-isolated-no-egress-vm', required=True, action='store_true')
    args = parser.parse_args(argv)
    # Never overwrite prior evidence or reuse an account's existing private state.
    if not args.evidence.is_dir() or args.evidence.is_symlink() or any(args.evidence.iterdir()):
        parser.error("Provide an existing empty private evidence directory")
    report = dict(mode='simulation-only', native_acceptance='blocked', expected=EXPECTED,
                  passed=0, failed=0, errors=0, blocked=EXPECTED, sdk_called=False, terminal_started=False)
    try:
        report['host'] = native_host()
        install_guard(); load_components()
        from windows_simulation_security import Win32Inspector
        from native_windows_candidate import hashes
        inspector = Win32Inspector()
        inspector.check(args.state_parent, anchor=True)
        inspector.check(args.evidence, anchor=True)
        state, evidence = args.state_parent.resolve(), args.evidence.resolve()
        validate_fixture_paths(state, evidence, inspector)
        report['dependencies'] = dependency_versions()
        report['source_hashes'] = hashes()
        report['runtime_lock_sha256'] = hashlib.sha256((REPO / 'tools/wine-simulation/runtime.lock.json').read_bytes()).hexdigest()
        report['runner_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        report['python_sha256'] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        NativeAcceptance.parent = args.state_parent
        NativeAcceptance.launcher_factory = staticmethod(NativeWindowsSimulation)
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(NativeAcceptance)
        if suite.countTestCases() != EXPECTED:
            raise ValueError('Acceptance count changed unexpectedly')
        log = io.StringIO()
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
        (args.evidence / 'acceptance.log').write_text(log.getvalue(), encoding='utf-8')
        report.update(passed=max(0,result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped)),
                      failed=len(result.failures), errors=len(result.errors),
                      blocked=EXPECTED-result.testsRun+len(result.skipped))
        report['native_acceptance'] = 'passed' if result.wasSuccessful() and report['passed']==EXPECTED else 'failed'
    except Exception as exc:
        report['blocker_type'] = type(exc).__name__  # No arbitrary credential-bearing exception text.
    finally:
        (args.evidence / 'results.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
    return 0 if report['native_acceptance']=='passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
