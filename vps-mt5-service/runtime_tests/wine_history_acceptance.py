"""Real Wine history-mode acceptance only; no native Windows compatibility claim."""
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import shutil
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from private_ipc import canonical
from wine_bridge import WineBridge
from wine_history_candidate import WineHistoryBridge,prepare_wine_history

spec=importlib.util.spec_from_file_location('old_wine_fixture',Path(__file__).with_name('wine_bridge_acceptance.py'))
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)


class WineHistoryAcceptance(unittest.TestCase):
    setUpClass=classmethod(old.WineAcceptance.setUpClass.__func__)
    environment=classmethod(old.WineAcceptance.environment.__func__)
    stop_prefix=classmethod(old.WineAcceptance.stop_prefix.__func__)
    mock_stop=old.WineAcceptance.mock_stop

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ea-wine-history-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'state';self.prefix=Path(self.temp.name)/'prefix'
        shutil.copytree(self.template,self.prefix,symlinks=True);self.prefix.chmod(0o700)
        self.key=secrets.token_bytes(32);prepare_wine_history(self.root,self.binding,self.key)
        self.bridges=[];self.sequence=0;self.oid='a'*28;self.addCleanup(self.cleanup_runtime)

    def tearDown(self):
        record=dict(scenario=self._testMethodName,scope='isolated-wine-simulation',native_windows=False,
                    worker_platform=getattr(getattr(getattr(self,'current',None),'ready',None),'platform',None),
                    sticky_stop=(self.root/'bridge-stop.json').exists())
        if self.book.exists():
            with closing(sqlite3.connect(self.book)) as db:
                metadata=db.execute('SELECT sequence,head,projection FROM meta').fetchone()
                record.update(sequence=metadata[0],history_digest=metadata[1],
                    positions=json.loads(metadata[2]).get('positions',{}))
        with closing(sqlite3.connect(self.root/'history-authority'/'authority.sqlite3')) as db:
            record['shared_hold']=bool(db.execute('SELECT held FROM accounts').fetchone()[0])
            record['reviews']=[dict(reason=r[0],epoch=r[1]) for r in db.execute('SELECT reason,epoch FROM history_reviews')]
        audit=self.root/'history-pipeline.sqlite3'
        with closing(sqlite3.connect(audit)) as db:
            record['ipc_results']=[dict(request_id=r[0],code=r[1]) for r in
                db.execute("SELECT request_id,code FROM events WHERE kind='RESULT' ORDER BY id")]
        diagnostics=self.root/'wine-worker-errors.jsonl'
        if diagnostics.exists():record['worker_diagnostics']=diagnostics.read_text(errors='replace').splitlines()[-4:]
        with Path('/evidence/history-scenarios.jsonl').open('a') as stream:
            stream.write(json.dumps(record,sort_keys=True)+'\n')

    def cleanup_runtime(self):
        for bridge in self.bridges:bridge.close()
        self.stop_prefix(self.prefix)

    def bridge(self,**kw):
        self.mock_stop(False)
        bridge=WineHistoryBridge(self.root,self.prefix,self.binding,self.key,self.runtime,
            startup_timeout=20,shutdown_timeout=3,mock_stop=True,**kw)
        self.bridges.append(bridge);self.current=bridge;self.mock_stop(False)
        self.assertEqual(bridge.ready.platform,'win32')
        self.assertTrue(bridge.request('acquire')['success']);return bridge

    @property
    def book(self):return self.root/'history-authority'/'accounts'/self.binding.digest()/'history.sqlite3'
    def state(self):
        with closing(sqlite3.connect(self.book)) as db:return json.loads(db.execute('SELECT projection FROM meta').fetchone()[0])
    def count(self):
        with closing(sqlite3.connect(self.book)) as db:return db.execute('SELECT count(*) FROM events').fetchone()[0]
    def body(self,action,**kw):
        data=dict(login=1,server='SimulationOnly',action=action)
        if action!='reconcile':
            self.sequence+=1;data.update(sequence=self.sequence,event_id=secrets.token_hex(16),order_id=self.oid)
        if action=='create':data.update(sourceKey='a'*64,symbol='EURUSD',side=0,volume=.1)
        if action=='fill':data.update(volume=.04,price=1.2)
        if action=='modify':data.update(volume=.12,sl=1.,tp=2.)
        data.update(kw);return data
    def call(self,action,**kw):return self.current.request('sync',self.body(action,**kw))
    def ok(self,action,**kw):
        # Wine operations can make a multi-step scenario outlive one lease or
        # mirror freshness window. Renew ownership and preserve the mirror's
        # current stop value; never clear a sticky stop or account hold.
        stopped=json.loads((self.root/'mock-stop.json').read_bytes())['stopped']
        self.mock_stop(stopped)
        self.assertTrue(self.current.request('renew')['success'])
        reply=self.call(action,**kw);self.assertTrue(reply['success'],reply);return reply['data']

    def test_history_partial_lifecycle_modify_close_cancel(self):
        self.bridge();self.ok('create');self.ok('fill');self.ok('modify');self.ok('fill',volume=.08)
        opening=self.oid;self.oid='b'*28
        self.ok('create',kind='close',position=opening,side=1,volume=.06);self.ok('fill',volume=.02);self.ok('cancel')
        self.assertEqual(self.state()['positions'][opening]['units'],10)
        self.assertEqual(self.ok('reconcile')['deals'],3)

    def test_history_duplicate_events_and_rpc_survive_restart(self):
        first=self.bridge();self.ok('create');body=self.body('fill');rid=secrets.token_hex(16)
        receipt=first.request('sync',body,request_id=rid);self.assertTrue(receipt['success']);first.close()
        second=self.bridge();self.assertEqual(second.request('sync',body,request_id=rid),receipt)
        self.assertEqual(second.request('sync',body),receipt);self.assertEqual(self.count(),2)

    def test_history_out_of_order_fails_closed(self):
        self.bridge();self.ok('create');self.assertFalse(self.call('fill',sequence=3)['success'])
        self.assertEqual(self.call('fill')['code'],'HELD');self.assertEqual(self.count(),1)

    def test_history_conflicting_duplicate_fails_closed(self):
        b=self.bridge();self.ok('create');body=self.body('fill');self.assertTrue(b.request('sync',body)['success'])
        body['volume']=.05;self.assertFalse(b.request('sync',body)['success']);self.assertEqual(self.count(),2)
        self.assertEqual(self.call('fill')['code'],'HELD')

    def test_history_crash_retains_fill_and_persistent_stop(self):
        self.bridge(faults=dict(crash_after_fill=True));self.ok('create');self.assertFalse(self.call('fill')['success'])
        self.assertTrue(self.current.quiesced);self.assertEqual(self.state()['positions'][self.oid]['units'],4)
        self.assertTrue((self.root/'bridge-stop.json').exists());self.current.close()
        self.bridge();self.assertFalse(self.call('fill')['success']);self.assertEqual(self.count(),2)

    def test_history_owner_conflict_and_stale_fence(self):
        b=self.bridge();old=b.controller;b.controller=secrets.token_hex(16)
        self.assertEqual(b.request('acquire')['code'],'OWNER_CONFLICT');b.controller=old
        old_epoch,old_token=b.epoch,b.token
        time.sleep(2.05);self.mock_stop(False);b.controller=secrets.token_hex(16)
        self.assertTrue(b.request('acquire')['success']);self.assertGreater(b.epoch,old_epoch)
        b.epoch,b.token=old_epoch,old_token
        self.assertEqual(self.call('create')['code'],'LEASE_INVALID');self.assertEqual(self.count(),0)

    def test_history_stop_overrides_execution_and_reconciliation(self):
        self.bridge();self.ok('create');self.mock_stop(True)
        self.assertEqual(self.call('fill')['code'],'STOPPED');self.assertEqual(self.call('reconcile')['code'],'STOPPED')
        self.assertEqual(self.count(),1)

    def test_history_stop_during_worker_delay(self):
        self.bridge(faults=dict(before_send_ms=400));timer=threading.Timer(.1,lambda:self.mock_stop(True));timer.start()
        try:self.assertEqual(self.call('create')['code'],'STOPPED')
        finally:timer.join(1)
        self.assertEqual(self.count(),0)

    def test_history_timeout_before_dispatch_keeps_stop(self):
        b=self.bridge(faults=dict(before_send_ms=700));b.timeout=.1
        self.assertFalse(self.call('create')['success']);self.assertTrue(b.quiesced);self.assertEqual(self.count(),0)
        self.assertTrue((self.root/'bridge-stop.json').exists())

    def test_history_disconnect_after_commit_keeps_one_fill(self):
        b=self.bridge();self.ok('create');b.close();self.bridge(faults=dict(disconnect_after_sync=True))
        self.assertFalse(self.call('fill')['success']);self.assertEqual(self.count(),2)
        self.assertTrue((self.root/'bridge-stop.json').exists())

    def test_history_reconciliation_after_clean_restart_is_readonly(self):
        b=self.bridge();self.ok('create');self.ok('fill');before=self.state();b.close();self.bridge()
        proof=self.ok('reconcile');self.assertEqual(proof['deals'],1);self.assertEqual(self.state(),before)
        self.assertFalse(proof['automatic_retry_allowed']);self.ok('fill',volume=.06);self.assertEqual(self.count(),3)

    def test_history_corruption_and_missing_mirror_fail_closed(self):
        self.bridge();self.ok('create');(self.root/'mock-stop.json').unlink()
        self.assertEqual(self.call('fill')['code'],'STOPPED');self.mock_stop(False)
        with closing(sqlite3.connect(self.book)) as db:
            with db:db.execute("UPDATE meta SET projection='{}'")
        self.assertFalse(self.call('reconcile')['success']);self.assertEqual(self.count(),1)

    def test_history_authentication_replay_and_account_identity(self):
        b=self.bridge();create=self.body('create');fill=self.body('fill')
        with patch('sdk_ipc_candidate.secrets.token_hex',lambda n:'c'*(2*n)):
            self.assertTrue(b.request('sync',create,request_id='1'*32)['success'])
            self.assertEqual(b.request('sync',fill,request_id='2'*32)['code'],'REPLAY')
        self.assertEqual(self.call('fill',login=2)['code'],'IDENTITY_MISMATCH');self.assertEqual(self.count(),1)

    def test_history_sticky_bridge_stop_is_independent(self):
        (self.root/'bridge-stop.json').touch(mode=0o600)
        self.bridge();self.assertEqual(self.call('create')['code'],'STOPPED');self.assertEqual(self.count(),0)

    def test_history_bad_signature_fails_closed_before_fill(self):
        b=self.bridge();self.ok('create')
        from private_ipc import sign as actual_sign
        with patch('sdk_ipc_candidate.sign',lambda message,key:actual_sign(message,b'x'*32)):
            self.assertFalse(self.call('fill')['success'])
        self.assertTrue(b.quiesced);self.assertEqual(self.count(),1)
        self.assertTrue((self.root/'bridge-stop.json').exists())

    def test_history_reply_timeout_after_commit_retains_one_event(self):
        b=self.bridge(faults=dict(reply_delay_ms=800));b.timeout=.3
        self.assertFalse(self.call('create')['success']);self.assertTrue(b.quiesced)
        self.assertEqual(self.count(),1);self.assertTrue((self.root/'bridge-stop.json').exists())

    def test_history_mode_separation_and_structured_audit(self):
        with self.assertRaises(ValueError):WineBridge(self.root,self.prefix,self.binding,self.key,self.runtime)
        b=self.bridge();self.ok('create');rid=secrets.token_hex(16)
        self.assertTrue(b.request('sync',self.body('fill'),request_id=rid)['success'])
        with closing(sqlite3.connect(self.root/'history-pipeline.sqlite3')) as db:
            self.assertEqual(db.execute('SELECT kind FROM events WHERE request_id=? ORDER BY id',[rid]).fetchall(),[('REQUEST',),('RESULT',)])
        with closing(sqlite3.connect(self.book)) as db:self.assertEqual(db.execute('SELECT command_id FROM events WHERE sequence=2').fetchone()[0],rid)
