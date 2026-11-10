"""Linux reference and simulated Win32 policy tests; NOT native Windows verification."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch, Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from windows_simulation_security import windows_path, validate_acl, FULL, Win32Inspector, LinuxReferenceInspector
from native_windows_candidate import NativeWindowsSimulation, stop_active, _QUARANTINE
from private_ipc import Binding, canonical, sign, verify, Envelope
from sdk_ipc_candidate import prepare_simulation, wall_ms


def binding(**changes):
    return Binding.model_validate(dict(dict(simulation=True, tenant='tenant', account='client',
        broker='justmarkets', login=1, server='SimulationOnly'), **changes))


def target(revision=1):
    return dict(login=1, server='SimulationOnly', sourceKey='a'*64, revision=revision,
                symbol='EURUSD', target=.1, sl=0., tp=0., maxVolume=1.)


class WindowsPolicyTests(unittest.TestCase):
    def test_absolute_local_paths_and_spaces(self):
        for path in (r'C:\ea-sim\state', r'D:\Local Fixture\python.exe'):
            self.assertEqual(windows_path(path), path)

    def test_unc_device_drive_relative_and_traversal_refused(self):
        for path in (r'\\host\share\file', r'\\?\C:\file', r'\\.\pipe\worker', r'C:relative',
                     r'\rooted', r'C:\a\..\b', r'C:\a\.\b', 'C:/a/b', 'C:\\a\\'):
            with self.subTest(path=path), self.assertRaises(ValueError): windows_path(path)

    def test_ads_reserved_aliases_and_trailing_components_refused(self):
        for part in ('file:stream', 'CON', 'con.txt', 'COM1', 'LPT³.txt', 'x.', 'x ',
                     'CONOUT$', 'A~1', 'a?b', 'a\x00b'):
            with self.subTest(part=part), self.assertRaises(ValueError): windows_path('C:\\root\\'+part)

    def test_unbounded_or_nonstring_paths_refused(self):
        for path in (None, Path('file'), '', 'C:\\'+'a'*201):
            with self.assertRaises(ValueError): windows_path(path)

    def facts(self):
        return dict(user='S-1-5-21-1', owner='S-1-5-21-1', dacl_present=True, protected=True,
                    aces=[dict(type=0, flags=3, sid='S-1-5-21-1', mask=FULL)])

    def test_private_owner_system_and_inherited_child_aces(self):
        facts=self.facts();facts['aces'].append(dict(type=0, flags=0x13,sid='S-1-5-18',mask=FULL))
        validate_acl(facts, private=True)

    def test_unknown_owner_missing_dacl_and_nonfull_owner_refused(self):
        for change in (dict(owner='S-1-1-0'),dict(dacl_present=False),dict(aces=[]),
                       dict(aces=[dict(type=0,flags=0,sid='S-1-5-21-1',mask=1)])):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_acl({**self.facts(), **change}, private=True)

    def test_broad_read_aces_refused_for_private_state(self):
        facts=self.facts();facts['aces'].append(dict(type=0,flags=0,sid='S-1-1-0',mask=0x120089))
        with self.assertRaises(ValueError):validate_acl(facts, private=True)
        validate_acl(facts, private=False)  # Shared code may be readable, never broadly writable.

    def test_untrusted_write_delete_or_acl_change_refused_for_source(self):
        for mask in (2,4,0x40,0x10000,0x40000,0x80000,0x40000000,0x10000000):
            facts=self.facts();facts['aces'].append(dict(type=0,flags=0,sid='S-1-1-0',mask=mask))
            with self.subTest(mask=mask), self.assertRaises(ValueError):validate_acl(facts, private=False)

    def test_conditional_object_deny_and_inherit_only_aces_refused(self):
        for kind,flags in ((1,0),(5,0),(0,8),(9,0)):
            facts=self.facts();facts['aces'][0].update(type=kind,flags=flags)
            with self.assertRaises(ValueError):validate_acl(facts, private=True)

    def test_actual_win32_inspection_not_claimed_on_linux(self):
        with self.assertRaises(ValueError):Win32Inspector()


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'state';self.b=binding();self.key=secrets.token_bytes(32)
        prepare_simulation(self.root,self.b);self.launchers=[]
        self.addCleanup(self.cleanup)

    def cleanup(self):
        for launcher in self.launchers:launcher.close()

    def launch(self, **kwargs):
        launcher=NativeWindowsSimulation.linux_reference(self.root,self.b,self.key,**kwargs)
        self.launchers.append(launcher);return launcher

    def mirror(self, stopped=False, **changes):
        now=wall_ms();state=dict(simulation=True,binding=self.b.digest(),stopped=stopped,
                                observed_ms=now,expires_ms=now+3000);state.update(changes)
        path=self.root/'mock-stop.json';path.write_bytes(canonical(state));path.chmod(0o600)

    def acquire(self, launcher):self.assertEqual(launcher.request('acquire')['code'],'LEASED')

    def count(self):
        with sqlite3.connect(self.root/'simulated-broker.sqlite3') as db:
            return db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def held(self):
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:
            return db.execute('SELECT held FROM native_state').fetchone()[0]

    def test_default_native_constructor_refuses_linux_without_spawning(self):
        with patch('native_windows_candidate.subprocess.Popen') as spawn:
            with self.assertRaises(ValueError):NativeWindowsSimulation(self.root,self.b,self.key)
            spawn.assert_not_called()

    def test_unknown_ntfs_permission_state_refuses_before_launch(self):
        with patch.object(LinuxReferenceInspector,'check',side_effect=PermissionError), patch('native_windows_candidate.subprocess.Popen') as spawn:
            with self.assertRaises(PermissionError):self.launch()
            spawn.assert_not_called()

    def test_unsafe_directory_permissions_refuse(self):
        self.root.chmod(0o777)
        with self.assertRaises(ValueError):self.launch()
        self.root.chmod(0o700)

    def test_symlinked_stop_or_root_fails_closed(self):
        launcher=self.launch();self.acquire(launcher)
        (self.root/'mock-stop.json').symlink_to(self.root/'missing')
        self.assertTrue(stop_active(self.root,self.b,'linux-reference'))
        self.assertFalse(launcher.request('sync',target())['success']);self.assertEqual(self.count(),0)

    def test_signed_readiness_and_missing_stop_default_to_stopped(self):
        launcher=self.launch()
        self.assertTrue(launcher.ready.stopped);self.assertFalse(launcher.ready.financial_execution)
        self.assertEqual(launcher.ready.platform,'linux')
        self.acquire(launcher);self.assertFalse(launcher.request('sync',target())['success'])
        self.assertEqual(self.count(),0)

    def test_mock_receipt_idempotency_survives_clean_restart(self):
        launcher=self.launch();self.acquire(launcher);self.mirror()
        request_id='a'*32
        self.assertTrue(launcher.request('sync',target(),request_id=request_id)['success'])
        self.assertTrue(launcher.close())
        recovered=self.launch();self.acquire(recovered);self.mirror()
        self.assertTrue(recovered.request('sync',target(),request_id=request_id)['success'])
        self.assertEqual(self.count(),1);self.assertEqual(self.held(),0)

    def test_active_stale_wrong_account_and_missing_mirrors_stop(self):
        launcher=self.launch();self.acquire(launcher)
        cases=[dict(stopped=True),dict(expires_ms=0),dict(binding='0'*64),dict(observed_ms=True),dict(simulation=False)]
        for changes in cases:
            self.mirror(**changes)
            self.assertTrue(stop_active(self.root,self.b,'linux-reference'))
        (self.root/'mock-stop.json').unlink()
        self.assertTrue(stop_active(self.root,self.b,'linux-reference'));self.assertEqual(self.count(),0)

    def test_stop_recovers_only_with_fresh_explicit_synthetic_mirror(self):
        launcher=self.launch();self.acquire(launcher);self.mirror(True)
        self.assertFalse(launcher.request('sync',target())['success'])
        self.mirror(False)
        self.assertTrue(launcher.request('sync',target())['success']);self.assertEqual(self.count(),1)

    def test_controller_owner_conflict_does_not_stop_original(self):
        launcher=self.launch();self.acquire(launcher)
        with self.assertRaises(ValueError):self.launch()
        self.assertEqual(self.held(),0);self.mirror()
        self.assertTrue(launcher.request('sync',target())['success'])

    def test_forged_readiness_and_startup_exit_preserve_holds(self):
        for fault in ('bad_challenge','exit_before_ready'):
            with self.subTest(fault=fault):
                with self.assertRaises(ValueError):self.launch(faults={fault:True})
                self.assertEqual(self.held(),1)
        recovered=self.launch();self.acquire(recovered);self.mirror()
        self.assertFalse(recovered.request('sync',target())['success'])

    def test_startup_timeout_is_bounded_and_held(self):
        start=time.monotonic()
        with self.assertRaises(ValueError):self.launch(startup_timeout=.05,faults=dict(startup_delay_ms=900))
        self.assertLess(time.monotonic()-start,6);self.assertEqual(self.held(),1)

    def test_crash_after_fill_prevents_duplicate_after_recovery(self):
        launcher=self.launch(faults=dict(crash_after_fill=True));self.acquire(launcher);self.mirror()
        self.assertFalse(launcher.request('sync',target())['success']);launcher.close()
        self.assertEqual(self.count(),1);self.assertEqual(self.held(),1)
        recovered=self.launch();self.acquire(recovered);self.mirror()
        self.assertFalse(recovered.request('sync',target())['success']);self.assertEqual(self.count(),1)

    def test_lost_receipt_disconnect_preserves_hold(self):
        launcher=self.launch(faults=dict(disconnect_after_sync=True));self.acquire(launcher);self.mirror()
        self.assertFalse(launcher.request('sync',target())['success'])
        self.assertEqual(self.held(),1);self.assertEqual(self.count(),1)

    def test_reply_timeout_marks_hold_and_stops_owned_process(self):
        launcher=self.launch(timeout=.05,faults=dict(reply_delay_ms=500))
        self.assertFalse(launcher.request('acquire')['success'])
        self.assertEqual(self.held(),1);self.assertTrue(launcher.quiesced)

    def test_external_crash_detected_even_without_another_request(self):
        launcher=self.launch();launcher.child.kill();launcher.child.wait(timeout=3)
        launcher.close();self.assertEqual(self.held(),1)

    def test_expired_controller_lease_never_fills(self):
        launcher=self.launch();self.acquire(launcher);self.mirror()
        with sqlite3.connect(self.root/'observer.sqlite3') as db:db.execute('UPDATE ipc_state SET expires_ms=0')
        self.assertFalse(launcher.request('sync',target())['success']);self.assertEqual(self.count(),0)

    def test_private_protocol_rejects_wrong_key_and_duplicate_frame(self):
        launcher=self.launch()
        now=wall_ms();request=Envelope(version=1,binding=self.b.digest(),controller='a'*32,
            request_id='b'*32,nonce='c'*64,issued_ms=now,deadline_ms=now+2000,epoch=0,
            lease_token='',operation='acquire',body={})
        bad=sign(request.model_dump(),secrets.token_bytes(32));launcher.pipe.send_bytes(bad)
        reply=verify(launcher.pipe.recv_bytes(),self.key,'response')
        self.assertFalse(reply['result']['success'])
        frame=sign(request.model_dump(),self.key);launcher.pipe.send_bytes(frame)
        self.assertTrue(verify(launcher.pipe.recv_bytes(),self.key,'response')['result']['success'])
        launcher.pipe.send_bytes(frame)
        self.assertFalse(verify(launcher.pipe.recv_bytes(),self.key,'response')['result']['success'])

    def test_audit_failure_closes_without_sdk_progress(self):
        launcher=self.launch();self.acquire(launcher)
        with patch.object(launcher,'_audit',side_effect=OSError):
            self.assertEqual(launcher.request('sync',target())['code'],'SECURITY_OR_AUDIT_FAILED')
        self.assertEqual(self.count(),0);self.assertEqual(self.held(),1)

    def test_audit_is_structured_bounded_and_has_no_keys_or_tokens(self):
        launcher=self.launch();self.acquire(launcher);token=launcher.token;launcher.close()
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:
            rows=db.execute('SELECT event,binding,observed_ms,pid FROM native_audit').fetchall()
        text=json.dumps(rows)
        self.assertNotIn(self.key.hex(),text);self.assertNotIn(token,text)
        self.assertIn('READY',text);self.assertIn('STOPPED',text)

    def test_previous_interrupted_lifecycle_never_clears_hold_on_restart(self):
        launcher=self.launch();launcher.close()
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:
            db.execute('UPDATE native_state SET active=1')
        recovered=self.launch();self.acquire(recovered);self.mirror()
        self.assertEqual(self.held(),1);self.assertTrue(recovered.ready.stopped)
        self.assertFalse(recovered.request('sync',target())['success'])

    def test_existing_bridge_stop_is_not_cleared(self):
        (self.root/'bridge-stop.json').write_text('held');(self.root/'bridge-stop.json').chmod(0o600)
        launcher=self.launch();self.acquire(launcher);self.mirror()
        self.assertFalse(launcher.request('sync',target())['success'])
        self.assertTrue((self.root/'bridge-stop.json').exists())

    def test_closed_launcher_cannot_stop_later_owner(self):
        old=self.launch();old.close();new=self.launch();self.acquire(new)
        old.close()
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:
            self.assertEqual(db.execute('SELECT active FROM native_state').fetchone()[0],1)
        self.mirror();self.assertTrue(new.request('sync',target())['success'])

    def test_unconfirmed_job_termination_retains_ownership_and_quarantine(self):
        launcher=self.launch();self.acquire(launcher)
        launcher.job=Mock();launcher.job.empty.return_value=False
        launcher.close()
        self.assertFalse(launcher.closed);self.assertIsNotNone(launcher.owner.stream)
        self.assertIn(launcher,_QUARANTINE);self.assertEqual(self.held(),1)
        launcher.job.empty.return_value=True;launcher.close()
        self.assertTrue(launcher.closed);self.assertNotIn(launcher,_QUARANTINE)

    def test_missing_lifecycle_or_unknown_stop_backend_is_stopped(self):
        self.assertTrue(stop_active(self.root,self.b,'windows'))
        self.assertTrue(stop_active(self.root,self.b,'unknown'))
        self.mirror()
        self.assertTrue(stop_active(self.root,self.b,'linux-reference'))

    def test_audit_capacity_exhaustion_blocks_progress_and_holds(self):
        launcher=self.launch();self.acquire(launcher)
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:
            db.executemany('INSERT INTO native_audit(event,binding,observed_ms,pid) VALUES(?,?,?,?)',
                [('IPC',self.b.digest(),0,0)]*10000)
        self.assertFalse(launcher.request('sync',target())['success'])
        self.assertEqual(self.held(),1);self.assertEqual(self.count(),0)

    def test_new_mirror_cannot_clear_persistent_failure_hold(self):
        launcher=self.launch(faults=dict(disconnect_after_sync=True));self.acquire(launcher);self.mirror()
        launcher.request('sync',target());launcher.close()
        self.mirror(False)
        recovered=self.launch();self.acquire(recovered)
        self.assertFalse(recovered.request('sync',target(2))['success'])
        self.assertEqual(self.held(),1)

    def test_worker_guard_blocks_vendor_tcp_udp_and_process_launch(self):
        script = """import sys,socket,subprocess,os
sys.path.insert(0,sys.argv[1])
from native_windows_worker import install_guard
install_guard()
try: import MetaTrader5
except ImportError as error: assert 'forbidden' in str(error)
else: raise AssertionError('SDK import permitted')
for family,address in [(socket.AF_INET,('127.0.0.1',9)),(socket.AF_INET6,('::1',9))]:
 with socket.socket(family) as sock:
  try: sock.connect(address)
  except PermissionError: pass
  else: raise AssertionError('TCP permitted')
 with socket.socket(family,socket.SOCK_DGRAM) as sock:
  try: sock.sendto(b'x',address)
  except PermissionError: pass
  else: raise AssertionError('UDP permitted')
for invoke in [lambda: subprocess.Popen([sys.executable,'-c','pass']),lambda: os.system('echo forbidden')]:
 try: invoke()
 except PermissionError: pass
 else: raise AssertionError('Launch permitted')
print('GUARDS_PASS')
"""
        completed=subprocess.run([sys.executable,'-I','-c',script,str(Path(__file__).resolve().parents[1])],
                                 capture_output=True,text=True,timeout=5)
        self.assertEqual(completed.returncode,0,completed.stderr)
        self.assertEqual(completed.stdout.strip(),'GUARDS_PASS')

    def test_other_tenant_or_account_cannot_adopt_existing_state(self):
        for changed in (dict(tenant='other'),dict(account='other')):
            with patch('native_windows_candidate.subprocess.Popen') as spawn:
                with self.assertRaises(ValueError):
                    NativeWindowsSimulation.linux_reference(self.root,binding(**changed),self.key)
                spawn.assert_not_called()

    def test_stop_activated_during_mock_send_delay_prevents_fill(self):
        import threading
        launcher=self.launch(faults=dict(before_send_ms=500));self.acquire(launcher);self.mirror()
        timer=threading.Timer(.1,lambda:self.mirror(True));timer.start()
        try:self.assertFalse(launcher.request('sync',target())['success'])
        finally:timer.join(2)
        self.assertEqual(self.count(),0)

    def test_deleted_lifecycle_never_recreates_authorization_on_recovery(self):
        launcher=self.launch();launcher.close()
        (self.root/'native-lifecycle.sqlite3').unlink()
        self.mirror()
        self.assertTrue(stop_active(self.root,self.b,'linux-reference'))
        self.assertFalse((self.root/'native-lifecycle.sqlite3').exists())
        with self.assertRaises(ValueError):self.launch()
        self.assertFalse((self.root/'native-lifecycle.sqlite3').exists())

    def test_corrupt_lifecycle_is_not_repaired_automatically(self):
        path=self.root/'native-lifecycle.sqlite3';path.write_bytes(b'corrupt');path.chmod(0o600)
        with self.assertRaises(sqlite3.DatabaseError):self.launch()
        self.assertEqual(path.read_bytes(),b'corrupt')

    def test_missing_audit_schema_is_not_recreated_on_recovery(self):
        launcher=self.launch();launcher.close()
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:db.execute('DROP TABLE native_audit')
        self.mirror()
        self.assertTrue(stop_active(self.root,self.b,'linux-reference'))
        with self.assertRaises(sqlite3.OperationalError):self.launch()
        with sqlite3.connect(self.root/'native-lifecycle.sqlite3') as db:
            self.assertFalse(db.execute("SELECT 1 FROM sqlite_master WHERE name='native_audit'").fetchone())

    def test_observer_hold_write_failure_is_reported_as_unrecorded(self):
        launcher=self.launch(faults=dict(disconnect_after_sync=True));self.acquire(launcher);self.mirror()
        with patch('native_windows_candidate.hold_after_transport_failure',side_effect=OSError):
            reply=launcher.request('sync',target())
        self.assertEqual(reply['code'],'TRANSPORT_HOLD_UNRECORDED')
        self.assertTrue(reply['uncertain']);self.assertEqual(self.held(),1)

    def test_spawn_command_contains_no_keys_and_uses_isolated_environment(self):
        real=subprocess.Popen;calls=[]
        def record(*args,**kwargs):calls.append((args,kwargs));return real(*args,**kwargs)
        with patch('native_windows_candidate.subprocess.Popen',side_effect=record),patch.dict(os.environ,{'MT5_PASSWORD':'fixture-only','DATABASE_URL':'fixture-only','PYTHONPATH':'untrusted-fixture'}):
            launcher=self.launch()
        args,kwargs=calls[0]
        self.assertNotIn(self.key.hex(),str(args));self.assertIn('-I',args[0]);self.assertTrue(kwargs['close_fds'])
        for name in ('MT5_PASSWORD','DATABASE_URL','PYTHONPATH'):self.assertNotIn(name,kwargs['env'])
        self.assertEqual(kwargs['cwd'],self.root)


if __name__=='__main__':unittest.main(verbosity=2)
