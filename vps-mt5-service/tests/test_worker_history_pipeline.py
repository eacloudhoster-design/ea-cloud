"""Actual guarded subprocess/stdio tests on Linux, not native Windows acceptance."""
from contextlib import closing
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_history_pipeline import (HistoryWorkerSimulation, prepare_history_worker,
    ExecutionReceipt, HistoryCertificate)
from native_windows_candidate import NativeWindowsSimulation
from private_ipc import Binding, canonical, Envelope, sign, verify
from sdk_ipc_candidate import wall_ms


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'worker';self.key=secrets.token_bytes(32)
        self.b=Binding.model_validate(dict(simulation=True,tenant='tenant',account='client',broker='justmarkets',login=1,server='SimulationOnly'))
        prepare_history_worker(self.root,self.b,self.key)
        self.worker=None;self.sequence=0;self.oid='a'*28
        self.addCleanup(lambda:self.worker.close() if self.worker else None)
        self.mirror()

    def mirror(self,stopped=False):
        path=self.root/'mock-stop.json'
        if not path.exists():path.touch(mode=0o600)
        now=wall_ms();path.write_bytes(canonical(dict(simulation=True,binding=self.b.digest(),stopped=stopped,
            observed_ms=now,expires_ms=now+3000)))

    def launch(self,**kw):
        self.mirror();self.worker=HistoryWorkerSimulation.linux_reference(self.root,self.b,self.key,**kw)
        self.assertNotEqual(self.worker.process.pid,os.getpid())
        self.assertTrue(self.worker.request('acquire')['success']);return self.worker

    @property
    def book_path(self):return self.root/'history-authority'/'accounts'/self.b.digest()/'history.sqlite3'
    def projection(self):
        with closing(sqlite3.connect(self.book_path)) as db:return json.loads(db.execute('SELECT projection FROM meta').fetchone()[0])
    def count(self):
        with closing(sqlite3.connect(self.book_path)) as db:return db.execute('SELECT count(*) FROM events').fetchone()[0]
    def held(self):
        with closing(sqlite3.connect(self.root/'native-lifecycle.sqlite3')) as db:return bool(db.execute('SELECT held FROM native_state').fetchone()[0])
    def shared_held(self):
        with closing(sqlite3.connect(self.root/'history-authority'/'authority.sqlite3')) as db:return bool(db.execute('SELECT held FROM accounts').fetchone()[0])
    def body(self,action,**kw):
        data=dict(login=1,server='SimulationOnly',action=action)
        if action!='reconcile':
            self.sequence+=1;data.update(sequence=self.sequence,event_id=secrets.token_hex(16),order_id=self.oid)
        if action=='create':data.update(sourceKey='a'*64,symbol='EURUSD',side=0,volume=.1)
        if action=='fill':data.update(volume=.04,price=1.2)
        if action=='modify':data.update(volume=.12,sl=1.,tp=2.)
        data.update(kw);return data
    def call(self,action,**kw):return self.worker.request('sync',self.body(action,**kw))
    def ok(self,action,**kw):
        reply=self.call(action,**kw);self.assertTrue(reply['success'],reply);return reply['data']
    def restart(self,**kw):
        self.assertTrue(self.worker.close());self.launch(**kw)

    def test_complete_partial_fill_modify_close_lifecycle(self):
        self.launch();self.ok('create');self.ok('fill');self.ok('modify');last=self.ok('fill',volume=.08)
        self.assertEqual(last['executed_volume'],.12);opening=self.oid;self.oid='b'*28
        self.ok('create',kind='close',position=opening,side=1,volume=.06)
        self.ok('fill',volume=.02);self.ok('fill',volume=.04)
        self.assertEqual(self.projection()['positions'][opening]['units'],6)
        proof=self.ok('reconcile');self.assertEqual(proof['deals'],4);self.assertFalse(proof['hold_required'])

    def test_cancel_after_partial_through_worker(self):
        self.launch();self.ok('create');self.ok('fill');r=self.ok('cancel')
        self.assertEqual(r['cancelled_volume'],.06);self.assertEqual(self.projection()['positions'][self.oid]['units'],4)
        self.ok('reconcile')

    def test_partial_close_then_cancel_preserves_remaining_position(self):
        self.launch();self.ok('create');self.ok('fill',volume=.1);position=self.oid;self.oid='b'*28
        self.ok('create',kind='close',position=position,side=1);self.ok('fill');self.ok('cancel')
        self.assertEqual(self.projection()['positions'][position]['units'],6)

    def test_duplicate_event_and_rpc_across_restart(self):
        self.launch();self.ok('create');body=self.body('fill');rid=secrets.token_hex(16)
        first=self.worker.request('sync',body,request_id=rid);self.assertTrue(first['success'])
        self.restart();self.assertEqual(self.worker.request('sync',body,request_id=rid),first)
        self.assertEqual(self.worker.request('sync',body),first);self.assertEqual(self.count(),2)
        self.assertEqual(self.ok('reconcile')['deals'],1)

    def test_out_of_order_holds_and_recovery_keeps_hold(self):
        self.launch();self.ok('create');self.assertFalse(self.call('fill',sequence=3)['success'])
        self.assertTrue(self.shared_held());self.restart();self.assertEqual(self.call('fill')['code'],'HELD')
        self.assertFalse(self.call('reconcile')['success']);self.assertEqual(self.count(),1)

    def test_duplicate_event_conflict_holds(self):
        self.launch();self.ok('create');body=self.body('fill');self.worker.request('sync',body)
        body['volume']=.05;self.assertFalse(self.worker.request('sync',body)['success']);self.assertTrue(self.shared_held())
        self.assertEqual(self.count(),2)

    def test_clean_restart_reconciles_without_effect_replay(self):
        self.launch();self.ok('create');self.ok('fill');before=self.projection();self.restart()
        self.assertEqual(self.ok('reconcile')['deals'],1);self.assertEqual(self.projection(),before)
        self.ok('fill',volume=.06);self.assertEqual(self.count(),3)

    def test_committed_fill_crash_preserves_both_holds(self):
        self.launch(faults=dict(crash_after_fill=True));self.ok('create')
        self.assertFalse(self.call('fill')['success']);self.assertTrue(self.worker.quiesced)
        self.assertEqual(self.projection()['positions'][self.oid]['units'],4)
        self.assertTrue(self.held());self.assertTrue(self.shared_held());self.restart()
        self.assertFalse(self.call('fill',volume=.06)['success']);self.assertEqual(self.count(),2)

    def test_disconnect_after_commit_keeps_single_effect(self):
        self.launch();self.ok('create');self.restart(faults=dict(disconnect_after_sync=True))
        self.assertFalse(self.call('fill')['success']);self.assertTrue(self.held());self.assertTrue(self.shared_held())
        self.assertEqual(self.count(),2)

    def test_timeout_before_dispatch_has_no_fill_and_stays_held(self):
        self.launch(timeout=.1,faults=dict(before_send_ms=300))
        self.assertFalse(self.call('create')['success']);self.assertTrue(self.worker.quiesced)
        self.assertTrue(self.held());self.assertTrue(self.shared_held());self.assertEqual(self.count(),0)

    def test_reply_timeout_after_commit_preserves_single_effect(self):
        self.launch(timeout=.6,faults=dict(reply_delay_ms=300));self.worker.timeout=.1
        self.assertFalse(self.call('create')['success'])
        self.assertEqual(self.count(),1);self.assertTrue(self.held());self.assertTrue(self.shared_held())

    def test_worker_kill_cannot_resume_execution(self):
        self.launch();self.ok('create');self.worker.child.kill();self.worker.child.wait(timeout=2)
        self.assertFalse(self.call('fill')['success']);self.worker.close();self.assertTrue(self.held())
        self.restart();self.assertFalse(self.call('fill')['success']);self.assertEqual(self.count(),1)

    def test_emergency_stop_overrides_valid_controller(self):
        self.launch();self.ok('create');self.mirror(True)
        self.assertEqual(self.call('fill')['code'],'STOPPED');self.assertEqual(self.call('reconcile')['code'],'STOPPED')
        self.assertEqual(self.count(),1)

    def test_stop_during_worker_delay_prevents_effect(self):
        self.launch(faults=dict(before_send_ms=300));self.mirror()
        timer=threading.Timer(.1,lambda:self.mirror(True));timer.start()
        try:self.assertEqual(self.call('create')['code'],'STOPPED')
        finally:timer.join(1)
        self.assertEqual(self.count(),0)

    def test_missing_stop_mirror_fails_closed(self):
        self.launch();(self.root/'mock-stop.json').unlink()
        self.assertEqual(self.call('create')['code'],'STOPPED');self.assertEqual(self.count(),0)

    def test_conflicting_controller_is_rejected_over_stdio(self):
        self.launch();old=self.worker.controller;self.worker.controller=secrets.token_hex(16)
        try:
            self.assertEqual(self.worker.request('acquire')['code'],'OWNER_CONFLICT')
            self.assertEqual(self.call('create')['code'],'LEASE_INVALID')
        finally:self.worker.controller=old
        self.assertEqual(self.count(),0)

    def test_expired_lease_rejected(self):
        self.launch();self.ok('create');time.sleep(2.05);self.mirror()
        self.assertEqual(self.call('fill')['code'],'LEASE_INVALID');self.assertEqual(self.count(),1)

    def test_account_identity_conflict_rejected(self):
        self.launch();self.assertEqual(self.call('create',login=2)['code'],'IDENTITY_MISMATCH');self.assertEqual(self.count(),0)

    def test_source_ownership_close_conflict(self):
        self.launch();self.ok('create');self.ok('fill',volume=.1);position=self.oid;self.oid='b'*28
        self.assertFalse(self.call('create',kind='close',position=position,side=1,sourceKey='b'*64)['success'])
        self.assertTrue(self.shared_held());self.assertEqual(self.count(),2)

    def test_corrupt_history_cannot_be_reconciled(self):
        self.launch();self.ok('create')
        with closing(sqlite3.connect(self.book_path)) as db:
            with db:db.execute("UPDATE meta SET projection='{}'")
        self.assertFalse(self.call('reconcile')['success']);self.assertTrue(self.shared_held())

    def test_missing_history_not_recreated_on_startup(self):
        self.launch();self.worker.close();self.book_path.unlink()
        with self.assertRaises(ValueError):self.launch()
        self.assertFalse(self.book_path.exists());self.assertTrue(self.held())

    def test_absolute_target_launcher_cannot_adopt_history_fixture(self):
        with self.assertRaisesRegex(ValueError,'protocol'):NativeWindowsSimulation.linux_reference(self.root,self.b,self.key)

    def test_native_windows_history_is_explicitly_blocked(self):
        with self.assertRaisesRegex(ValueError,'native Windows'):HistoryWorkerSimulation(self.root,self.b,self.key)

    def test_missing_mode_marker_cannot_downgrade_worker(self):
        self.launch();self.worker.close();(self.root/'history-worker.json').unlink()
        with self.assertRaises(ValueError):NativeWindowsSimulation.linux_reference(self.root,self.b,self.key)
        with self.assertRaises(Exception):self.launch()

    def test_startup_failure_is_bounded_and_sticky(self):
        with self.assertRaises(ValueError):self.launch(faults=dict(exit_before_ready=True))
        self.assertTrue(self.held());self.assertTrue(self.shared_held())

    def test_lifecycle_audit_and_history_audit_record_complete_path(self):
        self.launch();self.ok('create');self.ok('fill');self.ok('cancel');self.ok('reconcile');self.worker.close()
        with closing(sqlite3.connect(self.root/'native-lifecycle.sqlite3')) as db:
            events=[r[0] for r in db.execute('SELECT event FROM native_audit')]
        self.assertTrue({'STARTING','READY','IPC','STOPPED'}<=set(events))
        with closing(sqlite3.connect(self.book_path)) as db:self.assertEqual([r[0] for r in db.execute('SELECT event FROM audit')],['CREATE','FILL','CANCEL','RECONCILED'])
        self.assertNotIn('MetaTrader5',sys.modules)

    def test_unauthorized_signature_terminates_worker_and_holds(self):
        self.launch();body=self.body('create')
        from private_ipc import sign as actual_sign
        with patch('sdk_ipc_candidate.sign',lambda message,key:actual_sign(message,b'x'*32)):
            self.assertFalse(self.worker.request('sync',body)['success'])
        self.assertTrue(self.held());self.assertTrue(self.shared_held());self.assertEqual(self.count(),0)

    def test_nonce_replay_rejected_through_actual_worker(self):
        self.launch();create=self.body('create');fill=self.body('fill')
        with patch('sdk_ipc_candidate.secrets.token_hex',lambda n:'c'*(2*n)):
            self.assertTrue(self.worker.request('sync',create,request_id='1'*32)['success'])
            self.assertEqual(self.worker.request('sync',fill,request_id='2'*32)['code'],'REPLAY')
        self.assertEqual(self.count(),1)

    def test_untrusted_extra_execution_fields_rejected(self):
        self.launch();self.assertFalse(self.call('create',password='not-a-credential')['success']);self.assertEqual(self.count(),0)

    def test_status_renew_and_fencing_survive_clean_restart(self):
        self.launch();epoch=self.worker.epoch
        self.assertTrue(self.worker.request('renew')['success'])
        self.assertFalse(self.worker.request('status')['data']['held'])
        self.restart();self.assertGreater(self.worker.epoch,epoch)
        self.ok('create')

    def test_history_receipt_wrong_order_is_rejected_by_parent(self):
        self.launch();body=self.body('create');self.ok('reconcile')
        request=Envelope(version=1,binding=self.b.digest(),controller=self.worker.controller,
            request_id='1'*32,nonce='2'*64,issued_ms=wall_ms(),deadline_ms=wall_ms()+1000,
            epoch=self.worker.epoch,lease_token=self.worker.token,operation='sync',body=body)
        outcome=dict(success=True,code='SIMULATED_HISTORY_APPLIED',uncertain=False,data=dict(order_id='b'*28,
            state='active',requested_volume=.1,executed_volume=0.,remaining_volume=.1,active_remaining_volume=.1,cancelled_volume=0.))
        with self.assertRaises(Exception):self.worker._validate_success(request,outcome)

    def test_pipeline_audit_correlates_authenticated_request_with_fill(self):
        self.launch();self.ok('create');rid=secrets.token_hex(16)
        self.assertTrue(self.worker.request('sync',self.body('fill'),request_id=rid)['success'])
        with closing(sqlite3.connect(self.root/'history-pipeline.sqlite3')) as db:
            rows=db.execute('SELECT kind,request_id,code FROM events WHERE request_id=?',[rid]).fetchall()
        self.assertEqual(rows,[('REQUEST',rid,None),('RESULT',rid,'SIMULATED_HISTORY_APPLIED')])
        with closing(sqlite3.connect(self.book_path)) as db:
            self.assertEqual(db.execute('SELECT command_id FROM events WHERE sequence=2').fetchone()[0],rid)

    def test_missing_pipeline_audit_fails_closed_before_effect(self):
        self.launch();(self.root/'history-pipeline.sqlite3').unlink()
        self.assertFalse(self.call('create')['success']);self.assertEqual(self.count(),0)
        self.assertTrue(self.held());self.assertTrue(self.shared_held())

    def test_result_audit_failure_after_commit_preserves_holds(self):
        self.launch()
        with closing(sqlite3.connect(self.root/'history-pipeline.sqlite3')) as db:
            db.execute("CREATE TRIGGER reject_result BEFORE INSERT ON events WHEN NEW.kind='RESULT' BEGIN SELECT RAISE(ABORT,'offline failure'); END")
        self.assertFalse(self.call('create')['success']);self.assertEqual(self.count(),1)
        self.assertTrue(self.held());self.assertTrue(self.shared_held())

    def test_missing_installed_native_lifecycle_is_never_recreated(self):
        self.launch();self.worker.close();(self.root/'native-lifecycle.sqlite3').unlink()
        with self.assertRaises(ValueError):self.launch()
        self.assertFalse((self.root/'native-lifecycle.sqlite3').exists())

    def test_pipeline_identity_corruption_refuses_startup(self):
        with closing(sqlite3.connect(self.root/'history-pipeline.sqlite3')) as db:
            with db:db.execute("UPDATE metadata SET binding=?",['f'*64])
        with self.assertRaises(ValueError):self.launch()
        self.assertEqual(self.count(),0)

    def test_durable_protocol_witness_prevents_marker_removal_downgrade(self):
        self.launch();self.worker.close();(self.root/'history-worker.json').unlink()
        (self.root/'history-authority').rename(Path(self.tmp.name)/'preserved-authority')
        with self.assertRaisesRegex(ValueError,'protocol'):NativeWindowsSimulation.linux_reference(self.root,self.b,self.key)

    def test_certificate_requires_literal_false_for_retry(self):
        with self.assertRaises(Exception):HistoryCertificate.model_validate(dict(sequence=0,history_digest='0'*64,
            orders=0,deals=0,positions=0,automatic_retry_allowed=0,hold_required=False))

    def test_strict_receipt_rejects_inconsistent_volume(self):
        with self.assertRaises(Exception):ExecutionReceipt.model_validate(dict(order_id=self.oid,state='active',requested_volume=.1,
            executed_volume=.04,remaining_volume=.08,active_remaining_volume=.08,cancelled_volume=0.))

    def test_receipt_rejects_unrequested_financial_fields(self):
        with self.assertRaises(Exception):HistoryCertificate.model_validate(dict(sequence=0,history_digest='0'*64,orders=0,deals=0,
            positions=0,automatic_retry_allowed=False,hold_required=False,financial_execution=True))

if __name__=='__main__':unittest.main()
