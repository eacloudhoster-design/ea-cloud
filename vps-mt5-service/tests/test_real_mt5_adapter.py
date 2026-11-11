"""Real driver and existing HTTP/reconciliation path, exclusively injected offline SDK.
No vendor module, installed terminal, account credentials or network required.
"""
import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from demo_worker import DemoAccount,create_demo_app,from_private_binding
from observer_sync import ObserverSync,SyncJournal,synchronize
from private_ipc import sign
from real_mt5_adapter import RealMt5Adapter,Mt5IntegrationError,assignment_digest
from worker_state import StateLease
from test_observer_sync import Broker

class OfflineSdk(Broker):
    __version__="5.0.6231"
    ACCOUNT_TRADE_MODE_DEMO=0
    def __init__(self):
        super().__init__();self.identity=NS(login=123,server='FixtureDemo',trade_mode=0,margin_mode=2,equity=1000,balance=1000,currency='USD',trade_allowed=True,trade_expert=True)
        self.terminal=NS(connected=True,path=r'C:\fixture',data_path=r'C:\fixture',trade_allowed=True,tradeapi_disabled=False)
        self.initialized=[];self.outcome=10009;self.shutdowns=0;self.after_send=lambda:None
    def initialize(self,*args,**kw):self.initialized.append((args,kw));return True
    def shutdown(self):self.shutdowns+=1
    def account_info(self):return self.identity
    def terminal_info(self):return self.terminal
    def symbol_info(self,s):
        info=super().symbol_info(s);info.filling_mode=2;info.trade_exemode=2;return info
    def orders_get(self,**kw):return ()
    def history_orders_get(self,*args,**kw):return ()
    def history_deals_get(self,*args,**kw):return ()
    def order_check(self,r):return NS(retcode=0)
    def order_send(self,r):
        if self.outcome in (10009,10010):super().send(r,r['symbol'])
        else:self.sent.append(r)
        self.after_send()
        return NS(retcode=self.outcome,order=123 if r['action']==1 else 0,deal=234 if r['action']==1 else 0,volume=r.get('volume',0)/ (2 if self.outcome==10010 else 1),price=1.1,comment='PRIVATE_VENDOR_COMMENT')

class RealAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.cfg=DemoAccount(broker='deriv',login=123,server='FixtureDemo',terminal_path=r'C:\fixture\terminal64.exe',journal_path=str(Path(self.tmp.name)/'journal.db'),enabled=True,execution_approved=True,expected_sdk_version="5.0.6231")
        self.clock=100000;self.monotonic=100.0;self.stop=False;self.sdk=OfflineSdk();self.loads=0;self.secrets=0;self.leases=[]
        self.key=b'k'*32;self.gateway='a'*32
    def tearDown(self):
        for lease in self.leases:lease.close()
        self.tmp.cleanup()
    def frame(self,**kw):
        value=dict(protocol='ea-mt5-demo-session-v1',scope='connect-execute-demo',authorization_id='b'*32,assignment_digest=assignment_digest(self.cfg,self.gateway),issued_ms=99999,expires_ms=200000);value.update(kw);return sign(value,self.key)
    def driver(self,**kw):
        def loader():self.loads+=1;return self.sdk
        def secret():self.secrets+=1;return 'test-only-secret'
        return RealMt5Adapter(self.cfg,self.gateway,self.frame(**kw),self.key,secret,stop_checker=lambda:self.stop,clock=lambda:self.clock,monotonic=lambda:self.monotonic,sdk_loader=loader)
    def own(self,driver):
        SyncJournal(self.cfg.journal_path).open().close();lease=StateLease(self.cfg.journal_path);lease.acquire();driver.attach_owner(lease);self.leases.append(lease);return lease
    def connect(self,driver):return driver.initialize(self.cfg.terminal_path,login=123,password='ignored-request-secret',server='FixtureDemo',portable=True,timeout=1000)
    def target(self,revision=1,volume=.1,sl=0):return ObserverSync(login=123,password='ignored',server='FixtureDemo',sourceKey='a'*64,revision=revision,symbol='EURUSD',target=volume,sl=sl,tp=0,maxVolume=1,maxOpenTrades=10)
    def run_sync(self,d,revision=1,volume=.1,sl=0):
        def connect(*args):self.connect(d)
        def send(r,s):
            with d.execution_scope(lambda:self.stop is False):return d.send(r,s)
        return synchronize(d,self.target(revision,volume,sl),SyncJournal(self.cfg.journal_path),connect,send)
    def request(self):return dict(action=1,symbol='EURUSD',volume=.1,type=0,price=1.1,sl=0,tp=0,magic=1,deviation=20,comment='EC:'+'a'*28,type_time=0)
    def test_missing_or_mismatched_sdk_pin_fails_before_terminal_or_secret(self):
        self.cfg.expected_sdk_version=None
        with self.assertRaises(Mt5IntegrationError):self.driver()
        self.cfg.expected_sdk_version='5.0.45';d=self.driver();self.own(d)
        with self.assertRaises(Mt5IntegrationError):self.connect(d)
        self.assertEqual(self.secrets,0);self.assertEqual(self.sdk.initialized,[])
    def test_constructor_never_loads_sdk_or_credentials_and_requires_owner(self):
        d=self.driver();self.assertEqual((self.loads,self.secrets),(0,0))
        with self.assertRaises(Mt5IntegrationError):self.connect(d)
        self.assertEqual((self.loads,self.secrets),(0,0))
    def test_bad_expired_scope_binding_or_signature_never_loads(self):
        for kw in [dict(expires_ms=100000),dict(issued_ms=100001),dict(assignment_digest='0'*64),dict(scope='live'),dict(protocol='mt5-bootstrap-preparation-v1')]:
            with self.assertRaises(Mt5IntegrationError):self.driver(**kw)
        with self.assertRaises(Mt5IntegrationError):RealMt5Adapter(self.cfg,self.gateway,self.frame(),b'x'*32,lambda:None,stop_checker=lambda:False)
        self.assertEqual(self.loads,0)
    def test_private_provider_wins_and_reads_recheck_identity(self):
        d=self.driver();self.own(d);self.assertTrue(self.connect(d));self.assertEqual(self.sdk.initialized[0][1]['password'],'test-only-secret')
        self.assertEqual(d.positions_get(),());self.sdk.identity.login=999
        with self.assertRaises(Mt5IntegrationError):d.positions_get()
        self.assertTrue(d.held);self.assertEqual(self.sdk.sent,[])
    def test_terminal_account_or_live_switch_is_refused(self):
        for index,(field,value,target) in enumerate([('trade_mode',2,'account'),('margin_mode',0,'account'),('data_path',r'C:\other','terminal')]):
            with self.subTest(field=field):
                self.cfg.journal_path=str(Path(self.tmp.name)/f'journal-{index}.db');self.sdk=OfflineSdk()
                setattr(self.sdk.identity if target=='account' else self.sdk.terminal,field,value)
                d=self.driver();self.own(d)
                with self.assertRaises(Mt5IntegrationError):self.connect(d)
                self.assertEqual(self.sdk.sent,[])
    def test_request_cannot_switch_terminal_or_credentials(self):
        d=self.driver();self.own(d)
        with self.assertRaises(Mt5IntegrationError):d.initialize(r'C:\other\terminal64.exe',login=123,password='injected',server='FixtureDemo',portable=True,timeout=1000)
        self.assertEqual((self.loads,self.secrets),(0,0))
    def test_read_only_grant_cannot_select_or_send(self):
        d=self.driver(scope='connect-read');self.own(d);self.connect(d);self.assertEqual(d.orders_get(),())
        with self.assertRaises(Mt5IntegrationError):d.symbol_select('EURUSD',True)
        with d.execution_scope(lambda:True):
            with self.assertRaises(Mt5IntegrationError):d.send(self.request(),'EURUSD')
        self.assertEqual(self.sdk.sent,[])
    def test_direct_order_send_and_emergency_stop_are_blocked(self):
        d=self.driver();self.own(d);self.connect(d)
        with self.assertRaises(Mt5IntegrationError):d.order_send(self.request())
        self.stop=True
        with d.execution_scope(lambda:True):
            with self.assertRaises(Mt5IntegrationError):d.order_send(self.request())
        self.assertEqual(self.sdk.sent,[])
    def test_lease_loss_expiry_and_stale_epoch_block_execution(self):
        d=self.driver();lease=self.own(d);self.connect(d);self.clock=200000;self.assertFalse(d.execution_authorized)
        self.clock=100000;lease.close();self.assertFalse(d.execution_authorized)
    def test_restart_rejects_replayed_grant_new_grant_preserves_hold(self):
        d=self.driver();lease=self.own(d);self.connect(d);d._hold();d.shutdown();lease.close()
        replay=self.driver();lease=self.own(replay)
        with self.assertRaises(Mt5IntegrationError):self.connect(replay)
        lease.close();fresh=self.driver(authorization_id='c'*32);self.own(fresh);self.connect(fresh)
        self.assertTrue(fresh.held);self.assertFalse(fresh.execution_authorized)
    def test_shared_journal_owner_conflict(self):
        d=self.driver();self.own(d)
        with self.assertRaises(ValueError):StateLease(self.cfg.journal_path).acquire()
    def test_existing_reconciler_open_duplicate_sltp_partial_close_full_close(self):
        d=self.driver();self.own(d)
        self.assertTrue(self.run_sync(d)['success']);self.assertTrue(self.run_sync(d)['success']);self.assertEqual(len(self.sdk.sent),1)
        self.assertTrue(self.run_sync(d,2,.1,1)['success']);self.assertEqual(self.sdk.sent[-1]['action'],6)
        self.assertTrue(self.run_sync(d,3,.05,1)['success']);self.assertTrue(self.run_sync(d,4,0)['success']);self.assertEqual(self.sdk.positions,[])
    def test_timeout_is_durable_uncertain_and_not_retried(self):
        d=self.driver();self.own(d);self.sdk.outcome=10012
        result=self.run_sync(d);self.assertTrue(result['uncertain']);self.assertTrue(d.held)
        self.assertTrue(self.run_sync(d,2)['uncertain']);self.assertEqual(len(self.sdk.sent),1)
    def test_partial_receipt_is_retained_and_remainder_never_retried(self):
        d=self.driver();self.own(d);self.sdk.outcome=10010
        self.assertTrue(self.run_sync(d)['uncertain']);self.assertEqual(len(self.sdk.sent),1);self.assertTrue(d.held)
        with sqlite3.connect(self.cfg.journal_path) as db:
            phase,receipt=db.execute('SELECT phase,receipt FROM order_mappings').fetchone();self.assertEqual(phase,'acknowledged');self.assertEqual(json.loads(receipt)['retcode'],10010)
        self.assertTrue(self.run_sync(d,2)['uncertain']);self.assertEqual(len(self.sdk.sent),1)
    def test_conclusive_rejection_is_not_success_or_leaked_vendor_text(self):
        d=self.driver();self.own(d);self.sdk.outcome=10019
        result=self.run_sync(d);self.assertFalse(result['success']);self.assertNotIn('PRIVATE_VENDOR_COMMENT',json.dumps(result));self.assertFalse(d.held)
    def test_final_permission_and_invalid_volume_prevent_submission(self):
        d=self.driver();self.own(d);self.connect(d)
        with d.execution_scope(lambda:False):
            with self.assertRaises(Mt5IntegrationError):d.order_send(self.request())
        with d.execution_scope(lambda:True):
            request=self.request();request['volume']=.015
            with self.assertRaises(Mt5IntegrationError):d.order_send(request)
        self.assertEqual(self.sdk.sent,[])
    def test_post_send_identity_loss_marks_uncertain(self):
        d=self.driver();self.own(d);self.sdk.after_send=lambda:setattr(self.sdk.identity,'login',9)
        self.assertTrue(self.run_sync(d)['uncertain']);self.assertTrue(d.held);self.assertEqual(len(self.sdk.sent),1)
    def test_existing_worker_status_and_snapshot_do_not_expose_vendor_metadata(self):
        d=self.driver();app=create_demo_app(self.cfg,d,'test-only-secret','t'*64,stop_checker=lambda:self.stop)
        payload=dict(login=123,server='FixtureDemo',password='test-only-secret');headers={'Authorization':'Bearer '+'t'*64}
        with TestClient(app) as client:
            self.assertEqual(client.post('/v1/account-status',headers=headers,json=payload).status_code,200)
            r=client.post('/v1/account-snapshot',headers=headers,json=payload);self.assertEqual(r.status_code,200);self.assertEqual(r.json()['deals'],[]);self.assertNotIn('test-only-secret',r.text)
            self.assertEqual(client.post('/v1/account-snapshot',headers=headers,json={**payload,'login':9}).status_code,403)
            self.stop=True;self.assertEqual(client.post('/v1/account-snapshot',headers=headers,json=payload).status_code,503)
            self.assertEqual(self.sdk.sent,[])
    def test_existing_worker_routes_through_adapter_and_journal(self):
        d=self.driver();app=create_demo_app(self.cfg,d,'test-only-secret','t'*64,stop_checker=lambda:self.stop)
        with TestClient(app) as client:
            p=self.target().model_dump(mode='json');p['password']='credential-bound-worker'
            headers={'Authorization':'Bearer '+'t'*64}
            r=client.post('/observer/sync-position',headers=headers,json=p);self.assertEqual(r.status_code,200);self.assertTrue(r.json()['success'])
            self.assertTrue(client.post('/observer/sync-position',headers=headers,json=p).json()['success']);self.assertEqual(len(self.sdk.sent),1)
    def test_order_check_failure_or_stop_race_never_submits(self):
        d=self.driver();self.own(d);self.sdk.order_check=lambda r:NS(retcode=10016)
        self.assertTrue(self.run_sync(d)['uncertain']);self.assertEqual(self.sdk.sent,[]);self.assertTrue(d.held)
    def test_clock_rollback_and_deleted_state_do_not_reauthorize(self):
        d=self.driver();self.own(d);self.connect(d);self.clock+=100;d.account_info();self.clock-=1
        self.assertFalse(d.execution_authorized)
        self.clock+=2
        with sqlite3.connect(self.cfg.journal_path) as db:db.execute('DELETE FROM real_sdk_state')
        self.assertFalse(d.execution_authorized)
    def test_router_forwards_only_bound_account_and_sanitizes_real_snapshot(self):
        from account_dispatch import create_dispatch_app
        d=self.driver();app=create_demo_app(self.cfg,d,'test-only-secret','t'*64,stop_checker=lambda:self.stop)
        # Actual SDK-shaped history record; comment and server identifiers are deliberately private.
        self.sdk.history_deals_get=lambda *a,**kw:(NS(ticket=18446744073709551610,order=99,time=100,type=0,entry=0,magic=1,position_id=10,volume=.1,price=1.1,profit=3,commission=-1,swap=0,symbol='EURUSD',comment='PRIVATE_COMMENT',password='PRIVATE_SECRET'),NS(type=2,symbol='',profit=1000))
        headers={'Authorization':'Bearer '+'r'*64};payload=dict(login=123,server='FixtureDemo',password='test-only-secret')
        with TestClient(app) as worker:
            def forward(binding,path,body=None):
                r=worker.request('POST' if body is not None else 'GET',path,headers={'Authorization':'Bearer '+binding['token']},json=body);return r.status_code,r.json()
            router=TestClient(create_dispatch_app([dict(login=123,server='FixtureDemo',broker='deriv',mode='demo',role='client',url='http://127.0.0.1:8001',token='t'*64)],'r'*64,forward))
            r=router.post('/observer/account-snapshot',headers=headers,json=payload);self.assertEqual(r.status_code,200)
            self.assertEqual(len(r.json()['deals']),1);self.assertEqual(r.json()['deals'][0]['ticket'],'18446744073709551610');self.assertNotIn('PRIVATE_',r.text)
            self.assertEqual(router.post('/observer/account-snapshot',headers=headers,json={**payload,'login':2}).status_code,403)
            body=self.target().model_dump(mode='json');body['password']='not-a-worker-secret'
            r=router.post('/observer/sync-position',headers=headers,json=body);self.assertTrue(r.json()['success']);self.assertEqual(len(self.sdk.sent),1)
            self.assertTrue(router.post('/observer/sync-position',headers=headers,json=body).json()['success']);self.assertEqual(len(self.sdk.sent),1)
    def test_recovery_with_unresolved_other_allocation_holds_entire_account(self):
        d=self.driver();lease=self.own(d);self.connect(d)
        with sqlite3.connect(self.cfg.journal_path) as db:db.execute("INSERT INTO allocations(scope,account,source,magic,symbol,revision,phase) VALUES('crashed','fixture','fixture',1,'EURUSD',1,'dispatching')")
        lease.close();fresh=self.driver(authorization_id='c'*32);self.own(fresh);self.connect(fresh)
        self.assertTrue(fresh.held);self.assertFalse(fresh.execution_authorized);self.assertEqual(self.sdk.sent,[])
    def test_secret_named_exception_is_replaced_and_held(self):
        d=self.driver();self.own(d);self.connect(d)
        def fail():raise RuntimeError('PRIVATE_CREDENTIAL_VALUE')
        self.sdk.account_info=fail
        with self.assertRaises(Mt5IntegrationError) as caught:d.account_info()
        self.assertNotIn('PRIVATE_',str(caught.exception));self.assertTrue(d.held)
    def test_private_reference_startup_defers_secret_and_sdk_until_owned_request(self):
        reads=[]
        values={'gateway-id':self.gateway,'mt5-session-verifier-key':self.key.hex(),'mt5-session-authorization':self.frame().decode(),'api-token':'t'*64,'broker-password':'test-only-secret'}
        def reader(name):reads.append(name);return values[name]
        with patch('real_mt5_adapter.time.time_ns',return_value=self.clock*1000000),patch('demo_worker.emergency_stop_active',return_value=False):
            app=from_private_binding(dict(engine='real-sdk-v1',config=self.cfg.model_dump()),_credential_reader=reader,_sdk_loader=lambda:self.sdk)
            self.assertNotIn('broker-password',reads);self.assertEqual(self.sdk.initialized,[])
            with TestClient(app) as client:
                r=client.post('/v1/account-status',headers={'Authorization':'Bearer '+'t'*64},json=dict(login=123,server='FixtureDemo',password='test-only-secret'))
                self.assertEqual(r.status_code,200);self.assertIn('broker-password',reads);self.assertNotIn('test-only-secret',r.text)
    def test_missing_replay_journal_cannot_be_recreated_after_restart(self):
        d=self.driver();lease=self.own(d);self.connect(d);d._hold();d.shutdown();lease.close()
        Path(self.cfg.journal_path).unlink()
        fresh=self.driver(authorization_id='c'*32);self.own(fresh)
        with self.assertRaises(Mt5IntegrationError):self.connect(fresh)
        self.assertEqual(len(self.sdk.initialized),1)
    def test_worker_deadline_after_order_check_prevents_late_submission(self):
        d=self.driver();app=create_demo_app(self.cfg,d,'test-only-secret','t'*64,stop_checker=lambda:self.stop)
        now=[100.0]
        def slow_check(r):now[0]=116.0;return NS(retcode=0)
        self.sdk.order_check=slow_check
        with patch('demo_worker.time.monotonic',side_effect=lambda:now[0]),TestClient(app) as client:
            body=self.target().model_dump(mode='json');body['password']='credential-bound-worker'
            r=client.post('/observer/sync-position',headers={'Authorization':'Bearer '+'t'*64},json=body)
            self.assertTrue(r.json()['uncertain']);self.assertEqual(self.sdk.sent,[]);self.assertTrue(d.held)
    def test_wall_clock_cannot_extend_monotonic_session_expiry(self):
        d=self.driver();self.own(d);self.connect(d);self.monotonic+=101
        self.assertFalse(d.execution_authorized);self.assertEqual(self.sdk.sent,[])
    def test_legacy_main_stops_before_sdk_import_or_log_creation(self):
        import runpy
        with patch('logging.FileHandler',side_effect=AssertionError('Must not create legacy logs')):
            with self.assertRaisesRegex(RuntimeError,'LEGACY_UNGUARDED_SERVICE_DISABLED'):
                runpy.run_path(str(Path(__file__).resolve().parents[1]/'main.py'))
    def test_exact_broker_symbols_allow_spaces_without_guessing_aliases(self):
        d=self.driver();self.own(d);self.connect(d)
        with d.execution_scope(lambda:True):
            request=self.request();request['symbol']='Volatility 75 Index'
            self.assertEqual(d.order_send(request).retcode,10009)
            request['symbol']='EURUSD\n'
            with self.assertRaises(Mt5IntegrationError):d.order_send(request)
        self.assertEqual(len(self.sdk.sent),1)
    def test_success_receipt_with_lagging_positions_cannot_duplicate_open(self):
        d=self.driver();self.own(d)
        def lagging(request):
            self.sdk.sent.append(request)
            return NS(retcode=10009,order=123,deal=234,volume=request['volume'],price=1.1)
        self.sdk.order_send=lagging
        self.assertTrue(self.run_sync(d)['uncertain']);self.assertTrue(d.held);self.assertEqual(len(self.sdk.sent),1)
        self.assertTrue(self.run_sync(d,2)['uncertain']);self.assertEqual(len(self.sdk.sent),1)
    def test_liveness_is_owned_authenticated_and_never_loads_sdk_or_credentials(self):
        d=self.driver();self.cfg.enabled=False
        with TestClient(create_demo_app(self.cfg,d,'fixture','t'*64,stop_checker=lambda:True)) as client:
            self.assertEqual(client.get('/livez').status_code,401)
            r=client.get('/livez',headers={'Authorization':'Bearer '+'t'*64})
            self.assertEqual(r.status_code,200);self.assertTrue(r.json()['process_alive']);self.assertFalse(r.json()['sdk_checked']);self.assertFalse(r.json()['execution_readiness_claimed'])
        self.assertEqual((self.loads,self.secrets),(0,0));self.assertEqual(self.sdk.initialized,[])
    def test_strict_bootstrap_rejects_embedded_credentials_ports_and_unbound_mirror(self):
        fixtures=[dict(config={**self.cfg.model_dump(),'login':'PRIVATE_SECRET'}),dict(config={**self.cfg.model_dump(),'password':'PRIVATE_SECRET'}),dict(config=self.cfg.model_dump(),port=0),dict(config=self.cfg.model_dump(),port='8201'),dict(config={**self.cfg.model_dump(),'native_stop_mirror':r'C:\fixture\mirror.json'})]
        for fields in fixtures:
            with self.subTest(fields=list(fields)):
                with self.assertRaises(RuntimeError) as error:
                    from_private_binding(dict(engine='real-sdk-v1',**fields),_credential_reader=lambda _:self.fail('Invalid metadata must not read private files'),_sdk_loader=lambda:self.fail('No SDK'))
                self.assertNotIn('PRIVATE_SECRET',str(error.exception))
    def test_default_binding_is_backward_compatible_but_native_paths_are_immutable(self):
        import hashlib
        from private_ipc import canonical
        metadata=self.cfg.model_dump();metadata.pop('native_stop_directory');metadata.pop('native_stop_mirror')
        old=hashlib.sha256(canonical(dict(gateway_id=self.gateway,config=metadata))).hexdigest()
        self.assertEqual(assignment_digest(self.cfg,self.gateway),old)
        self.cfg.native_stop_directory=r'C:\fixture\stops'
        self.assertNotEqual(assignment_digest(self.cfg,self.gateway),old)
        with self.assertRaises(Mt5IntegrationError):self.driver(assignment_digest=old)
        self.assertEqual(self.loads,0)
    def test_native_stop_configuration_is_used_before_any_sdk_access(self):
        self.cfg.native_stop_directory=r'C:\fixture\stops';self.cfg.native_stop_mirror=r'C:\fixture\mirror.json'
        values={'gateway-id':self.gateway,'mt5-session-verifier-key':self.key.hex(),'mt5-session-authorization':self.frame().decode(),'api-token':'t'*64,'broker-password':'test-only-secret'}
        with patch('real_mt5_adapter.time.time_ns',return_value=self.clock*1000000),patch('execution_gates.native_stop_active',return_value=True) as stop:
            app=from_private_binding(dict(engine='real-sdk-v1',config=self.cfg.model_dump()),_credential_reader=values.__getitem__,_sdk_loader=lambda:self.sdk)
            with TestClient(app) as client:
                payload=dict(login=123,server='FixtureDemo',password='test-only-secret');headers={'Authorization':'Bearer '+'t'*64}
                r=client.post('/v1/account-status',headers=headers,json=payload);self.assertEqual(r.status_code,503);self.assertEqual(r.json()['code'],'MT5_SESSION_UNAVAILABLE');self.assertEqual(self.sdk.initialized,[])
                stop.return_value=False
                self.assertEqual(client.post('/v1/account-status',headers=headers,json=payload).status_code,200)
                stop.assert_called_with(self.cfg.native_stop_directory,self.cfg.native_stop_mirror)
    def test_disconnect_and_terminal_reinitialization_never_clear_existing_hold(self):
        d=self.driver();self.own(d);self.connect(d);self.sdk.terminal.connected=False
        with self.assertRaises(Mt5IntegrationError):d.positions_get()
        d.shutdown();self.sdk.terminal.connected=True;self.assertTrue(self.connect(d));self.assertEqual(d.positions_get(),())
        self.assertTrue(d.held);self.assertFalse(d.execution_authorized);self.assertEqual(self.sdk.sent,[])
    def test_windows_case_aliases_cannot_select_private_control_secrets_as_passwords(self):
        for ref in ('API-TOKEN','Gateway-Id','MT5-SESSION-VERIFIER-KEY','Mt5-Session-Authorization'):
            self.cfg.credential_ref=ref
            with self.assertRaises(Mt5IntegrationError):self.driver()
        self.assertEqual((self.loads,self.secrets),(0,0))
    def test_legacy_raw_credential_bootstrap_is_rejected_before_loader(self):
        with self.assertRaises(RuntimeError):from_private_binding(dict(config=self.cfg.model_dump(),password='secret',token='t'*64),_sdk_loader=lambda:self.fail('Must not load SDK'))

if __name__=='__main__':unittest.main()
