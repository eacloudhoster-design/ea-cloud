"""Offline synthetic contract + IPC + worker tests. No real SDK/native Windows claim."""
import json
import secrets
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from private_ipc import Binding, Envelope, canonical, sign, verify
from sdk_ipc_candidate import CandidateEngine, prepare_simulation, wall_ms
from sdk_adapter_candidate import (AdapterEngine, AdapterError, AdapterFaults,
                                   SyntheticSdkAdapter, ReconciliationSdk, TABLES)
from native_windows_candidate import NativeWindowsSimulation


def binding(**changes):
    return Binding.model_validate(dict(dict(simulation=True,tenant='tenant',account='client',
        broker='justmarkets',login=1,server='SimulationOnly'),**changes))


def target(**changes):
    return dict(dict(login=1,server='SimulationOnly',sourceKey='a'*64,revision=1,symbol='EURUSD',
                     target=.1,sl=0.,tp=0.,maxVolume=1.),**changes)


def order(**changes):
    return dict(dict(action=1,symbol='EURUSD',volume=.1,type=0,price=1.1001,sl=0.,tp=0.,
        magic=12345,deviation=20,comment='EC:'+secrets.token_hex(14),type_time=0),**changes)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'state';self.b=binding();self.key=secrets.token_bytes(32)
        prepare_simulation(self.root,self.b)
        self.stopped=False
        self.engine=AdapterEngine(self.root,self.b,self.key,stop_checker=lambda:self.stopped)
        self.addCleanup(lambda:self.engine.close())
        self.controller='a'*32;self.epoch=0;self.token=''

    @property
    def sdk(self):return self.engine.sdk

    def send(self,request,permit=lambda:True,deadline=None):
        with self.sdk.operation_scope(permit,deadline or time.monotonic()+1):
            return self.sdk.send(request,request.get('symbol','EURUSD'))

    def frame(self,operation,body=None,**changes):
        now=wall_ms()
        value=dict(version=1,binding=self.b.digest(),controller=self.controller,
            request_id=secrets.token_hex(16),nonce=secrets.token_hex(32),issued_ms=now,deadline_ms=now+2000,
            epoch=0 if operation=='acquire' else self.epoch,lease_token='' if operation=='acquire' else self.token,
            operation=operation,body=body or {})
        value.update(changes);return sign(Envelope.model_validate(value).model_dump(),self.key)

    def call(self,operation,body=None,**changes):
        outcome=verify(self.engine.handle(self.frame(operation,body,**changes)),self.key,'response')['result']
        if outcome['code']=='LEASED':
            self.epoch=outcome['data']['epoch'];self.token=outcome['data']['lease_token']
        return outcome

    def acquire(self):self.assertTrue(self.call('acquire')['success'])

    def fills(self):return self.sdk.db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def restart(self):
        self.engine.close()
        self.engine=AdapterEngine(self.root,self.b,self.key,stop_checker=lambda:self.stopped)
        self.epoch=0;self.token=''

    def test_structural_interface_and_vendor_entry_points_absent(self):
        self.assertIsInstance(self.sdk,ReconciliationSdk)
        for method in ('initialize','login','order_send','terminal_info','shutdown'):
            self.assertFalse(hasattr(self.sdk,method))

    def test_arbitrary_backend_or_missing_owner_cannot_be_injected(self):
        for backend,owner in ((NS(),self.engine.owner),(self.sdk.backend,None)):
            with self.assertRaises(AdapterError):SyntheticSdkAdapter(backend,self.b,self.root,owner)

    def test_live_binding_cannot_be_created(self):
        for changes in (dict(simulation=False),dict(server='BrokerLive'),dict(role='mentor'),dict(login=True)):
            with self.assertRaises(ValueError):binding(**changes)

    def test_only_approved_exact_symbols_available(self):
        for symbol in ('EURUSD ','eurusd','EURUSDm','../EURUSD','','BTCUSD',True):
            with self.subTest(symbol=symbol),self.assertRaises(AdapterError):self.sdk.symbol_info(symbol)
        self.assertGreater(self.sdk.symbol_info('XAUUSD').volume_min,0)

    def test_no_send_without_private_operation_permit(self):
        with self.assertRaises(AdapterError):self.sdk.send(order(),'EURUSD')
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_false_stop_fence_permit_or_expired_budget_never_sends(self):
        for permit,deadline in ((lambda:False,time.monotonic()+1),(lambda:True,time.monotonic()-1)):
            with self.assertRaises(AdapterError):self.send(order(),permit,deadline)
        self.assertEqual(self.fills(),0)

    def test_order_create_modify_partial_close_and_close(self):
        self.send(order())
        position=self.sdk.positions_get(symbol='EURUSD')[0]
        modification=order(action=6,position=position.ticket,sl=1.,tp=1.2)
        for key in ('volume','type','price'):modification.pop(key)
        self.send(modification)
        position=self.sdk.positions_get()[0];self.assertEqual((position.sl,position.tp),(1.,1.2))
        close=order(position=position.ticket,type=1,price=1.1,volume=.04)
        for key in ('sl','tp'):close.pop(key)
        self.send(close)
        self.assertAlmostEqual(self.sdk.positions_get()[0].volume,.06)
        close.update(volume=.06,comment='EC:'+secrets.token_hex(14));self.send(close)
        self.assertEqual(self.sdk.positions_get(),());self.assertEqual(self.fills(),4)

    def test_exact_duplicate_create_and_closed_position_return_receipt_once(self):
        create=order();first=self.send(create);self.send(create)
        self.assertEqual(self.fills(),1)
        close=order(position=self.sdk.positions_get()[0].ticket,type=1,price=1.1)
        for key in ('sl','tp'):close.pop(key)
        receipt=self.send(close);duplicate=self.send(close)
        self.assertEqual(receipt.deal,duplicate.deal);self.assertEqual(self.fills(),2)
        self.assertEqual(self.sdk.positions_get(),())

    def test_operation_id_conflict_latches_hold(self):
        create=order();self.send(create);create['volume']=.2
        with self.assertRaises(AdapterError):self.send(create)
        self.assertEqual(self.fills(),1);self.assertTrue(self.sdk.held)

    def test_malformed_numeric_side_and_volume_orders_rejected(self):
        invalid=[dict(volume=True),dict(volume=float('nan')),dict(volume=.015),dict(volume=11.),
                 dict(price=0.),dict(type=True),dict(type=7),dict(magic=True),dict(action=7),
                 dict(deviation=10),dict(comment='plain'),dict(sl=-1.),dict(tp=float('inf'))]
        for changes in invalid:
            with self.subTest(changes=changes),self.assertRaises(AdapterError):self.send(order(**changes))
        self.assertEqual(self.fills(),0)

    def test_credentials_or_unknown_order_fields_rejected(self):
        for name in ('password','server','terminal_path','backend'):
            with self.assertRaises(AdapterError):self.send(order(**{name:'forbidden'}))
        self.assertEqual(self.fills(),0)

    def test_cross_source_position_modification_refused(self):
        self.send(order());position=self.sdk.positions_get()[0]
        close=order(position=position.ticket,type=1,price=1.1,magic=54321)
        for key in ('sl','tp'):close.pop(key)
        with self.assertRaises(AdapterError):self.send(close)
        self.assertEqual(self.fills(),1);self.assertAlmostEqual(self.sdk.positions_get()[0].volume,.1)

    def test_overclose_and_same_side_close_refused(self):
        self.send(order());position=self.sdk.positions_get()[0]
        close=order(position=position.ticket,type=0,price=1.1)
        for key in ('sl','tp'):close.pop(key)
        with self.assertRaises(AdapterError):self.send(close)
        close.update(type=1,volume=.2)
        with self.assertRaises(AdapterError):self.send(close)
        self.assertEqual(self.fills(),1)

    def test_invalid_stop_loss_take_profit_levels_refused(self):
        with self.assertRaises(AdapterError):self.send(order(sl=1.3,tp=1.2))
        self.assertEqual(self.fills(),0)

    def test_account_and_tenant_descriptor_revalidated_on_every_read(self):
        self.sdk.backend.account=replace(self.sdk.backend.account,id='other')
        with self.assertRaises(AdapterError):self.sdk.account_info()
        self.assertTrue(self.sdk.held)

    def test_nonzero_internal_delay_and_disconnection_are_refused(self):
        self.sdk.backend.account=replace(self.sdk.backend.account,delay_ms=100)
        with self.assertRaises(AdapterError):self.sdk.account_info()
        self.assertTrue(self.sdk.held)

    def test_wrong_account_mode_and_nonfinite_equity_fail_closed(self):
        for info in (NS(login=2,server='SimulationOnly',trade_mode=0,margin_mode=2,equity=10000),
                     NS(login=1,server='SimulationOnly',trade_mode=2,margin_mode=2,equity=10000),
                     NS(login=1,server='SimulationOnly',trade_mode=0,margin_mode=2,equity=float('nan'))):
            with patch.object(self.sdk.backend,'account_info',return_value=info):
                with self.assertRaises(AdapterError):self.sdk.account_info()
        self.assertTrue(self.sdk.held)

    def test_invalid_quote_and_symbol_constraints_latch_hold(self):
        with patch.object(self.sdk.backend,'symbol_info_tick',return_value=NS(bid=2.,ask=1.)):
            with self.assertRaises(AdapterError):self.sdk.symbol_info_tick('EURUSD')
        with patch.object(self.sdk.backend,'symbol_info',return_value=NS(volume_min=.1,volume_max=.01,volume_step=.01,point=.00001)):
            with self.assertRaises(AdapterError):self.sdk.symbol_info('EURUSD')
        self.assertTrue(self.sdk.held)

    def test_missing_or_duplicate_position_snapshot_fail_closed(self):
        row=NS(ticket=1,magic=12345,type=0,volume=.1,sl=0.,tp=0.,symbol='EURUSD')
        for rows in (None,(row,row)):
            with patch.object(self.sdk.backend,'positions_get',return_value=rows):
                with self.assertRaises(AdapterError):self.sdk.positions_get()
        self.assertTrue(self.sdk.held)

    def test_delayed_snapshot_timeout_fails_closed(self):
        self.sdk.budget=.01
        original=self.sdk.backend.account_info
        def delayed():time.sleep(.02);return original()
        with patch.object(self.sdk.backend,'account_info',side_effect=delayed):
            with self.assertRaises(AdapterError):self.sdk.account_info()
        self.assertTrue(self.sdk.held)

    def test_sdk_pre_send_failure_never_fills(self):
        self.sdk.faults=AdapterFaults(fail_before_send=True)
        with self.assertRaises(AdapterError):self.send(order())
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_sdk_timeout_is_bounded_and_persists_unknown_intent(self):
        self.sdk.faults=AdapterFaults(delay_ms=500)
        start=time.monotonic()
        with self.assertRaises(AdapterError):self.send(order())
        self.assertLess(time.monotonic()-start,1)
        self.assertEqual(self.fills(),0)
        self.assertEqual(self.sdk.db.execute('SELECT phase FROM sdk_adapter_operations').fetchone()[0],'processing')
        self.restart();self.assertTrue(self.sdk.held)

    def test_stop_or_fence_change_during_synthetic_delay_prevents_send(self):
        self.sdk.faults=AdapterFaults(delay_ms=150)
        gate=[True];timer=threading.Timer(.03,lambda:gate.__setitem__(0,False));timer.start()
        try:
            with self.assertRaises(AdapterError):self.send(order(),lambda:gate[0])
        finally:timer.join(1)
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_lost_or_invalid_receipt_never_retries_fill_on_recovery(self):
        self.sdk.faults=AdapterFaults(fail_after_fill=True)
        request=order()
        with self.assertRaises(AdapterError):self.send(request)
        self.assertEqual(self.fills(),1)
        self.restart()
        with self.assertRaises(AdapterError):self.send(request)
        self.assertEqual(self.fills(),1);self.assertTrue(self.sdk.held)

    def test_sdk_exception_does_not_expose_raw_exception_or_request(self):
        with patch.object(self.sdk.backend,'send',side_effect=RuntimeError('sensitive fixture value')):
            with self.assertRaises(AdapterError) as error:self.send(order())
        self.assertEqual(str(error.exception),'SYNTHETIC_ADAPTER_HELD');self.assertEqual(self.fills(),0)

    def test_audit_failure_before_backend_send_refuses_and_holds(self):
        with patch.object(self.sdk,'_audit',side_effect=sqlite3.OperationalError):
            with self.assertRaises(AdapterError):self.send(order())
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_audit_has_static_events_binding_and_hashed_operation_only(self):
        request=order();self.send(request)
        rows=self.sdk.db.execute('SELECT event,binding,operation FROM sdk_adapter_audit').fetchall()
        text=json.dumps([tuple(row) for row in rows])
        self.assertIn('INTENT',text);self.assertIn('COMPLETED',text)
        self.assertNotIn(request['comment'],text);self.assertNotIn(self.key.hex(),text)
        for row in rows:self.assertEqual(row[1],self.b.digest())

    def test_partial_adapter_schema_is_not_recreated(self):
        self.sdk.db.execute('DROP TABLE sdk_adapter_audit');self.sdk.db.commit()
        with self.assertRaises(AdapterError):self.restart()
        db=sqlite3.connect(self.root/'simulated-broker.sqlite3')
        try:self.assertFalse(db.execute("SELECT 1 FROM sqlite_master WHERE name='sdk_adapter_audit'").fetchone())
        finally:db.close()

    def test_deleted_adapter_tables_detected_by_observer_installation_witness(self):
        for table in TABLES:self.sdk.db.execute('DROP TABLE '+table)
        self.sdk.db.commit()
        with self.assertRaises(AdapterError):self.restart()

    def test_deleted_sdk_file_is_not_recreated_after_installation(self):
        self.engine.close();(self.root/'simulated-broker.sqlite3').unlink()
        with self.assertRaises(AdapterError):self.restart()
        self.assertFalse((self.root/'simulated-broker.sqlite3').exists())

    def test_other_account_cannot_adopt_adapter_root(self):
        with self.assertRaises(ValueError):AdapterEngine(self.root,binding(tenant='other'),self.key)

    def test_owner_conflict_cannot_adopt_or_reset_journals(self):
        with self.assertRaises(ValueError):AdapterEngine(self.root,self.b,self.key)
        self.assertFalse(self.sdk.held)

    def test_authenticated_absolute_target_lifecycle_and_mapping_consistency(self):
        self.acquire()
        for revision,volume,sl,tp in ((1,.1,0.,0.),(2,.1,1.,1.2),(3,0.,0.,0.)):
            reply=self.call('sync',target(revision=revision,target=volume,sl=sl,tp=tp))
            self.assertTrue(reply['success'],reply);self.assertFalse(reply['financial_execution'])
        self.assertEqual(self.sdk.positions_get(),());self.assertEqual(self.fills(),3)
        mappings=self.engine.db.execute('SELECT phase,request FROM order_mappings ORDER BY id').fetchall()
        self.assertEqual([row[0] for row in mappings],['acknowledged']*3)
        ops=self.sdk.db.execute('SELECT phase FROM sdk_adapter_operations').fetchall()
        self.assertEqual([row[0] for row in ops],['done']*3)

    def test_authenticated_duplicate_request_survives_restart_without_fill(self):
        self.acquire();request_id='f'*32
        self.assertTrue(self.call('sync',target(),request_id=request_id)['success'])
        self.restart();self.acquire()
        self.assertTrue(self.call('sync',target(),request_id=request_id)['success'])
        self.assertEqual(self.fills(),1)

    def test_exact_wire_replay_and_payload_conflict_are_rejected(self):
        self.acquire();frame=self.frame('sync',target(),request_id='f'*32)
        self.assertTrue(verify(self.engine.handle(frame),self.key,'response')['result']['success'])
        self.assertEqual(verify(self.engine.handle(frame),self.key,'response')['result']['code'],'REPLAY')
        self.assertEqual(self.call('sync',target(target=.2),request_id='f'*32)['code'],'IDEMPOTENCY_CONFLICT')
        self.assertEqual(self.fills(),1)

    def test_stale_fence_or_other_controller_cannot_send(self):
        self.acquire()
        for changes in (dict(epoch=self.epoch-1),dict(controller='b'*32),dict(lease_token='0'*64)):
            self.assertEqual(self.call('sync',target(),**changes)['code'],'LEASE_INVALID')
        self.assertEqual(self.fills(),0)

    def test_active_emergency_stop_blocks_before_adapter_intent(self):
        self.acquire();self.stopped=True
        self.assertEqual(self.call('sync',target())['code'],'STOPPED')
        self.assertEqual(self.fills(),0)
        self.assertEqual(self.sdk.db.execute('SELECT count(*) FROM sdk_adapter_operations').fetchone()[0],0)

    def test_existing_bridge_stop_cannot_be_overridden_by_adapter(self):
        self.acquire();(self.root/'bridge-stop.json').write_text('held')
        self.assertEqual(self.call('sync',target())['code'],'HELD');self.assertEqual(self.fills(),0)

    def test_sdk_read_failure_becomes_persistent_adapter_hold(self):
        self.acquire();self.sdk.faults=AdapterFaults(fail_read=True)
        self.assertFalse(self.call('sync',target())['success'])
        self.restart();self.assertTrue(self.sdk.held);self.acquire()
        self.assertEqual(self.call('sync',target())['code'],'HELD')

    def test_sdk_receipt_validation_failure_keeps_observer_uncertainty(self):
        self.acquire();self.sdk.faults=AdapterFaults(invalid_receipt=True)
        reply=self.call('sync',target());self.assertTrue(reply['uncertain'])
        self.assertEqual(self.fills(),1)
        phase=self.engine.db.execute('SELECT phase FROM allocations').fetchone()[0]
        self.assertEqual(phase,'dispatching')
        self.restart();self.assertTrue(self.engine._held())

    def test_rejected_sdk_receipt_never_becomes_success_or_retry(self):
        self.acquire()
        with patch.object(self.sdk.backend,'send',return_value=NS(retcode=10030,order=0,deal=0,volume=0)):
            outcome=self.call('sync',target())
        self.assertFalse(outcome['success']);self.assertTrue(outcome['uncertain'])
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_mismatched_post_fill_receipt_is_held(self):
        original=self.sdk.backend.send
        def mismatch(request,symbol):
            receipt=original(request,symbol);receipt.volume=.2;return receipt
        with patch.object(self.sdk.backend,'send',side_effect=mismatch):
            with self.assertRaises(AdapterError):self.send(order())
        self.assertEqual(self.fills(),1);self.assertTrue(self.sdk.held)

    def test_adapter_audit_capacity_blocks_before_fill(self):
        with self.sdk.db:
            self.sdk.db.executemany('INSERT INTO sdk_adapter_audit(event,binding,operation,observed_ns) VALUES(?,?,NULL,?)',
                [('STARTED',self.b.digest(),0)]*10000)
        with self.assertRaises(AdapterError):self.send(order())
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_deleted_observer_witness_file_is_not_recreated(self):
        self.engine.close();(self.root/'observer.sqlite3').unlink()
        with self.assertRaises(AdapterError):self.restart()
        self.assertFalse((self.root/'observer.sqlite3').exists())

    def test_direct_operation_receipt_is_durable_across_restart(self):
        request=order();first=self.send(request)
        self.restart();duplicate=self.send(request)
        self.assertEqual(first.deal,duplicate.deal);self.assertEqual(self.fills(),1)

    def test_existing_legacy_completed_work_is_reused_without_new_fills(self):
        root=Path(self.tmp.name)/'legacy';prepare_simulation(root,self.b)
        old=CandidateEngine(root,self.b,self.key,stop_checker=lambda:False)
        saved_engine,saved_epoch,saved_token=self.engine,self.epoch,self.token
        self.engine=old
        try:
            self.acquire()
            self.assertTrue(self.call('sync',target(),request_id='e'*32)['success'])
            old.close()
            wrapped=AdapterEngine(root,self.b,self.key,stop_checker=lambda:False)
            self.engine=wrapped;self.epoch=0;self.token=''
            try:
                self.acquire()
                self.assertTrue(self.call('sync',target(),request_id='e'*32)['success'])
                self.assertEqual(self.fills(),1)
                self.assertEqual(wrapped.db.execute('SELECT count(*) FROM order_mappings').fetchone()[0],1)
            finally:wrapped.close()
        finally:self.engine,self.epoch,self.token=saved_engine,saved_epoch,saved_token

    def test_stop_change_during_final_account_lookup_prevents_mock_send(self):
        gate=[True];calls=[0];original=self.sdk.backend.account_info
        def account():
            calls[0]+=1
            if calls[0]==2:gate[0]=False
            return original()
        with patch.object(self.sdk.backend,'account_info',side_effect=account):
            with self.assertRaises(AdapterError):self.send(order(),lambda:gate[0])
        self.assertEqual(self.fills(),0);self.assertTrue(self.sdk.held)

    def test_unknown_operation_phase_never_becomes_clear_on_recovery(self):
        request=order();self.send(request)
        with self.sdk.db:self.sdk.db.execute("UPDATE sdk_adapter_operations SET phase='unknown'")
        self.restart();self.assertTrue(self.sdk.held)
        with self.assertRaises(AdapterError):self.send(order())
        self.assertEqual(self.fills(),1)

    def test_original_mock_engine_cannot_bypass_persisted_adapter_hold(self):
        self.sdk.faults=AdapterFaults(fail_before_send=True)
        with self.assertRaises(AdapterError):self.send(order())
        self.engine.close()
        original=CandidateEngine(self.root,self.b,self.key,stop_checker=lambda:False)
        try:self.assertTrue(original._held())
        finally:original.close()


class WorkerAdapterTests(unittest.TestCase):
    def test_candidate_worker_uses_adapter_and_crash_keeps_all_journals_held(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'state';b=binding();prepare_simulation(root,b)
            launcher=NativeWindowsSimulation.linux_reference(root,b,secrets.token_bytes(32),faults=dict(crash_after_fill=True))
            try:
                self.assertEqual(launcher.request('acquire')['code'],'LEASED')
                now=wall_ms();p=root/'mock-stop.json'
                p.write_bytes(canonical(dict(simulation=True,binding=b.digest(),stopped=False,observed_ms=now,expires_ms=now+3000)));p.chmod(0o600)
                reply=launcher.request('sync',target());self.assertFalse(reply['success']);self.assertTrue(reply['uncertain'])
            finally:launcher.close()
            with sqlite3.connect(root/'simulated-broker.sqlite3') as db:
                self.assertEqual(db.execute('SELECT count(*) FROM fills').fetchone()[0],1)
                self.assertEqual(db.execute('SELECT phase FROM sdk_adapter_operations').fetchone()[0],'processing')
            recovered=NativeWindowsSimulation.linux_reference(root,b,secrets.token_bytes(32))
            try:
                self.assertTrue(recovered.ready.held)
                self.assertEqual(recovered.request('acquire')['code'],'LEASED')
                self.assertFalse(recovered.request('sync',target())['success'])
            finally:recovered.close()


if __name__=='__main__':unittest.main(verbosity=2)
