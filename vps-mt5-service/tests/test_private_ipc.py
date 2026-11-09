"""Offline protocol, journal and real spawned-process IPC acceptance tests."""
import ast
import json
import multiprocessing as mp
import secrets
import sqlite3
import sys
import tempfile
import unittest
from types import SimpleNamespace as NS
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from private_ipc import Binding, Envelope, Response, Result, ProtocolError, MAX_FRAME, canonical, sign, verify
from sdk_ipc_candidate import (CandidateEngine, SimulationController, SimulationFaults,
                               prepare_simulation, hold_after_transport_failure)


def binding(**changes):
    return Binding.model_validate(dict(simulation=True, tenant='tenant-one', account='client-one',
        broker='justmarkets', login=1, server='SimulationOnly', **changes))


def target(**changes):
    return dict(dict(login=1, server='SimulationOnly', sourceKey='a' * 64, revision=1,
                     symbol='EURUSD', target=.1, sl=0., tp=0., maxVolume=1.), **changes)


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.key = secrets.token_bytes(32)

    def test_authenticated_frames_and_direction_separation(self):
        frame = sign({'body': 'fixture'}, self.key)
        self.assertEqual(verify(frame, self.key), {'body': 'fixture'})
        for key, direction in [(secrets.token_bytes(32), 'request'), (self.key, 'response')]:
            with self.assertRaises(ProtocolError):
                verify(frame, key, direction)

    def test_altered_messages_are_rejected(self):
        wire = json.loads(sign({'body': 'fixture'}, self.key))
        wire['message']['body'] = 'modified'
        with self.assertRaises(ProtocolError):
            verify(canonical(wire), self.key)

    def test_malformed_duplicate_nonfinite_and_oversized_frames(self):
        for frame in [b'not JSON', b'[]', b'{}', b'{"message":{},"message":{},"mac":""}',
                      b'{"message":{"x":NaN},"mac":""}', b'x' * (MAX_FRAME + 1), b'\xff']:
            with self.subTest(frame=frame[:40]), self.assertRaises(ProtocolError):
                verify(frame, self.key)
        with self.assertRaises(ProtocolError):
            sign({'body': 'x' * MAX_FRAME}, self.key)

    def test_weak_keys_and_unknown_direction_refused(self):
        for key, direction in [(b'weak', 'request'), ('not-bytes' * 8, 'request'), (self.key, 'unknown')]:
            with self.subTest(direction=direction), self.assertRaises(ProtocolError):
                sign({}, key, direction)

    def test_response_safety_flags_cannot_be_coerced(self):
        for changes in (dict(simulation=1), dict(financial_execution=0), dict(retriable=0),
                        dict(simulation=False), dict(financial_execution=True), dict(success='true')):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                Result.model_validate(dict(dict(success=True, code='STATUS'), **changes))

    def test_only_explicit_synthetic_bindings_are_accepted(self):
        base = binding().model_dump()
        for changes in [dict(simulation=False), dict(simulation=1), dict(server='LiveServer'),
                        dict(login=True), dict(login='1'), dict(role='mentor'), dict(tenant='../escape'),
                        dict(account='../../escape'), dict(password='never-accepted')]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                Binding.model_validate({**base, **changes})

    def test_shared_sdk_module_has_no_posix_only_or_vendor_import(self):
        root = Path(__file__).resolve().parents[1]
        for name in ('simulation_sdk.py', 'private_ipc.py', 'sdk_ipc_candidate.py'):
            tree = ast.parse((root / name).read_text())
            imports = [n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)]
            imports += [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names]
            self.assertNotIn('fcntl', imports)
            self.assertNotIn('MetaTrader5', imports)


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'account'
        self.binding = binding()
        self.key = secrets.token_bytes(32)
        self.now, self.tick, self.stopped = 100000, 100., False
        self.controller = 'c' * 32
        self.epoch, self.token = 0, ''
        prepare_simulation(self.root, self.binding)
        self.engine = self.open_engine()
        self.addCleanup(lambda: self.engine.close())

    def open_engine(self, **kwargs):
        return CandidateEngine(self.root, self.binding, self.key, clock=lambda: self.now,
                               monotonic=lambda: self.tick, stop_checker=lambda: self.stopped, **kwargs)

    def message(self, operation='sync', body=None, **changes):
        values = dict(version=1, binding=self.binding.digest(), controller=self.controller,
                      request_id=secrets.token_hex(16), nonce=secrets.token_hex(32), issued_ms=self.now,
                      deadline_ms=self.now + 1000, epoch=self.epoch, lease_token=self.token,
                      operation=operation, body=target() if body is None and operation == 'sync' else (body or {}))
        values.update(changes)
        return values

    def call(self, message=None, **kwargs):
        message = message or self.message(**kwargs)
        response = Response.model_validate(verify(self.engine.handle(sign(message, self.key)), self.key, 'response'))
        return response.result.model_dump()

    def acquire(self):
        response = self.call(self.message('acquire', epoch=0, lease_token=''))
        self.assertEqual(response['code'], 'LEASED', response)
        self.epoch, self.token = response['data']['epoch'], response['data']['lease_token']

    def fills(self):
        return self.engine.sdk.db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def test_unauthorized_frames_cannot_change_controller_or_positions(self):
        reply = verify(self.engine.handle(sign(self.message(), secrets.token_bytes(32))), self.key, 'response')
        self.assertFalse(reply['result']['success'])
        self.assertEqual(self.engine._state()['controller'], '')
        self.assertEqual(self.fills(), 0)

    def test_exact_envelope_schema_rejects_unknown_fields_coercion_and_version(self):
        for changes in [dict(version=True), dict(version=2), dict(epoch=True), dict(issued_ms='100000'),
                        dict(unexpected='field'), dict(operation='clear-holds')]:
            with self.subTest(changes=changes):
                self.assertEqual(self.call(self.message(**changes))['code'], 'INVALID_REQUEST')
        self.assertEqual(self.fills(), 0)

    def test_sync_requires_explicit_controller_acquisition(self):
        self.assertEqual(self.call()['code'], 'LEASE_INVALID')
        self.assertEqual(self.fills(), 0)

    def test_other_tenant_binding_and_other_account_payload_are_denied(self):
        self.acquire()
        for message in [self.message(binding='f' * 64), self.message(body=target(login=2)),
                        self.message(body=target(server='Other'))]:
            self.assertEqual(self.call(message)['code'], 'IDENTITY_MISMATCH')
        self.assertEqual(self.fills(), 0)

    def test_body_forbids_credentials_extra_fields_nonfinite_and_coercion(self):
        self.acquire()
        for changes in [dict(password='PRIVATE_FIXTURE'), dict(revision=True), dict(login='1'),
                        dict(target=True), dict(symbol=' EURUSD'), dict(maxDailyDrawdown='5'),
                        dict(unknown=1)]:
            with self.subTest(changes=changes):
                self.assertFalse(self.call(body=target(**changes))['success'])
        for value in (float('nan'), float('inf'), float('-inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.call(body=target(target=value))
        self.assertEqual(self.fills(), 0)

    def test_non_sync_messages_require_empty_body(self):
        self.acquire()
        self.assertEqual(self.call(self.message('status', body={'unexpected': 1}))['code'], 'INVALID_BODY')

    def test_invalid_and_expired_deadlines_are_rejected_before_state_changes(self):
        self.acquire()
        for changes in [dict(deadline_ms=self.now), dict(issued_ms=self.now + 300),
                        dict(deadline_ms=self.now + 5001), dict(deadline_ms=self.now - 1)]:
            with self.subTest(changes=changes):
                self.assertEqual(self.call(self.message(**changes))['code'], 'DEADLINE')
        self.assertEqual(self.fills(), 0)

    def test_exact_frame_replay_is_rejected(self):
        self.acquire()
        message = self.message()
        self.assertTrue(self.call(message)['success'])
        self.assertEqual(self.call(message)['code'], 'REPLAY')
        self.assertEqual(self.fills(), 1)

    def test_fresh_nonce_same_request_id_returns_durable_receipt(self):
        self.acquire()
        message = self.message()
        first = self.call(message)
        second = self.call({**message, 'nonce': secrets.token_hex(32)})
        self.assertEqual(first, second)
        self.assertEqual(self.fills(), 1)

    def test_changed_body_for_same_request_id_is_conflict(self):
        self.acquire()
        message = self.message()
        self.assertTrue(self.call(message)['success'])
        self.assertEqual(self.call({**message, 'nonce': secrets.token_hex(32), 'body': target(target=.2)})['code'],
                         'IDEMPOTENCY_CONFLICT')
        self.assertEqual(self.fills(), 1)

    def test_duplicate_revision_new_request_id_reuses_observer_journal(self):
        self.acquire()
        self.assertTrue(self.call()['success'])
        self.assertTrue(self.call()['success'])
        self.assertEqual(self.fills(), 1)

    def test_stale_and_conflicting_revisions_do_not_send(self):
        self.acquire()
        self.assertTrue(self.call(body=target(revision=2))['success'])
        self.assertFalse(self.call(body=target(revision=1))['success'])
        self.assertFalse(self.call(body=target(revision=2, target=.2))['success'])
        self.assertEqual(self.fills(), 1)

    def test_second_worker_cannot_own_same_journal(self):
        with self.assertRaises(ValueError):
            self.open_engine()

    def test_conflicting_controller_and_invalid_lease_are_rejected(self):
        self.acquire()
        self.assertEqual(self.call(self.message('acquire', epoch=0, lease_token='', controller='d' * 32))['code'],
                         'OWNER_CONFLICT')
        for changes in [dict(controller='d' * 32), dict(epoch=self.epoch + 1), dict(lease_token='e' * 64)]:
            self.assertEqual(self.call(self.message(**changes))['code'], 'LEASE_INVALID')
        self.assertEqual(self.fills(), 0)

    def test_renewal_expiration_and_epoch_fencing(self):
        self.acquire()
        old_epoch, old_token = self.epoch, self.token
        self.now += 1000
        self.tick += 1
        self.assertEqual(self.call(self.message('renew'))['code'], 'RENEWED')
        self.now += 1001
        self.tick += 1.001
        self.assertTrue(self.call()['success'])
        self.now += 1000
        self.tick += 1
        self.assertEqual(self.call()['code'], 'LEASE_INVALID')
        self.assertEqual(self.call(self.message('renew'))['code'], 'LEASE_INVALID')
        self.acquire()
        self.assertGreater(self.epoch, old_epoch)
        self.assertEqual(self.call(self.message(epoch=old_epoch, lease_token=old_token))['code'], 'LEASE_INVALID')

    def test_monotonic_expiration_cannot_be_bypassed_by_wall_clock(self):
        self.acquire()
        self.tick += 3
        self.assertEqual(self.call()['code'], 'LEASE_INVALID')
        self.assertEqual(self.fills(), 0)

    def test_clock_reversal_creates_persistent_hold(self):
        self.acquire()
        self.now -= 1
        self.assertEqual(self.call()['code'], 'CLOCK_REVERSED')
        self.engine.close()
        self.now += 1
        self.engine = self.open_engine()
        self.acquire()
        self.assertEqual(self.call()['code'], 'HELD')

    def test_restart_invalidates_grants_and_preserves_idempotency_and_nonces(self):
        self.acquire()
        message = self.message()
        self.assertTrue(self.call(message)['success'])
        self.engine.close()
        self.engine = self.open_engine()
        self.assertEqual(self.call(message)['code'], 'REPLAY')
        self.assertEqual(self.call()['code'], 'LEASE_INVALID')
        self.acquire()
        self.assertTrue(self.call(self.message(request_id=message['request_id']))['success'])
        self.assertEqual(self.fills(), 1)

    def test_active_stop_and_unavailable_stop_checker_fail_closed(self):
        self.acquire()
        self.stopped = True
        self.assertEqual(self.call()['code'], 'STOPPED')
        self.engine.stop_checker = lambda: (_ for _ in ()).throw(OSError('PRIVATE_FIXTURE'))
        self.assertEqual(self.call()['code'], 'STOPPED')
        self.engine.stop_checker = lambda: None
        self.assertEqual(self.call()['code'], 'STOPPED')
        self.assertEqual(self.fills(), 0)

    def test_changed_sdk_account_identity_and_mode_fail_closed(self):
        self.acquire()
        for account in (None, NS(login=2, server='SimulationOnly', trade_mode=0),
                        NS(login=True, server='SimulationOnly', trade_mode=0),
                        NS(login=1, server='SimulationOnly', trade_mode=False),
                        NS(login=1, server='Other', trade_mode=0),
                        NS(login=1, server='SimulationOnly', trade_mode=2)):
            with self.subTest(account=account), patch.object(self.engine.sdk, 'account_info', return_value=account):
                self.assertEqual(self.call()['code'], 'SDK_IDENTITY_MISMATCH')
        self.assertEqual(self.fills(), 0)

    def test_sdk_identity_change_immediately_before_send_stays_held(self):
        self.acquire()
        calls = []
        def check():
            calls.append(1)
            if len(calls) > 1:
                self.engine.sdk.account_info = lambda: NS(login=2, server='SimulationOnly', trade_mode=0)
            return False
        self.engine.stop_checker = check
        self.assertTrue(self.call()['uncertain'])
        self.assertEqual(self.fills(), 0)

    def test_default_gate_reuses_emergency_stop_checker(self):
        self.engine.close()
        with patch('sdk_ipc_candidate.emergency_stop_active', return_value=True) as stop:
            self.engine = CandidateEngine(self.root, self.binding, self.key, clock=lambda: self.now,
                                          monotonic=lambda: self.tick)
            self.acquire()
            self.assertEqual(self.call()['code'], 'STOPPED')
            stop.assert_called_once()

    def test_stop_between_admission_and_send_preserves_hold_on_recovery(self):
        self.acquire()
        calls = []
        self.engine.stop_checker = lambda: (calls.append(1) or len(calls) > 1)
        self.assertTrue(self.call()['uncertain'])
        self.assertEqual(self.fills(), 0)
        self.engine.stop_checker = lambda: False
        self.assertEqual(self.call(body=target(revision=2))['code'], 'HELD')
        self.engine.close()
        self.engine = self.open_engine()
        self.acquire()
        self.assertEqual(self.call()['code'], 'HELD')
        self.assertEqual(self.fills(), 0)

    def test_expired_lease_immediately_before_send_preserves_hold(self):
        self.acquire()
        calls = []
        def check():
            calls.append(1)
            if len(calls) > 1:
                self.tick += 3
            return False
        self.engine.stop_checker = check
        self.assertTrue(self.call()['uncertain'])
        self.assertTrue(self.engine._held())
        self.assertEqual(self.fills(), 0)

    def test_deadline_immediately_before_send_preserves_hold(self):
        self.acquire()
        calls = []
        def check():
            calls.append(1)
            if len(calls) > 1:
                self.now += 1001
            return False
        self.engine.stop_checker = check
        self.assertTrue(self.call()['uncertain'])
        self.assertEqual(self.fills(), 0)

    def test_existing_safety_hold_blocks_new_operations(self):
        self.acquire()
        self.engine.db.execute("INSERT INTO allocations(scope,account,source,magic,symbol,revision,phase) VALUES('held','bound','source',1,'EURUSD',1,'reconciled_hold')")
        self.engine.db.commit()
        self.assertEqual(self.call()['code'], 'HELD')
        self.assertEqual(self.fills(), 0)

    def test_transport_hold_persists_even_before_first_worker_initialization(self):
        self.engine.close()
        self.root = Path(self.temp.name) / 'unstarted'
        prepare_simulation(self.root, self.binding)
        hold_after_transport_failure(self.root, self.binding)
        self.engine = self.open_engine()
        self.acquire()
        self.assertEqual(self.call()['code'], 'HELD')

    def test_audit_logs_are_structured_and_do_not_contain_keys_or_lease_tokens(self):
        self.acquire()
        self.assertTrue(self.call()['success'])
        self.assertTrue(self.call(self.message('status'))['success'])
        rows = [dict(r) for r in self.engine.db.execute('SELECT * FROM ipc_audit')]
        events = {r['event'] for r in rows}
        self.assertTrue({'WORKER_STARTED', 'LEASE_ACQUIRED', 'SYNC_INTENT', 'SIMULATED_SEND_INTENT', 'SYNC_COMPLETED'} <= events)
        encoded = json.dumps(rows)
        self.assertNotIn(self.token, encoded)
        self.assertNotIn(self.key.hex(), encoded)
        self.assertNotIn('EURUSD', encoded)
        self.assertTrue(all(set(r) == {'id', 'event', 'observed_ms', 'epoch', 'request_ref', 'controller_ref'} for r in rows))

    def test_replay_storage_exhaustion_denies_without_evicting_protection(self):
        self.acquire()
        with patch('sdk_ipc_candidate.MAX_NONCES', 1):
            self.assertEqual(self.call()['code'], 'REPLAY_STORAGE_FULL')
        self.assertEqual(self.engine.db.execute('SELECT count(*) FROM ipc_nonces').fetchone()[0], 1)
        self.assertEqual(self.fills(), 0)

    def test_audit_failure_blocks_before_simulated_send(self):
        self.acquire()
        with patch('sdk_ipc_candidate.MAX_AUDIT', 1):
            self.assertTrue(self.call()['uncertain'])
        self.assertTrue(self.engine._held())
        self.assertEqual(self.fills(), 0)

class ProcessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'account'
        self.binding = binding()
        self.key = secrets.token_bytes(32)
        self.stop = mp.get_context('spawn').Value('b', False)
        self.controllers = []
        self.addCleanup(lambda: [c.close() for c in self.controllers])
        prepare_simulation(self.root, self.binding)

    def controller(self, **kwargs):
        c = SimulationController(self.root, self.binding, self.key, mock_stop=self.stop, **kwargs)
        self.controllers.append(c)
        return c

    def acquire(self, controller):
        response = controller.request('acquire')
        self.assertEqual(response['code'], 'LEASED', response)

    def fills(self, root=None):
        with sqlite3.connect((root or self.root) / 'simulated-broker.sqlite3') as db:
            return db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def test_real_spawn_private_pipe_and_durable_retry_after_restart(self):
        c = self.controller()
        self.assertEqual(c.request('status')['code'], 'LEASE_INVALID')
        self.acquire(c)
        request_id = secrets.token_hex(16)
        first = c.request('sync', target(), request_id=request_id)
        self.assertTrue(first['success'], first)
        self.assertTrue(first['simulation'])
        self.assertFalse(first['financial_execution'])
        c.close()
        c = self.controller()
        self.acquire(c)
        self.assertEqual(c.request('sync', target(), request_id=request_id), first)
        self.assertEqual(self.fills(), 1)

    def test_private_pipe_serializes_concurrent_semantic_retries(self):
        c = self.controller()
        self.acquire(c)
        request_id = secrets.token_hex(16)
        with ThreadPoolExecutor(4) as threads:
            results = list(threads.map(lambda _: c.request('sync', target(), request_id=request_id), range(4)))
        self.assertTrue(all(r['success'] for r in results), results)
        self.assertEqual(self.fills(), 1)

    def test_crash_after_fill_creates_hold_and_never_replays_on_recovery(self):
        c = self.controller(faults=SimulationFaults(crash_after_fill=True))
        self.acquire(c)
        self.assertTrue(c.request('sync', target())['uncertain'])
        self.assertEqual(self.fills(), 1)
        self.assertFalse(c.process.is_alive())
        self.stop.value = True
        c = self.controller()
        self.acquire(c)
        state = c.request('status')['data']
        self.assertTrue(state['held'])
        self.assertTrue(state['stopped'])
        self.stop.value = False
        self.assertEqual(c.request('sync', target(revision=2))['code'], 'HELD')
        self.assertEqual(self.fills(), 1)

    def test_bounded_timeout_terminates_worker_and_persists_hold(self):
        c = self.controller(faults=SimulationFaults(before_send_ms=1000))
        self.acquire(c)
        c.timeout = .1
        response = c.request('sync', target())
        self.assertEqual(response['code'], 'TRANSPORT_HELD', response)
        self.assertFalse(c.process.is_alive())
        self.assertEqual(self.fills(), 0)
        self.assertEqual(c.request('sync', target())['code'], 'UNAVAILABLE')
        c = self.controller()
        self.acquire(c)
        self.assertTrue(c.request('status')['data']['held'])
        self.assertEqual(c.request('sync', target())['code'], 'HELD')
        with sqlite3.connect(self.root / 'observer.sqlite3') as db:
            self.assertTrue(db.execute("SELECT 1 FROM ipc_audit WHERE event='TRANSPORT_HELD'").fetchone())

    def test_shared_stop_changes_do_not_require_worker_restart(self):
        c = self.controller()
        self.acquire(c)
        self.stop.value = True
        self.assertEqual(c.request('sync', target())['code'], 'STOPPED')
        self.stop.value = False
        self.assertTrue(c.request('sync', target())['success'])
        self.assertEqual(self.fills(), 1)

    def test_conflicting_process_cannot_own_active_journal(self):
        c = self.controller()
        self.acquire(c)
        other = self.controller()
        self.assertFalse(other.request('acquire')['success'])
        self.assertTrue(c.request('sync', target())['success'])

    def test_tenants_use_independent_keys_bindings_processes_and_journals(self):
        c = self.controller()
        self.acquire(c)
        other_root = Path(self.temp.name) / 'second'
        b = Binding.model_validate({**self.binding.model_dump(), 'tenant': 'tenant-two', 'account': 'client-two', 'login': 2})
        prepare_simulation(other_root, b)
        other = SimulationController(other_root, b, secrets.token_bytes(32), mock_stop=self.stop)
        self.controllers.append(other)
        self.acquire(other)
        self.assertNotEqual(c.process.pid, other.process.pid)
        self.assertEqual(c.request('sync', target(login=2))['code'], 'IDENTITY_MISMATCH')
        self.assertTrue(other.request('sync', target(login=2))['success'])
        self.assertEqual(self.fills(), 0)
        self.assertEqual(self.fills(other_root), 1)

    def test_root_rebinding_symlinks_and_nonempty_adoption_are_rejected(self):
        with self.assertRaises(ValueError):
            prepare_simulation(self.root, self.binding)
        with self.assertRaises(ValueError):
            SimulationController(self.root, Binding.model_validate({**self.binding.model_dump(), 'tenant': 'other'}), self.key)
        link = Path(self.temp.name) / 'link'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            SimulationController(link, self.binding, self.key)

    def test_invalid_timeout_and_key_are_rejected_without_process_start(self):
        for timeout in (True, 0, -1, 6, float('nan')):
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                self.controller(timeout=timeout)
        with self.assertRaises(ValueError):
            SimulationController(self.root, self.binding, b'weak')

    def corrupt_reply(self, transform):
        c = self.controller()
        self.acquire(c)
        pipe = c.pipe
        class AlteredPipe:
            def send_bytes(_, frame):
                return pipe.send_bytes(frame)
            def recv_bytes(_, maximum):
                return transform(pipe.recv_bytes(maximum))
            def close(_):
                pipe.close()
        c.pipe = AlteredPipe()
        reply = c.request('status')
        self.assertEqual(reply['code'], 'TRANSPORT_HELD', reply)
        self.assertFalse(c.process.is_alive())
        with sqlite3.connect(self.root / 'observer.sqlite3') as db:
            self.assertEqual(db.execute('SELECT held FROM ipc_state').fetchone()[0], 1)

    def test_unauthenticated_response_creates_transport_hold(self):
        self.corrupt_reply(lambda _: sign({'not': 'authenticated'}, secrets.token_bytes(32), 'response'))

    def test_signed_response_for_wrong_nonce_creates_transport_hold(self):
        def transform(frame):
            message = verify(frame, self.key, 'response')
            message['nonce'] = 'f' * 64
            return sign(message, self.key, 'response')
        self.corrupt_reply(transform)

    def test_signed_malformed_status_response_creates_transport_hold(self):
        def transform(frame):
            message = verify(frame, self.key, 'response')
            message['result']['data']['held'] = 'false'
            return sign(message, self.key, 'response')
        self.corrupt_reply(transform)

    def test_unconfirmed_termination_is_reported_without_claiming_durable_hold(self):
        c = self.controller()
        self.acquire(c)
        with patch.object(c.pipe, 'recv_bytes', side_effect=OSError('fixture')), \
                patch.object(c.process, 'terminate', side_effect=PermissionError('fixture')), \
                patch.object(c.process, 'kill', side_effect=PermissionError('fixture')), \
                patch.object(c.process, 'is_alive', return_value=True):
            reply = c.request('status')
        self.assertEqual(reply['code'], 'WORKER_STOP_UNCONFIRMED')
        self.assertTrue(reply['uncertain'])
        self.assertTrue(c.failed)
        self.assertEqual(c.request('sync', target())['code'], 'UNAVAILABLE')
