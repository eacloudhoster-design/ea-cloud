"""Offline cross-process stdio acceptance; reference runtime is explicitly Linux."""
import io
import json
import os
import secrets
import sqlite3
import struct
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_ipc import Binding, canonical, MAX_FRAME
from framed_stdio import FramedPipe, EntryFaults, fixture_stop_active, decode_bootstrap
from sdk_ipc_candidate import prepare_simulation, SimulationController, CandidateEngine, wall_ms
from wine_bridge import WineBridge, Runtime, prepare_prefix, wine_path, trusted_file


def sample_binding():
    return Binding(simulation=True, tenant='tenant-one', account='account-one',
                   broker='justmarkets', login=1, server='SimulationOnly')


def sample_target(**changes):
    return dict(dict(login=1, server='SimulationOnly', sourceKey='a' * 64, revision=1,
                     symbol='EURUSD', target=.1, sl=0., tp=0., maxVolume=1.), **changes)


class FramingTests(unittest.TestCase):
    def test_binary_roundtrip_preserves_crlf_nul_and_utf8(self):
        data = b'\x00\r\n' + 'Windows / Wine'.encode()
        stream = io.BytesIO()
        FramedPipe(None, stream).send_bytes(data)
        self.assertEqual(FramedPipe(io.BytesIO(stream.getvalue()), None).recv_bytes(), data)

    def test_fragmented_reads_and_writes(self):
        class Partial(io.BytesIO):
            def write(self, value):
                return super().write(value[:2])
            def read(self, count=-1):
                return super().read(min(count, 2))
        stream = Partial()
        FramedPipe(None, stream).send_bytes(b'fragmented')
        stream.seek(0)
        self.assertEqual(FramedPipe(stream, None).recv_bytes(), b'fragmented')

    def test_disconnect_truncated_and_invalid_size_frames(self):
        for frame in (b'', b'\x00', struct.pack('!I', 3) + b'x', struct.pack('!I', 0),
                      struct.pack('!I', MAX_FRAME + 1)):
            with self.subTest(frame=frame), self.assertRaises((EOFError, ValueError)):
                FramedPipe(io.BytesIO(frame), None).recv_bytes()
        with self.assertRaises(ValueError):
            FramedPipe(None, io.BytesIO()).send_bytes(b'x' * (MAX_FRAME + 1))

    def test_windows_paths_spaces_and_ambiguous_names(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'Space folder' / 'python.exe'
            self.assertEqual(wine_path(path), 'Z:' + str(path).replace('/', '\\'))
            for name in ('CON', 'aux.txt', 'LPT1', 'trailing.', 'trailing ', 'a:b', 'a\\b', 'bad\nfile'):
                with self.subTest(name=name), self.assertRaises(ValueError):
                    wine_path(root / name)
            with self.assertRaises(ValueError):
                wine_path(Path('relative'))

    def test_bootstrap_rejects_duplicate_keys_and_coerced_version(self):
        with self.assertRaises(ValueError): decode_bootstrap(b'{"version":1,"version":1}')
        body = dict(version=True, binding=sample_binding().model_dump(), root='/fixture', key='a' * 64,
                    challenge='b' * 64, source_hashes={}, mock_stop=False, faults={})
        with self.assertRaises(ValueError): decode_bootstrap(canonical(body))


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'state'
        self.prefix = Path(self.temp.name) / 'prefix'
        self.binding, self.key = sample_binding(), secrets.token_bytes(32)
        prepare_simulation(self.root, self.binding)
        prepare_prefix(self.prefix, self.binding)
        self.bridges = []
        self.addCleanup(lambda: [bridge.close() for bridge in self.bridges])
        self.publish_stop(False)

    def publish_stop(self, stopped, **changes):
        now = wall_ms()
        state = dict(simulation=True, binding=self.binding.digest(), stopped=stopped,
                     observed_ms=now, expires_ms=now + 3000)
        state.update(changes)
        path = self.root / 'mock-stop.json'
        temporary = self.root / 'mock-stop.tmp'
        temporary.write_bytes(canonical(state))
        temporary.chmod(0o600)
        temporary.replace(path)

    def bridge(self, **kwargs):
        bridge = WineBridge(self.root, self.prefix, self.binding, self.key,
                            Runtime.reference(), mock_stop=True, **kwargs)
        self.bridges.append(bridge)
        return bridge

    def acquire(self, bridge):
        reply = bridge.request('acquire')
        self.assertEqual(reply['code'], 'LEASED', reply)

    def fills(self):
        with sqlite3.connect(self.root / 'simulated-broker.sqlite3') as db:
            return db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def test_real_exec_stdio_handshake_sync_and_clean_shutdown(self):
        bridge = self.bridge()
        self.assertEqual(bridge.ready.platform, 'linux')
        self.assertFalse(bridge.ready.financial_execution)
        self.acquire(bridge)
        self.publish_stop(False)
        self.assertTrue(bridge.request('sync', sample_target())['success'])
        self.assertEqual(self.fills(), 1)
        bridge.close()
        self.assertFalse(bridge.process.is_alive())
        self.assertFalse((self.root / 'bridge-stop.json').exists())

    def test_idempotency_replay_and_lease_fencing_survive_exec_restart(self):
        bridge = self.bridge()
        self.acquire(bridge)
        request_id = secrets.token_hex(16)
        self.assertTrue(bridge.request('sync', sample_target(), request_id=request_id)['success'])
        old_epoch, old_token = bridge.epoch, bridge.token
        bridge.close()
        bridge = self.bridge()
        self.acquire(bridge)
        self.assertGreater(bridge.epoch, old_epoch)
        self.publish_stop(False)
        self.assertTrue(bridge.request('sync', sample_target(), request_id=request_id)['success'])
        self.assertEqual(self.fills(), 1)
        bridge.epoch, bridge.token = old_epoch, old_token
        self.assertEqual(bridge.request('status')['code'], 'LEASE_INVALID')

    def test_launch_failure_has_bounded_refusal_and_lifecycle_hold(self):
        with patch('wine_bridge.subprocess.Popen', side_effect=OSError('DO_NOT_LOG_PRIVATE_ERROR')):
            with self.assertRaises(ValueError):
                self.bridge()
        self.assertTrue((self.root / 'bridge-stop.json').exists())
        text = (self.root / 'bridge-lifecycle.jsonl').read_text()
        self.assertIn('STARTUP_FAILED', text)
        self.assertNotIn('DO_NOT_LOG_PRIVATE_ERROR', text)

    def test_startup_timeout_never_restarts_or_clears_hold(self):
        started = time.monotonic()
        with self.assertRaises(ValueError):
            self.bridge(startup_timeout=.05, shutdown_timeout=.1,
                        faults=EntryFaults(startup_delay_ms=800))
        self.assertLess(time.monotonic() - started, 5)
        self.assertTrue((self.root / 'bridge-stop.json').exists())
        bridge = self.bridge()
        self.acquire(bridge)
        self.publish_stop(False)
        self.assertEqual(bridge.request('sync', sample_target())['code'], 'HELD')

    def test_wrong_authenticated_startup_challenge_is_refused(self):
        with self.assertRaises(ValueError):
            self.bridge(faults=EntryFaults(bad_challenge=True))
        self.assertTrue((self.root / 'bridge-stop.json').exists())

    def test_exit_before_ready_durably_blocks_recovery(self):
        with self.assertRaises(ValueError):
            self.bridge(faults=EntryFaults(exit_before_ready=True))
        bridge = self.bridge()
        self.acquire(bridge)
        self.assertTrue(bridge.request('status')['data']['held'])

    def test_unexpected_exit_after_ready_creates_hold(self):
        bridge = self.bridge(faults=EntryFaults(exit_after_ready=True))
        self.assertTrue(bridge.request('acquire')['uncertain'])
        self.assertTrue((self.root / 'bridge-stop.json').exists())
        self.assertFalse(bridge.process.is_alive())

    def test_crash_after_fill_and_stop_recovery_never_replay(self):
        bridge = self.bridge(faults=EntryFaults(crash_after_fill=True))
        self.acquire(bridge)
        self.assertTrue(bridge.request('sync', sample_target())['uncertain'])
        self.assertEqual(self.fills(), 1)
        bridge.close()
        self.publish_stop(True)
        bridge = self.bridge()
        self.acquire(bridge)
        status = bridge.request('status')['data']
        self.assertTrue(status['held'])
        self.assertTrue(status['stopped'])
        self.publish_stop(False)
        self.assertEqual(bridge.request('sync', sample_target(revision=2))['code'], 'HELD')
        self.assertEqual(self.fills(), 1)

    def test_lost_completed_reply_does_not_blindly_resubmit(self):
        bridge = self.bridge(faults=EntryFaults(disconnect_after_sync=True))
        self.acquire(bridge)
        self.assertTrue(bridge.request('sync', sample_target())['uncertain'])
        self.assertEqual(self.fills(), 1)
        bridge.close()
        bridge = self.bridge()
        self.acquire(bridge)
        self.assertEqual(bridge.request('sync', sample_target())['code'], 'HELD')
        self.assertEqual(self.fills(), 1)

    def test_ipc_timeout_holds_and_stops_only_owned_process(self):
        bridge = self.bridge(faults=EntryFaults(before_send_ms=800))
        self.acquire(bridge)
        bridge.timeout = .1
        self.assertTrue(bridge.request('sync', sample_target())['uncertain'])
        self.assertFalse(bridge.process.is_alive())
        self.assertTrue((self.root / 'bridge-stop.json').exists())
        self.assertEqual(self.fills(), 0)

    def test_active_missing_stale_and_malformed_fixture_stops_fail_closed(self):
        bridge = self.bridge()
        self.acquire(bridge)
        for kind in ('active', 'missing', 'stale', 'malformed'):
            with self.subTest(kind=kind):
                self.publish_stop(True)
                path = self.root / 'mock-stop.json'
                if kind == 'missing': path.unlink()
                elif kind == 'stale': self.publish_stop(False, observed_ms=1, expires_ms=2)
                elif kind == 'malformed': path.write_text('{}')
                self.assertEqual(bridge.request('sync', sample_target())['code'], 'STOPPED')
        self.publish_stop(False)
        self.assertTrue(bridge.request('sync', sample_target())['success'])

    def test_conflicting_bridge_does_not_kill_or_mark_existing_owner(self):
        bridge = self.bridge()
        self.acquire(bridge)
        with self.assertRaises(ValueError): self.bridge()
        self.assertFalse((self.root / 'bridge-stop.json').exists())
        self.assertTrue(bridge.request('sync', sample_target())['success'])

    def test_closed_bridge_cannot_stop_a_subsequent_owner(self):
        previous = self.bridge()
        previous.close()
        bridge = self.bridge()
        self.acquire(bridge)
        previous.close()
        self.assertTrue(bridge.request('sync', sample_target())['success'])

    def test_invalid_prefix_marker_and_symlink_paths_are_rejected(self):
        marker = self.prefix / 'simulation-prefix.json'
        marker.write_text('{}')
        with self.assertRaises(ValueError): self.bridge()
        marker.unlink()
        marker.symlink_to(self.root / 'simulation.json')
        with self.assertRaises(ValueError): self.bridge()

    def test_world_writable_private_state_or_prefix_is_rejected(self):
        for path in (self.root, self.prefix):
            path.chmod(0o777)
            with self.assertRaises(ValueError): self.bridge()
            path.chmod(0o700)

    def test_untrusted_source_and_runtime_permissions_are_rejected(self):
        file = Path(self.temp.name) / 'unsafe'
        file.write_bytes(b'\x7fELFfake')
        file.chmod(0o777)
        with self.assertRaises(ValueError): trusted_file(file, b'\x7fELF', True)
        with self.assertRaises(ValueError): Runtime('reference', file).validate()
        with self.assertRaises(ValueError): Runtime('wine', file, file, file).validate()

    def test_unknown_prefix_cannot_be_adopted(self):
        with self.assertRaises(ValueError): prepare_prefix(self.prefix, self.binding)

    def test_invalid_timeouts_never_launch(self):
        for changes in (dict(startup_timeout=True), dict(startup_timeout=31),
                        dict(shutdown_timeout=0), dict(timeout=6), dict(timeout=float('nan'))):
            with self.subTest(changes=changes), self.assertRaises(ValueError): self.bridge(**changes)

    def test_lifecycle_audit_is_private_structured_and_redacted(self):
        bridge = self.bridge()
        self.acquire(bridge)
        bridge.close()
        path = self.root / 'bridge-lifecycle.jsonl'
        records = [json.loads(line) for line in path.read_text().splitlines()]
        self.assertTrue({'STARTING', 'READY', 'IPC_EXCHANGE', 'STOPPED'} <= {r['event'] for r in records})
        self.assertTrue(all(set(r) == {'event', 'observed_ms', 'binding', 'pid'} for r in records))
        self.assertNotIn(self.key.hex(), path.read_text())
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_audit_permission_failure_refuses_before_launch(self):
        audit = self.root / 'bridge-lifecycle.jsonl'
        audit.write_text('')
        audit.chmod(0o666)
        with self.assertRaises(ValueError): self.bridge()
        self.assertFalse((self.root / 'simulated-broker.sqlite3').exists())

    def test_sticky_bridge_stop_is_seen_by_standalone_candidate(self):
        (self.root / 'bridge-stop.json').write_text('malformed but still stopped')
        engine = CandidateEngine(self.root, self.binding, self.key, stop_checker=lambda: False)
        try:
            self.assertTrue(engine._held())
            self.assertTrue(engine._stopped())
        finally: engine.close()

    def test_bootstrap_key_is_absent_from_command_line_and_environment(self):
        bridge = self.bridge()
        for name in ('cmdline', 'environ'):
            self.assertNotIn(self.key.hex().encode(), (Path('/proc') / str(bridge.child.pid) / name).read_bytes())

    def test_concurrent_bridge_calls_reuse_one_semantic_receipt(self):
        bridge = self.bridge()
        self.acquire(bridge)
        request_id = secrets.token_hex(16)
        with ThreadPoolExecutor(4) as threads:
            replies = list(threads.map(lambda _: bridge.request('sync', sample_target(), request_id=request_id), range(4)))
        self.assertTrue(all(reply['success'] for reply in replies))
        self.assertEqual(self.fills(), 1)

    def test_shutdown_uncertainty_retains_ownership_and_sticky_stop(self):
        bridge = self.bridge()
        with patch.object(bridge.child, 'poll', return_value=None), \
                patch.object(bridge.child, 'wait', side_effect=__import__('subprocess').TimeoutExpired('fixture', .1)), \
                patch('wine_bridge.os.killpg', side_effect=PermissionError('fixture')):
            bridge.close()
            self.assertFalse(bridge.quiesced)
            self.assertFalse(bridge.closed)
        self.assertTrue((self.root / 'bridge-stop.json').exists())
        bridge.close()
        self.assertTrue(bridge.closed)

    def test_busy_wine_prefix_is_not_killed_during_preflight(self):
        (self.prefix / 'drive_c').mkdir()
        (self.prefix / 'dosdevices').mkdir()
        (self.prefix / 'dosdevices/z:').symlink_to('/', target_is_directory=True)
        runtime = Runtime('wine', Path('/fixture/python.exe'), Path('/fixture/wine'), Path('/fixture/wineserver'))
        with patch.object(Runtime, 'validate'), patch.object(WineBridge, '_server',
                side_effect=__import__('subprocess').TimeoutExpired('fixture', .1)) as server:
            with self.assertRaises(ValueError):
                WineBridge(self.root, self.prefix, self.binding, self.key, runtime)
        self.assertEqual([c.args[0] for c in server.call_args_list], ['-w'])
        self.assertFalse((self.root / 'bridge-stop.json').exists())

    def test_prefix_shutdown_requires_wait_proof_even_if_kill_returns_error(self):
        bridge = self.bridge()
        bridge.runtime = Runtime('wine', Path('/fixture/python.exe'), Path('/fixture/wine'), Path('/fixture/server'))
        with patch.object(bridge, '_server', side_effect=[
                __import__('subprocess').CalledProcessError(1, 'fixture'), None]) as server:
            bridge.close()
        self.assertEqual([c.args[0] for c in server.call_args_list], ['-k', '-w'])
        self.assertTrue(bridge.quiesced)
        self.assertTrue(bridge.closed)
