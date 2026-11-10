"""Linux offline simulation only. No native OS or vendor SDK acceptance claims."""
from contextlib import closing
import json
import multiprocessing as mp
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from history_authority_simulation import HistoryAuthority,prepare_history_authority
from synthetic_trade_history import HistoryBook, COMMAND, HistoryError
from shared_lease_simulation import SharedAuthority,SimulatedHost,SimulatedLink,AuthorityError
from private_ipc import Binding, canonical
from test_shared_lease_simulation import Clock


def profile(**kw):
    return Binding.model_validate(dict(dict(simulation=True,tenant='tenant',account='client',broker='justmarkets',
                                           login=1,server='SimulationOnly'),**kw))


def die_after_commit(root,b,key,body):
    clock=Clock()
    authority=HistoryAuthority(root,clock=clock,monotonic=clock.monotonic,stop_checker=lambda _:False)
    b=Binding.model_validate(b);authority.register(b,key)
    host=SimulatedHost(SimulatedLink(authority),b,key,'crash-host',clock=clock)
    assert host.call('acquire')['success']
    original=HistoryBook.execute
    def execute(*args):
        original(*args)
        os._exit(70)
    with patch.object(HistoryBook,'execute',execute):host.call('sync',body)
    os._exit(71)


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'authority';prepare_history_authority(self.root)
        self.b=profile();self.key=secrets.token_bytes(32);self.clock=Clock();self.stopped=False
        self.a=HistoryAuthority(self.root,clock=self.clock,monotonic=self.clock.monotonic,stop_checker=lambda _:self.stopped)
        self.addCleanup(lambda:self.a.close());self.a.register(self.b,self.key)
        self.host=self.client();self.assertTrue(self.host.call('acquire')['success'])
        self.sequence=0;self.oid='a'*28

    def client(self,name='host-one',b=None,key=None):
        return SimulatedHost(SimulatedLink(self.a),b or self.b,key or self.key,name,clock=self.clock)

    @property
    def path(self):return self.a.account_root(self.b)/'history.sqlite3'

    def body(self,action,**kw):
        common=dict(login=1,server='SimulationOnly',action=action)
        if action!='reconcile':
            self.sequence+=1
            common.update(event_id=secrets.token_hex(16),sequence=self.sequence,order_id=self.oid)
        if action=='create':common.update(sourceKey='a'*64,symbol='EURUSD',side=0,volume=.1)
        if action=='fill':common.update(volume=.04,price=1.2)
        if action=='modify':common.update(volume=.12,sl=1.,tp=2.)
        common.update(kw);return common

    def call(self,action,**kw):return self.host.call('sync',self.body(action,**kw))
    def ok(self,action,**kw):
        result=self.call(action,**kw);self.assertTrue(result['success'],result);return result['data']
    def projection(self):
        with closing(sqlite3.connect(self.path)) as db:return json.loads(db.execute('SELECT projection FROM meta').fetchone()[0])
    def count(self):
        with closing(sqlite3.connect(self.path)) as db:return db.execute('SELECT count(*) FROM events').fetchone()[0]
    def held(self):return bool(self.a._row(self.b.digest())['held'])
    def restart(self):
        self.a.close()
        self.a=HistoryAuthority(self.root,clock=self.clock,monotonic=self.clock.monotonic,stop_checker=lambda _:self.stopped)
        self.a.register(self.b,self.key);self.host=self.client();self.assertTrue(self.host.call('acquire')['success'])
    def corrupt(self,sql,args=()):
        with closing(sqlite3.connect(self.path)) as db:
            with db:db.execute(sql,args)
    def assert_review(self):
        self.assertFalse(self.call('reconcile')['success']);self.assertTrue(self.held())

    def test_multiple_partial_fills_exact_accounting(self):
        self.ok('create');a=self.ok('fill');self.assertEqual((a['executed_volume'],a['remaining_volume']),(.04,.06))
        b=self.ok('fill',volume=.06);self.assertEqual(b['state'],'filled')
        state=self.projection();self.assertEqual(len(state['deals']),2);self.assertEqual(state['positions'][self.oid]['units'],10)
        self.assertEqual(self.ok('reconcile')['deals'],2)

    def test_decimal_grid_does_not_accumulate_float_error(self):
        self.ok('create',volume=.03)
        for _ in range(3):last=self.ok('fill',volume=.01)
        self.assertEqual(last['remaining_volume'],0.);self.assertEqual(last['executed_volume'],.03)

    def test_partial_close_multiple_deals(self):
        self.ok('create');self.ok('fill',volume=.1);opening=self.oid;self.oid='b'*28
        self.ok('create',kind='close',position=opening,side=1,volume=.06)
        self.ok('fill',volume=.02);self.ok('fill',volume=.04)
        self.assertEqual(self.projection()['positions'][opening]['units'],4)
        self.assertEqual(self.ok('reconcile')['deals'],3)

    def test_full_close_removes_position(self):
        self.ok('create');self.ok('fill',volume=.1);opening=self.oid;self.oid='b'*28
        self.ok('create',kind='close',position=opening,side=1);self.ok('fill',volume=.1)
        self.assertEqual(self.projection()['positions'],{})

    def test_cancel_after_partial_keeps_exposure(self):
        self.ok('create');self.ok('fill');r=self.ok('cancel')
        self.assertEqual((r['cancelled_volume'],r['active_remaining_volume']),(.06,0.))
        self.assertEqual(self.projection()['positions'][self.oid]['units'],4)
        self.ok('reconcile')

    def test_cancel_unfilled_has_no_position(self):
        self.ok('create');self.ok('cancel');self.assertEqual(self.projection()['positions'],{})

    def test_fill_cancelled_order_latches(self):
        self.ok('create');self.ok('cancel');self.assertFalse(self.call('fill')['success']);self.assertTrue(self.held())
        self.assertEqual(self.count(),2)

    def test_modification_preserves_initial_request(self):
        self.ok('create');self.ok('fill');self.ok('modify');self.ok('fill',volume=.08)
        o=self.projection()['orders'][self.oid];self.assertEqual((o['initial_requested'],o['requested'],o['executed']),(10,12,12))
        self.ok('reconcile')

    def test_modify_below_filled_latches(self):
        self.ok('create');self.ok('fill');self.assertFalse(self.call('modify',volume=.03)['success']);self.assertTrue(self.held())

    def test_overfill_is_atomic(self):
        self.ok('create');self.ok('fill');before=self.projection()
        self.assertFalse(self.call('fill',volume=.1)['success']);self.assertEqual(self.projection(),before);self.assertEqual(self.count(),2)

    def test_duplicate_fill_event_new_rpc_id_no_duplicate(self):
        self.ok('create');body=self.body('fill');first=self.host.call('sync',body)
        self.assertEqual(self.host.call('sync',body),first);self.assertEqual(self.count(),2);self.ok('reconcile')

    def test_same_rpc_id_is_durable_cached(self):
        body=self.body('create');rid=secrets.token_hex(16);first=self.host.call('sync',body,request_id=rid)
        self.restart();self.assertEqual(self.host.call('sync',body,request_id=rid),first);self.assertEqual(self.count(),1)

    def test_duplicate_event_changed_volume_latches(self):
        self.ok('create');body=self.body('fill');self.assertTrue(self.host.call('sync',body)['success'])
        body['volume']=.05;self.assertFalse(self.host.call('sync',body)['success']);self.assertTrue(self.held());self.assertEqual(self.count(),2)

    def test_rpc_id_conflict_latches(self):
        rid=secrets.token_hex(16);self.host.call('sync',self.body('create'),request_id=rid)
        self.assertFalse(self.host.call('sync',self.body('fill'),request_id=rid)['success']);self.assertTrue(self.held())

    def test_out_of_order_event_fails_closed(self):
        self.ok('create');self.assertFalse(self.call('fill',sequence=3)['success']);self.assertEqual(self.count(),1);self.assertTrue(self.held())

    def test_unknown_order_cannot_fill(self):
        self.assertFalse(self.call('fill')['success']);self.assertEqual(self.count(),0);self.assertTrue(self.held())

    def test_history_delete_detected(self):
        self.ok('create');self.ok('fill');self.corrupt('DELETE FROM events WHERE sequence=1');self.assert_review()

    def test_history_receipt_corruption_detected(self):
        self.ok('create');self.corrupt("UPDATE events SET receipt='{}'");self.assert_review()

    def test_authority_receipt_conflict_detected(self):
        self.ok('create')
        with self.a.db:self.a.db.execute("UPDATE commands SET response='{}'")
        self.assert_review()

    def test_missing_authority_command_detected(self):
        self.ok('create')
        with self.a.db:self.a.db.execute('DELETE FROM commands')
        self.assert_review()

    def test_projection_corruption_detected(self):
        self.ok('create');self.corrupt("UPDATE meta SET projection='{}'");self.assert_review()

    def test_chain_corruption_detected(self):
        self.ok('create');self.corrupt("UPDATE events SET hash=?",['0'*64]);self.assert_review()

    def test_rolled_back_suffix_detected_by_authority_witness(self):
        self.ok('create')
        with closing(sqlite3.connect(self.path)) as db:old=db.execute('SELECT * FROM meta').fetchone()
        self.ok('fill');self.corrupt('DELETE FROM events WHERE sequence=2')
        self.corrupt('UPDATE meta SET sequence=?,head=?,projection=?',old[2:])
        self.assert_review()

    def test_missing_ledger_never_recreated(self):
        self.ok('create');self.path.unlink();self.assert_review();self.assertFalse(self.path.exists())

    def test_restart_missing_ledger_refused(self):
        self.a.close();self.path.unlink()
        self.a=HistoryAuthority(self.root,clock=self.clock,monotonic=self.clock.monotonic,stop_checker=lambda _:False)
        with self.assertRaises(Exception):self.a.register(self.b,self.key)
        self.assertTrue(self.held());self.assertFalse(self.path.exists())

    def test_emergency_stop_blocks_fill_and_reconciliation(self):
        self.ok('create');self.stopped=True
        self.assertEqual(self.call('fill')['code'],'STOPPED');self.assertEqual(self.call('reconcile')['code'],'STOPPED');self.assertEqual(self.count(),1)

    def test_stop_during_transaction_rolls_back_and_holds(self):
        self.ok('create');original=HistoryBook.gate;calls=0
        def gate(book):
            nonlocal calls
            calls+=1
            if calls==5:self.stopped=True
            original(book)
        with patch.object(HistoryBook,'gate',gate):self.assertFalse(self.call('fill')['success'])
        self.assertTrue(self.held());self.assertEqual(self.count(),1)

    def test_stop_recovery_does_not_clear_hold(self):
        self.ok('create');self.a._latch(self.b.digest());self.stopped=True;self.restart()
        self.assertEqual(self.call('reconcile')['code'],'STOPPED');self.stopped=False
        self.assertTrue(self.ok('reconcile')['hold_required']);self.assertEqual(self.call('fill')['code'],'HELD')

    def test_expired_lease_cannot_fill(self):
        self.ok('create');self.clock.advance(2001)
        self.assertEqual(self.call('fill')['code'],'LEASE_INVALID');self.assertEqual(self.count(),1)

    def test_conflicting_host_cannot_operate(self):
        other=self.client('other');self.assertEqual(other.call('acquire')['code'],'OWNER_CONFLICT')
        self.assertEqual(other.call('sync',self.body('create'))['code'],'LEASE_INVALID');self.assertEqual(self.count(),0)

    def test_stale_fence_after_takeover(self):
        self.ok('create');self.clock.advance(2001);other=self.client('other');self.assertTrue(other.call('acquire')['success'])
        self.assertEqual(self.call('fill')['code'],'LEASE_INVALID');self.assertEqual(self.count(),1)

    def test_authority_outage_cannot_fill(self):
        self.ok('create');self.a.available=False;self.assertFalse(self.call('fill')['success']);self.assertEqual(self.count(),1)

    def test_lost_reply_retry_does_not_duplicate(self):
        self.ok('create');self.host.link.drop_reply=True;body=self.body('fill');rid=secrets.token_hex(16)
        self.assertFalse(self.host.call('sync',body,request_id=rid)['success']);self.host.link.drop_reply=False
        self.assertTrue(self.host.call('sync',body,request_id=rid)['success']);self.assertEqual(self.count(),2)

    def test_nonce_replay_rejected(self):
        req,frame=self.host.frame('sync',self.body('create'));self.a.handle(frame)
        from private_ipc import verify
        self.assertEqual(verify(self.a.handle(frame),self.key,'response')['result']['code'],'REPLAY');self.assertEqual(self.count(),1)

    def test_tenant_account_isolation(self):
        b=profile(tenant='second',account='other',login=2);key=secrets.token_bytes(32);self.a.register(b,key)
        host=self.client('second',b,key);self.assertTrue(host.call('acquire')['success'])
        body=self.body('create');self.assertEqual(host.call('sync',body)['code'],'IDENTITY_MISMATCH')
        body['login']=2;self.assertTrue(host.call('sync',body)['success']);self.assertEqual(self.count(),0)

    def test_close_different_source_rejected(self):
        self.ok('create');self.ok('fill',volume=.1);opening=self.oid;self.oid='b'*28
        self.assertFalse(self.call('create',kind='close',position=opening,side=1,sourceKey='b'*64)['success']);self.assertTrue(self.held())

    def test_close_wrong_direction_rejected(self):
        self.ok('create');self.ok('fill',volume=.1);opening=self.oid;self.oid='b'*28
        self.assertFalse(self.call('create',kind='close',position=opening,side=0)['success'])

    def test_close_exceeding_position_rejected(self):
        self.ok('create');self.ok('fill',volume=.1);opening=self.oid;self.oid='b'*28
        self.assertFalse(self.call('create',kind='close',position=opening,side=1,volume=.2)['success'])

    def test_source_symbol_change_rejected(self):
        self.ok('create');self.ok('cancel');self.oid='b'*28
        self.assertFalse(self.call('create',symbol='XAUUSD')['success'])

    def test_active_source_second_order_rejected(self):
        self.ok('create');self.oid='b'*28;self.assertFalse(self.call('create')['success'])

    def test_exposure_reservation_limit(self):
        self.ok('create',volume=10.);self.oid='b'*28
        self.assertFalse(self.call('create',sourceKey='b'*64)['success'])

    def test_invalid_inputs_strictly_rejected(self):
        for update in ({'volume':.001},{'volume':float('inf')},{'symbol':'BTCUSD'},{'side':True},{'password':'secret'},
                       {'action':'connect'},{'login':True},{'server':'Live'},{'sequence':True}):
            with self.subTest(update=update):
                body=self.body('create');body.update(update)
                with self.assertRaises(Exception):COMMAND.validate_python(body)
        self.assertEqual(self.count(),0)

    def test_base_authority_cannot_open_history_fixture(self):
        with self.assertRaisesRegex(AuthorityError,'PROTOCOL_MISMATCH'):SharedAuthority(self.root)

    def test_deleted_mode_marker_cannot_downgrade_to_old_backend(self):
        self.a.close();(self.root/'history-mode.json').unlink()
        with self.assertRaisesRegex(AuthorityError,'PROTOCOL_MISMATCH'):SharedAuthority(self.root)

    def test_duplicate_fill_after_restart_does_not_execute_again(self):
        self.ok('create');body=self.body('fill');self.assertTrue(self.host.call('sync',body)['success'])
        self.restart();self.assertTrue(self.host.call('sync',body)['success']);self.assertEqual(self.count(),2)
        self.assertEqual(self.projection()['positions'][self.oid]['units'],4)

    def test_readonly_recovery_never_changes_positions(self):
        self.ok('create');self.ok('fill');before=self.projection();self.a._latch(self.b.digest())
        data=self.ok('reconcile');self.assertTrue(data['hold_required']);self.assertFalse(data['automatic_retry_allowed'])
        self.assertEqual(self.projection(),before);self.assertTrue(self.held())

    def test_restart_resumes_known_active_order_without_duplicate_fill(self):
        self.ok('create');self.ok('fill');self.restart();self.ok('reconcile');self.ok('fill',volume=.06)
        self.assertEqual(self.projection()['positions'][self.oid]['units'],10);self.assertEqual(self.count(),3)

    def test_crash_after_committed_fill_is_proved_but_held(self):
        self.ok('create');body=self.body('fill');self.a.close()
        child=mp.get_context('spawn').Process(target=die_after_commit,args=(str(self.root),self.b.model_dump(),self.key,body))
        child.start();child.join(8)
        if child.is_alive():child.kill();child.join();self.fail('bounded crash worker did not exit')
        self.assertEqual(child.exitcode,70);self.restart()
        data=self.ok('reconcile');self.assertEqual(data['deals'],1);self.assertTrue(data['hold_required'])
        self.assertEqual(self.call('fill',volume=.06)['code'],'HELD');self.assertEqual(self.count(),2)

    def test_incomplete_command_intent_stays_held(self):
        self.ok('create')
        with self.a.db:self.a.db.execute("INSERT INTO commands VALUES(?,?,?,'processing',NULL)",[self.b.digest(),'e'*32,'0'*64])
        self.restart();self.assert_review()

    def test_missing_stop_mirror_fails_closed(self):
        self.a.stop_checker=None
        self.assertEqual(self.call('create')['code'],'STOPPED');self.assertEqual(self.count(),0)

    def test_expired_stop_mirror_fails_closed(self):
        self.a.stop_checker=None
        path=self.path.parent/'mock-stop.json';path.write_bytes(canonical(dict(simulation=True,binding=self.b.digest(),
            stopped=False,observed_ms=1,expires_ms=2)))
        self.assertEqual(self.call('create')['code'],'STOPPED')

    def test_sticky_bridge_stop_cannot_be_bypassed(self):
        (self.path.parent/'bridge-stop.json').write_text('{}')
        self.assertEqual(self.call('create')['code'],'STOPPED');self.assertEqual(self.call('reconcile')['code'],'STOPPED')

    def test_binding_marker_loss_fails_closed(self):
        (self.path.parent/'simulation.json').unlink()
        self.assertEqual(self.call('create')['code'],'STOPPED');self.assertEqual(self.count(),0)

    def test_mixed_sdk_backend_is_refused(self):
        (self.path.parent/'simulated-broker.sqlite3').write_bytes(b'foreign')
        self.assertFalse(self.call('create')['success']);self.assertTrue(self.held());self.assertEqual(self.count(),0)

    def test_insecure_ledger_permissions_are_refused(self):
        self.path.chmod(0o644)
        self.assertFalse(self.call('create')['success']);self.assertTrue(self.held());self.assertEqual(self.count(),0)

    def test_symlink_ledger_is_refused(self):
        original=self.path.with_name('moved.sqlite3');self.path.rename(original);self.path.symlink_to(original)
        self.assertFalse(self.call('create')['success']);self.assertTrue(self.held())

    def test_bounded_execution_timeout_rolls_back(self):
        self.ok('create');original=HistoryBook.execute
        def delayed(book,*args):
            self.clock.advance(501)
            return original(book,*args)
        with patch.object(HistoryBook,'execute',delayed):self.assertFalse(self.call('fill')['success'])
        self.assertEqual(self.count(),1);self.assertTrue(self.held())

    def test_lease_expiry_during_transaction_rolls_back(self):
        self.ok('create');original=HistoryBook.gate;calls=0
        def gate(book):
            nonlocal calls
            calls+=1
            if calls==5:self.clock.advance(2001)
            original(book)
        with patch.object(HistoryBook,'gate',gate):self.assertFalse(self.call('fill')['success'])
        self.assertEqual(self.count(),1);self.assertTrue(self.held())

    def test_sql_failure_rolls_back_fill_and_projection(self):
        self.ok('create');before=self.projection()
        self.corrupt("CREATE TRIGGER reject_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'offline disk failure'); END")
        self.assertFalse(self.call('fill')['success']);self.assertEqual(self.projection(),before)
        self.assertEqual(self.count(),1);self.assertTrue(self.held())

    def test_audit_failure_rolls_back_fill(self):
        self.ok('create')
        self.corrupt("CREATE TRIGGER reject_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'offline audit failure'); END")
        self.assertFalse(self.call('fill')['success']);self.assertEqual(self.count(),1);self.assertTrue(self.held())

    def test_review_audit_has_failure_reason(self):
        self.ok('create');self.call('fill',sequence=3)
        reason=self.a.db.execute('SELECT reason FROM history_reviews').fetchone()[0]
        self.assertEqual(reason,'HISTORY_SEQUENCE_GAP')

    def test_audit_contains_only_structured_event_metadata(self):
        self.ok('create');self.ok('fill');self.ok('reconcile')
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual([r[0] for r in db.execute('SELECT event FROM audit')],['CREATE','FILL','RECONCILED'])
        self.assertNotIn('MetaTrader5',sys.modules)


if __name__=='__main__':unittest.main()
