"""Explicit real-Wine acceptance job; never silently skips a missing runtime.

Run in a disposable network-disabled container. See the development report.
No MetaTrader5 package, broker connection, terminal or real order is involved.
"""
import json
import os
import secrets
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_ipc import Binding, canonical
from sdk_ipc_candidate import CandidateEngine, prepare_simulation, wall_ms
from framed_stdio import EntryFaults
from wine_bridge import WineBridge, Runtime, prepare_prefix, wine_path


class WineAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = Runtime('wine', Path(os.environ['EA_WINDOWS_PYTHON']),
                              Path(os.environ['EA_WINE_EXE']), Path(os.environ['EA_WINESERVER']))
        cls.runtime.validate()
        cls.binding = Binding(simulation=True, tenant='wine-fixture', account='client-fixture',
                              broker='justmarkets', login=1, server='SimulationOnly')
        cls.template_dir = tempfile.TemporaryDirectory(prefix='ea-wine-template-')
        cls.addClassCleanup(cls.template_dir.cleanup)
        cls.template = Path(cls.template_dir.name) / 'prefix'
        prepare_prefix(cls.template, cls.binding)
        cls.addClassCleanup(cls.stop_prefix, cls.template)
        env = cls.environment(cls.template)
        # Explicitly prepare this new marked fixture; the bridge never bootstraps a prefix.
        boot = subprocess.run([str(cls.runtime.wine), wine_path(cls.runtime.python), '-c', 'pass'],
                              env=env, capture_output=True, timeout=45)
        if boot.returncode:
            raise RuntimeError('Isolated Wine/Python fixture preparation failed: exit=' + str(boot.returncode))
        cls.stop_prefix(cls.template)

    @classmethod
    def environment(cls, prefix):
        return dict(PATH='/usr/bin:/bin', LANG='C.UTF-8', HOME=str(prefix),
                    WINEPREFIX=str(prefix), WINEARCH='win64', WINEDEBUG='-all',
                    WINEDLLOVERRIDES='mscoree,mshtml=d')

    @classmethod
    def stop_prefix(cls, prefix):
        for op in ('-k', '-w'):
            subprocess.run([str(cls.runtime.wineserver), op], env=cls.environment(prefix),
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=5, check=(op == '-w'))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ea-wine-acceptance-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'state'
        self.prefix = Path(self.temp.name) / 'prefix'
        shutil.copytree(self.template, self.prefix, symlinks=True)
        self.prefix.chmod(0o700)
        prepare_simulation(self.root, self.binding)
        self.key = secrets.token_bytes(32)
        self.bridges = []
        self.addCleanup(self.cleanup_runtime)

    def cleanup_runtime(self):
        for bridge in self.bridges:
            bridge.close()
        self.stop_prefix(self.prefix)

    def bridge(self, mock_stop=False, **kwargs):
        bridge = WineBridge(self.root, self.prefix, self.binding, self.key, self.runtime,
                            startup_timeout=20, shutdown_timeout=3, mock_stop=mock_stop, **kwargs)
        self.bridges.append(bridge)
        return bridge

    def acquire(self, bridge):
        reply = bridge.request('acquire')
        self.assertEqual(reply['code'], 'LEASED', reply)

    def mock_stop(self, active):
        now = wall_ms()
        tmp = self.root / 'mock-stop.tmp'
        tmp.write_bytes(canonical(dict(simulation=True, binding=self.binding.digest(), stopped=active,
                                        observed_ms=now, expires_ms=now + 3000)))
        tmp.chmod(0o600)
        tmp.replace(self.root / 'mock-stop.json')

    def target(self, revision=1):
        return dict(login=1, server='SimulationOnly', sourceKey='a' * 64, revision=revision,
                    symbol='EURUSD', target=.1, sl=0., tp=0., maxVolume=1.)

    def fills(self):
        with sqlite3.connect(self.root / 'simulated-broker.sqlite3') as db:
            return db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def test_signed_win32_handshake_and_default_emergency_stop(self):
        bridge = self.bridge()
        self.assertEqual(bridge.ready.platform, 'win32')
        self.assertTrue(bridge.ready.python_version.startswith('3.12.'))
        self.assertFalse(bridge.ready.financial_execution)
        self.acquire(bridge)
        self.assertTrue(bridge.request('status')['data']['stopped'])
        self.assertEqual(bridge.request('sync', self.target())['code'], 'STOPPED')
        self.assertEqual(self.fills(), 0)

    def test_mock_sdk_receipt_and_restart_idempotency(self):
        bridge = self.bridge(mock_stop=True)
        self.acquire(bridge)
        self.mock_stop(False)
        request_id = secrets.token_hex(16)
        first = bridge.request('sync', self.target(), request_id=request_id)
        self.assertTrue(first['success'], first)
        bridge.close()
        bridge = self.bridge(mock_stop=True)
        self.acquire(bridge)
        self.mock_stop(False)
        self.assertEqual(bridge.request('sync', self.target(), request_id=request_id), first)
        self.assertEqual(self.fills(), 1)

    def test_native_windows_and_linux_ownership_are_both_fenced(self):
        bridge = self.bridge()
        with self.assertRaises(ValueError):
            CandidateEngine(self.root, self.binding, self.key, stop_checker=lambda: False)
        code = ("import sys;sys.path.insert(0," + repr(wine_path(Path(__file__).resolve().parents[1])) + ");"
                "from worker_state import StateLease\n"
                "try:\n StateLease(" + repr(wine_path(self.root / 'observer.sqlite3')) + ").acquire();print('UNSAFE')\n"
                "except ValueError:print('LOCKED')\n")
        probe = subprocess.run([str(self.runtime.wine), wine_path(self.runtime.python), '-c', code],
                               env=bridge.environment, capture_output=True, timeout=5)
        self.assertEqual(probe.returncode, 0)
        self.assertEqual(probe.stdout.strip(), b'LOCKED')

    def test_win32_crash_hold_survives_stop_and_restart(self):
        bridge = self.bridge(mock_stop=True, faults=EntryFaults(crash_after_fill=True))
        self.acquire(bridge)
        self.mock_stop(False)
        self.assertTrue(bridge.request('sync', self.target())['uncertain'])
        self.assertEqual(self.fills(), 1)
        bridge.close()
        bridge = self.bridge(mock_stop=True)
        self.acquire(bridge)
        self.mock_stop(True)
        self.assertTrue(bridge.request('status')['data']['held'])
        self.mock_stop(False)
        self.assertEqual(bridge.request('sync', self.target(2))['code'], 'HELD')
        self.assertEqual(self.fills(), 1)

    def test_win32_timeout_and_prefix_quiescence(self):
        bridge = self.bridge(mock_stop=True, faults=EntryFaults(before_send_ms=1000))
        self.acquire(bridge)
        self.mock_stop(False)
        bridge.timeout = .1
        self.assertTrue(bridge.request('sync', self.target())['uncertain'])
        self.assertTrue(bridge.quiesced)
        self.assertFalse(bridge.process.is_alive())
        self.assertTrue((self.root / 'bridge-stop.json').exists())

    def test_prefix_scoped_shutdown_preserves_other_worker(self):
        first = self.bridge()
        other_root = Path(self.temp.name) / 'second-state'
        other_prefix = Path(self.temp.name) / 'second-prefix'
        shutil.copytree(self.template, other_prefix, symlinks=True)
        other_prefix.chmod(0o700)
        prepare_simulation(other_root, self.binding)
        other = WineBridge(other_root, other_prefix, self.binding, secrets.token_bytes(32), self.runtime,
                           startup_timeout=20, shutdown_timeout=3)
        self.bridges.append(other)
        first.close()
        self.acquire(other)
        self.assertEqual(other.request('status')['code'], 'STATUS')
        other.close()
        self.stop_prefix(other_prefix)


if __name__ == '__main__':
    unittest.main(verbosity=2)
