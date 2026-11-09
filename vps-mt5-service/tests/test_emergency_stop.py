"""Offline stop-state regressions: temporary files and synthetic SDK objects only."""
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from demo_worker import DemoAccount, create_demo_app, emergency_stop_active
from execution_gates import MIRROR, mirrored_stop_active
from fastapi.testclient import TestClient
from test_observer_sync import Broker


class EmergencyStopTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.folder = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.root = self.folder / 'acceptance'
        self.root.mkdir(mode=0o700)
        original_lstat = Path.lstat

        def trusted_lstat(path, *args, **kwargs):
            metadata = original_lstat(path, *args, **kwargs)
            if path == self.root:
                # Model root ownership without chown or host stop-file access.
                values = list(metadata)
                values[4] = 0
                return os.stat_result(values)
            return metadata

        self.stack.enter_context(patch.object(Path, 'lstat', trusted_lstat))
        self.path_factory = self.stack.enter_context(patch(
            'demo_worker.Path', side_effect=lambda value: self.root
            if str(value) in ('/etc/ea-cloud/acceptance', r'Z:\etc\ea-cloud\acceptance')
            else Path(value)))
        self.mirror = self.stack.enter_context(patch(
            'execution_gates.mirrored_stop_active', return_value=True))

    def test_missing_directory_stays_stopped_even_with_clear_mirror(self):
        self.root.rmdir()
        for state in (True, False):
            with self.subTest(mirror=state):
                self.mirror.return_value = state
                self.assertTrue(emergency_stop_active())

    def test_each_active_latch_overrides_clear_mirror(self):
        self.mirror.return_value = False
        for name in ('XAUUSD.STOP', 'XAUUSD.CLEANUP_STOP'):
            with self.subTest(latch=name):
                stop = self.root / name
                stop.touch()
                self.assertTrue(emergency_stop_active())
                stop.unlink()

    def test_dangling_latch_symlink_is_stopped(self):
        (self.root / 'XAUUSD.STOP').symlink_to(self.folder / 'absent')
        self.mirror.return_value = False
        self.assertTrue(emergency_stop_active())

    def test_directory_at_latch_path_is_stopped(self):
        (self.root / 'XAUUSD.CLEANUP_STOP').mkdir()
        self.assertTrue(emergency_stop_active())

    def test_file_instead_of_acceptance_directory_is_stopped(self):
        self.root.rmdir()
        self.root.touch()
        self.mirror.return_value = False
        self.assertTrue(emergency_stop_active())

    def test_symlinked_acceptance_directory_is_stopped(self):
        self.root.rmdir()
        target = self.folder / 'target'
        target.mkdir()
        self.root.symlink_to(target, target_is_directory=True)
        self.assertTrue(emergency_stop_active())

    def test_untrusted_directory_owner_is_stopped(self):
        metadata = self.root.lstat()
        values = list(metadata)
        values[4] = 1234
        with patch.object(Path, 'lstat', return_value=os.stat_result(values)):
            self.assertTrue(emergency_stop_active())

    def test_group_or_world_writable_directory_is_stopped(self):
        for mode in (0o770, 0o707):
            with self.subTest(mode=mode):
                self.root.chmod(mode)
                self.assertTrue(emergency_stop_active())

    def test_trusted_readable_directory_with_no_latches_is_clear(self):
        (self.root / 'unrelated').touch()
        self.assertFalse(emergency_stop_active())
        self.mirror.assert_not_called()

    def test_permission_denied_uses_active_mirror(self):
        with patch.object(Path, 'iterdir', side_effect=PermissionError('fixture')):
            self.assertTrue(emergency_stop_active())
        self.mirror.assert_called_once_with(MIRROR)

    def test_permission_denied_can_use_verified_clear_mirror(self):
        self.mirror.return_value = False
        with patch.object(Path, 'iterdir', side_effect=PermissionError('fixture')):
            self.assertFalse(emergency_stop_active())
        self.mirror.assert_called_once_with(MIRROR)

    def test_unavailable_mirror_fails_closed(self):
        self.mirror.side_effect = lambda _: mirrored_stop_active(self.folder / 'unavailable.json')
        with patch.object(Path, 'iterdir', side_effect=PermissionError('fixture')):
            self.assertTrue(emergency_stop_active())

    def test_unknown_mirror_state_does_not_clear_stop(self):
        for value in (None, 0, '', {}):
            with self.subTest(value=value):
                self.mirror.return_value = value
                with patch.object(Path, 'iterdir', side_effect=PermissionError('fixture')):
                    self.assertTrue(emergency_stop_active())

    def test_real_mirror_missing_malformed_active_stale_and_recovery(self):
        file = self.folder / 'state.json'
        clock = [100]
        original_stat, original_fstat = Path.stat, os.fstat

        def root_owned(metadata):
            values = list(metadata)
            values[4] = 0
            return os.stat_result(values)

        def parent_stat(path, *args, **kwargs):
            metadata = original_stat(path, *args, **kwargs)
            return root_owned(metadata) if path == self.folder else metadata

        def read_mirror(_):
            # Only temporary fixture ownership is simulated; parse/TTL/path checks are real.
            with patch.object(Path, 'stat', parent_stat), patch(
                    'execution_gates.os.fstat', side_effect=lambda fd: root_owned(original_fstat(fd))):
                return mirrored_stop_active(file, now=clock[0])

        def publish(active):
            file.write_text(json.dumps(dict(observed_at=clock[0], expires_at=clock[0] + 3,
                                            stops_active=active)))

        self.mirror.side_effect = read_mirror
        with patch.object(Path, 'iterdir', side_effect=PermissionError('fixture')):
            self.assertTrue(emergency_stop_active())
            file.write_text('{malformed')
            self.assertTrue(emergency_stop_active())
            publish(True)
            self.assertTrue(emergency_stop_active())
            publish(False)
            self.assertFalse(emergency_stop_active())
            clock[0] += 4
            self.assertTrue(emergency_stop_active())
            publish(False)
            self.assertFalse(emergency_stop_active())
            file.unlink()
            self.assertTrue(emergency_stop_active())

    def test_mirror_read_errors_fail_closed(self):
        for error in (OSError('fixture'), ValueError('fixture'), TypeError('fixture')):
            with self.subTest(error=type(error).__name__):
                self.mirror.side_effect = error
                with patch.object(Path, 'iterdir', side_effect=PermissionError('fixture')):
                    self.assertTrue(emergency_stop_active())

    def test_windows_permission_fallback_keeps_fixed_mirror_path(self):
        with patch('demo_worker.sys.platform', 'win32'), patch.object(
                Path, 'iterdir', side_effect=PermissionError('fixture')):
            self.assertTrue(emergency_stop_active())
        self.assertEqual(str(self.mirror.call_args.args[0]), 'Z:' + str(MIRROR).replace('/', '\\'))

    def test_missing_directory_recovery_rechecks_both_latches(self):
        self.root.rmdir()
        self.assertTrue(emergency_stop_active())
        self.root.mkdir(mode=0o700)
        self.assertFalse(emergency_stop_active())
        stop = self.root / 'XAUUSD.CLEANUP_STOP'
        stop.touch()
        self.assertTrue(emergency_stop_active())
        stop.unlink()  # Temporary fixture only; never a host/production latch.
        self.assertFalse(emergency_stop_active())

    def test_directory_disappearing_during_read_is_stopped(self):
        def disappear(_):
            self.root.rmdir()
            return iter(())
        with patch.object(Path, 'iterdir', disappear):
            self.assertTrue(emergency_stop_active())

    def test_directory_replaced_during_read_is_stopped(self):
        def replace(_):
            self.root.rename(self.folder / 'previous')
            self.root.mkdir(mode=0o700)
            return iter(())
        with patch.object(Path, 'iterdir', replace):
            self.assertTrue(emergency_stop_active())

    def test_windows_missing_mapping_is_stopped(self):
        self.root.rmdir()
        with patch('demo_worker.sys.platform', 'win32'):
            self.assertTrue(emergency_stop_active())
        self.path_factory.assert_any_call(r'Z:\etc\ea-cloud\acceptance')

    def test_default_http_guard_blocks_missing_directory_before_sdk_use(self):
        self.root.rmdir()
        config = self.config()
        with TestClient(create_demo_app(config, NS(shutdown=lambda: None), 'fixture', 'a' * 64)) as client:
            response = client.post('/observer/sync-position', headers=self.headers(), json={})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()['submission_started'])
        self.assertFalse(response.json()['retriable'])

    def test_directory_loss_before_send_keeps_journal_held_after_recovery(self):
        broker = Broker()
        def connect(*args, **kwargs):
            if self.root.exists():
                self.root.rmdir()
            return True
        broker.initialize = connect
        broker.shutdown = lambda: None
        broker.account_info = lambda: NS(login=1, server='Synthetic', trade_mode=0,
                                        trade_allowed=True, margin_mode=2, equity=1000)
        broker.terminal_info = lambda: NS(connected=True, trade_allowed=True,
                                         path=r'C:\fixture', data_path=r'C:\fixture')
        broker.order_send = lambda _: self.fail('No SDK submission is permitted')
        config = self.config()
        body = dict(login=1, password='fixture', server='Synthetic', sourceKey='a' * 64,
                    revision=1, symbol='EURUSD.fixture', target=.01, sl=0, tp=0, maxVolume=1)
        with TestClient(create_demo_app(config, broker, 'fixture', 'a' * 64)) as client:
            response = client.post('/observer/sync-position', headers=self.headers(), json=body)
            self.assertTrue(response.json()['uncertain'])
            self.assertFalse(response.json()['success'])
            self.root.mkdir(mode=0o700)
            response = client.post('/observer/sync-position', headers=self.headers(), json=body)
            self.assertTrue(response.json()['uncertain'])
        with sqlite3.connect(config.journal_path) as db:
            self.assertEqual(db.execute('SELECT phase FROM allocations').fetchone()[0], 'dispatching')
        self.assertEqual(broker.sent, [])

    def config(self):
        return DemoAccount(broker='justmarkets', login=1, server='Synthetic',
                           terminal_path=r'C:\fixture\terminal64.exe',
                           journal_path=str(self.folder / 'journal.sqlite3'),
                           enabled=True, execution_approved=True)

    @staticmethod
    def headers():
        return {'Authorization': 'Bearer ' + 'a' * 64}
