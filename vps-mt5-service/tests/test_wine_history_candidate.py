"""Offline Linux reference and mapped-path checks, separate from Wine acceptance."""
from contextlib import closing
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from private_ipc import Binding,canonical
from sdk_ipc_candidate import wall_ms
from wine_bridge import WineBridge,Runtime,prepare_prefix
from wine_history_candidate import WineHistoryBridge,prepare_wine_history,WineHistoryAuthority
from wine_history_paths import mapped_path,WineMappedInspector,history_scope
from shared_lease_simulation import private
from worker_state import StateLease


class PathTests(unittest.TestCase):
    def test_mapped_descendants_and_root(self):
        self.assertEqual(mapped_path(r'Z:\tmp\fixture\book.sqlite3',r'Z:\tmp\fixture'),r'z:\tmp\fixture\book.sqlite3')
        mapped_path(r'Z:\tmp\fixture',r'Z:\tmp\fixture')
    def test_sibling_and_prefix_confusion_rejected(self):
        for value in (r'Z:\tmp\fixture-two\file',r'Z:\tmp\other\file'):
            with self.assertRaises(ValueError):mapped_path(value,r'Z:\tmp\fixture')
    def test_unc_and_other_drives_rejected(self):
        for value in (r'C:\fixture\file',r'\\host\share\file',r'\\?\Z:\fixture'):
            with self.assertRaises(ValueError):mapped_path(value,r'Z:\fixture')
    def test_traversal_ads_and_aliases_rejected(self):
        for value in (r'Z:\fixture\..\file',r'Z:\fixture\.\file',r'Z:\fixture\file:stream',r'Z:\fixture\file.',r'Z:/fixture/file'):
            with self.assertRaises(ValueError):mapped_path(value,r'Z:\fixture')
    def test_reserved_names_and_short_aliases_rejected(self):
        for value in (r'Z:\fixture\NUL',r'Z:\fixture\COM1.txt',r'Z:\fixture\file~1'):
            with self.assertRaises(ValueError):mapped_path(value,r'Z:\fixture')
    def test_wine_inspector_cannot_weaken_linux_checks(self):
        with self.assertRaises(ValueError):WineMappedInspector('/tmp',None)
    def test_bounded_paths(self):
        with self.assertRaises(ValueError):mapped_path('Z:\\'+'a'*250,r'Z:\fixture')


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'root';self.prefix=Path(self.tmp.name)/'prefix'
        self.b=Binding.model_validate(dict(simulation=True,tenant='tenant',account='client',broker='justmarkets',login=1,server='SimulationOnly'))
        self.key=secrets.token_bytes(32);prepare_wine_history(self.root,self.b,self.key);prepare_prefix(self.prefix,self.b)
        self.bridges=[];self.addCleanup(lambda:[b.close() for b in self.bridges])
    def mirror(self,stopped=False):
        p=self.root/'mock-stop.json'
        if not p.exists():p.touch(mode=0o600)
        now=wall_ms();p.write_bytes(canonical(dict(simulation=True,binding=self.b.digest(),stopped=stopped,observed_ms=now,expires_ms=now+3000)))
    def launch(self,**kw):
        self.mirror();b=WineHistoryBridge(self.root,self.prefix,self.b,self.key,Runtime.reference(),mock_stop=True,**kw)
        self.bridges.append(b);self.assertTrue(b.request('acquire')['success']);return b
    def create(self):return dict(login=1,server='SimulationOnly',action='create',event_id='1'*32,sequence=1,order_id='a'*28,sourceKey='a'*64,symbol='EURUSD',side=0,volume=.1)
    def fill(self):return dict(login=1,server='SimulationOnly',action='fill',event_id='2'*32,sequence=2,order_id='a'*28,volume=.04,price=1.2)
    def count(self):
        p=self.root/'history-authority'/'accounts'/self.b.digest()/'history.sqlite3'
        with closing(sqlite3.connect(p)) as db:return db.execute('SELECT count(*) FROM events').fetchone()[0]
    def test_reference_history_pipeline_and_restart(self):
        b=self.launch();self.assertTrue(b.request('sync',self.create())['success']);self.assertTrue(b.request('sync',self.fill())['success']);b.close()
        b=self.launch();self.assertTrue(b.request('sync',self.fill())['success']);self.assertEqual(self.count(),2)
        self.assertEqual(b.request('sync',dict(login=1,server='SimulationOnly',action='reconcile'))['data']['deals'],1)
    def test_ordinary_bridge_cannot_adopt_history_root(self):
        with self.assertRaises(ValueError):WineBridge(self.root,self.prefix,self.b,self.key,Runtime.reference())
    def test_requires_explicit_mock_stop(self):
        with self.assertRaises(ValueError):WineHistoryBridge(self.root,self.prefix,self.b,self.key,Runtime.reference())
    def test_linux_authority_lock_remains_owned_until_shutdown(self):
        b=self.launch();lock=StateLease(self.root/'history-authority'/'shared-authority')
        with self.assertRaises(ValueError):lock.acquire()
        b.close();lock.acquire();lock.close()
    def test_sticky_bridge_stop_overrides_clear_mirror_without_shared_hold(self):
        (self.root/'bridge-stop.json').touch(mode=0o600)
        b=self.launch();self.assertEqual(b.request('sync',self.create())['code'],'STOPPED');self.assertEqual(self.count(),0)
    def test_stop_overrides_execution(self):
        b=self.launch();self.mirror(True);self.assertEqual(b.request('sync',self.create())['code'],'STOPPED');self.assertEqual(self.count(),0)
    def test_missing_fixture_marker_refuses_startup(self):
        (self.root/'wine-history-fixture.json').unlink()
        with self.assertRaises(Exception):self.launch()
    def test_linux_permission_failure_refuses_startup(self):
        (self.root/'wine-history-fixture.json').chmod(0o644)
        with self.assertRaises(ValueError):self.launch()
    def test_reference_crash_keeps_persistent_hold(self):
        b=self.launch(faults=dict(crash_after_fill=True));self.assertTrue(b.request('sync',self.create())['success'])
        self.assertFalse(b.request('sync',self.fill())['success']);self.assertTrue(b.quiesced);self.assertEqual(self.count(),2)
        self.assertTrue((self.root/'bridge-stop.json').exists());b.close();b=self.launch()
        self.assertFalse(b.request('sync',self.fill())['success'])
    def test_invalid_request_metadata_cannot_expand_audit(self):
        b=self.launch()
        with self.assertRaises(ValueError):b.request('sync',self.create(),request_id='x'*10000)
        self.assertEqual(self.count(),0)
    def test_scoped_reference_retains_permissions(self):
        p=self.root/'wine-history-fixture.json';p.chmod(0o644)
        with self.assertRaises(ValueError):
            with history_scope(self.root,self.b):pass
    def test_wine_budget_allows_bounded_work_but_never_expired_lease(self):
        from test_shared_lease_simulation import Clock
        from shared_lease_simulation import SimulatedHost,SimulatedLink
        from synthetic_trade_history import HistoryBook
        clock=Clock();clock.now=wall_ms()
        authority=WineHistoryAuthority(self.root/'history-authority',clock=clock,monotonic=clock.monotonic,stop_checker=lambda _:False)
        self.addCleanup(authority.close);authority.register(self.b,self.key)
        host=SimulatedHost(SimulatedLink(authority),self.b,self.key,'budget-host',clock=clock)
        self.assertTrue(host.call('acquire')['success']);original=HistoryBook.execute
        def delayed(book,*args):clock.advance(750);return original(book,*args)
        with patch.object(HistoryBook,'execute',delayed):self.assertTrue(host.call('sync',self.create())['success'])
        clock.advance(750)  # Lease age is now 1500ms, independent of each operation budget.
        with patch.object(HistoryBook,'execute',delayed):self.assertFalse(host.call('sync',self.fill())['success'])
        self.assertEqual(self.count(),1);self.assertTrue(authority._row(self.b.digest())['held'])

    def test_wine_budget_exhaustion_is_fail_closed(self):
        from test_shared_lease_simulation import Clock
        from shared_lease_simulation import SimulatedHost,SimulatedLink
        from synthetic_trade_history import HistoryBook
        clock=Clock();clock.now=wall_ms()
        authority=WineHistoryAuthority(self.root/'history-authority',clock=clock,monotonic=clock.monotonic,stop_checker=lambda _:False)
        self.addCleanup(authority.close);authority.register(self.b,self.key)
        host=SimulatedHost(SimulatedLink(authority),self.b,self.key,'budget-host',clock=clock)
        self.assertTrue(host.call('acquire')['success']);original=HistoryBook.execute
        def delayed(book,*args):clock.advance(1501);return original(book,*args)
        with patch.object(HistoryBook,'execute',delayed):self.assertFalse(host.call('sync',self.create())['success'])
        self.assertEqual(self.count(),0);self.assertTrue(authority._row(self.b.digest())['held'])

    def test_audit_failure_fails_closed(self):
        b=self.launch();(self.root/'history-pipeline.sqlite3').unlink()
        self.assertFalse(b.request('sync',self.create())['success']);self.assertTrue((self.root/'bridge-stop.json').exists());self.assertEqual(self.count(),0)

if __name__=='__main__':unittest.main()
