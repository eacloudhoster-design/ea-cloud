import copy,hashlib,json,sqlite3,sys,tempfile,unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from observer_sync import ObserverSync,SyncJournal,synchronize
from history_reconcile import assess,load_mapping,reconcile
from worker_state import StateLease
from test_observer_sync import Broker
class HistoryTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.journal=SyncJournal(Path(self.temp.name)/'journal.sqlite3');self.broker=Broker()
  self.config=dict(login=1,server='DemoFixture',terminal_path=r'C:\fixture\terminal64.exe')
  self.broker.account_info=lambda:NS(login=1,server='DemoFixture',trade_mode=0,margin_mode=2,equity=1000)
  self.broker.terminal_info=lambda:NS(connected=True,path=r'C:\fixture',data_path=r'C:\fixture')
  self.payload=ObserverSync(login=1,password='private-fixture',server='DemoFixture',sourceKey='a'*64,revision=1,symbol='EURUSD',target=.1,sl=0,tp=0,maxVolume=1)
  def lost_ack(request,symbol):
   self.request=copy.deepcopy(request);self.broker.send(request,symbol)
   for p in self.broker.positions:p.symbol=symbol;p.identifier=p.ticket
   return None
  self.assertTrue(synchronize(self.broker,self.payload,self.journal,lambda *a:None,lost_ack)['uncertain'])
  self.mapping=load_mapping(self.journal,1)
  r=self.request;position=self.broker.positions[0].ticket
  self.orders=[NS(ticket=500,state=4,type=r['type'],magic=r['magic'],position_id=position,volume_initial=.1,volume_current=0,symbol=r['symbol'],comment=r['comment'])]
  self.deals=[NS(ticket=700,order=500,type=r['type'],entry=0,magic=r['magic'],position_id=position,volume=.1,symbol=r['symbol'])]
  self.broker.history_orders_get=lambda *a:self.orders;self.broker.history_deals_get=lambda *a:self.deals;self.broker.orders_get=lambda:()
 def tearDown(self):self.temp.cleanup()
 def run_reconcile(self,record=False):return reconcile(self.broker,self.journal,self.config,1,record=record)
 def phase(self):
  with closing(sqlite3.connect(self.journal.path)) as db, db:return db.execute('SELECT phase FROM allocations').fetchone()[0]
 def test_exact_execution_readonly_preview_and_idempotent_held_record(self):
  before=Path(self.journal.path).read_bytes();result=self.run_reconcile();self.assertEqual(result['classification'],'confirmed_execution');self.assertTrue(result['exposure_consistent']);self.assertEqual(before,Path(self.journal.path).read_bytes())
  self.run_reconcile(True);self.assertEqual(self.phase(),'dispatching');self.run_reconcile(True)
  with closing(sqlite3.connect(self.journal.path)) as db, db:self.assertEqual(db.execute('SELECT count(*) FROM history_reconciliations').fetchone()[0],1)
  self.assertTrue(synchronize(self.broker,self.payload,self.journal,lambda *a:None,self.broker.send)['uncertain']);self.assertEqual(len(self.broker.sent),1)
 def test_no_history_is_never_no_fill_proof(self):
  self.orders=[];self.deals=[];result=self.run_reconcile(True)
  self.assertEqual(result['classification'],'inconclusive');self.assertFalse(result['automatic_retry_allowed']);self.assertEqual(self.phase(),'dispatching')
 def test_partial_and_explicit_rejected_states(self):
  self.orders[0].state=2;self.orders[0].volume_current=.05;self.deals[0].volume=.05;self.broker.positions[0].volume=.05
  result=self.run_reconcile();self.assertEqual(result['classification'],'confirmed_partial_execution');self.assertTrue(result['exposure_consistent'])
  self.orders[0].state=5;self.orders[0].volume_current=.1;self.deals=[];self.broker.positions=[]
  self.assertEqual(self.run_reconcile()['classification'],'confirmed_no_fill')
 def test_duplicate_history_mutation_or_wrong_correlation_stays_blocked(self):
  original=copy.deepcopy(self.orders)
  self.orders.append(copy.deepcopy(self.orders[0]));self.assertEqual(self.run_reconcile()['classification'],'inconclusive')
  self.orders=copy.deepcopy(original);self.orders[0].comment='rewritten';self.assertEqual(self.run_reconcile()['classification'],'inconclusive')
  self.orders=copy.deepcopy(original);self.deals.append(copy.deepcopy(self.deals[0]));self.assertEqual(self.run_reconcile()['classification'],'inconclusive')
 def test_identity_or_history_failure_never_mutates_journal(self):
  before=Path(self.journal.path).read_bytes();self.config['login']=2
  with self.assertRaises(ValueError):self.run_reconcile(True)
  self.config['login']=1;self.broker.history_deals_get=lambda *a:None
  with self.assertRaises(ValueError):self.run_reconcile(True)
  self.assertEqual(before,Path(self.journal.path).read_bytes());self.assertEqual(self.phase(),'dispatching')
 def test_current_exposure_mismatch_does_not_reopen_position(self):
  self.broker.positions=[];result=self.run_reconcile(True);self.assertFalse(result['exposure_consistent']);self.assertEqual(self.phase(),'dispatching');self.assertEqual(len(self.broker.sent),1)
 def test_recording_refuses_a_running_owner(self):
  lease=StateLease(self.journal.path);lease.acquire()
  try:
   with self.assertRaises(ValueError):self.run_reconcile(True)
  finally:lease.close()
 def test_legacy_or_stop_modification_requires_manual_evidence(self):
  self.assertEqual(assess({**self.mapping,'operation_id':None},{})['classification'],'inconclusive')
  modified={**self.mapping,'request':json.dumps({**self.request,'action':6})}
  self.assertEqual(assess(modified,{})['classification'],'inconclusive')
 def test_wrong_entry_active_order_or_deal_volume_cannot_confirm(self):
  self.deals[0].entry=1;self.assertEqual(self.run_reconcile()['classification'],'inconclusive')
  self.deals[0].entry=0;self.broker.orders_get=lambda:tuple(self.orders);self.assertEqual(self.run_reconcile()['classification'],'inconclusive')
  self.broker.orders_get=lambda:();self.deals[0].volume=.2;self.assertEqual(self.run_reconcile()['classification'],'inconclusive')
 def test_operator_race_requires_fresh_evidence(self):
  original=self.broker.history_orders_get
  def changed(*args):
   with closing(sqlite3.connect(self.journal.path)) as db, db:db.execute("UPDATE order_mappings SET pre_positions='[{}]' WHERE id=1")
   return original(*args)
  self.broker.history_orders_get=changed
  with self.assertRaises(ValueError):self.run_reconcile(True)
  self.assertEqual(self.phase(),'dispatching')
 def test_reordered_or_unrelated_history_does_not_change_proof(self):
  first=self.run_reconcile()['evidence_sha256'];self.orders.append(NS(ticket=900,comment='unrelated'))
  self.orders.reverse();self.assertEqual(first,self.run_reconcile()['evidence_sha256'])

 def test_authenticated_worker_preview_does_not_record_or_enable_execution(self):
  from demo_worker import DemoAccount,create_demo_app
  from fastapi.testclient import TestClient
  self.broker.initialize=lambda *a,**k:True;self.broker.shutdown=lambda:None
  config=DemoAccount(broker='deriv',login=1,server='DemoFixture',terminal_path=self.config['terminal_path'],journal_path=self.journal.path,enabled=True,execution_approved=False)
  client=TestClient(create_demo_app(config,self.broker,'private-fixture','a'*64,stop_checker=lambda:False));headers={'Authorization':'Bearer '+'a'*64}
  self.assertEqual(client.get('/v1/reconciliation/1').status_code,401)
  before=Path(self.journal.path).read_bytes();response=client.get('/v1/reconciliation/1',headers=headers)
  self.assertEqual(response.status_code,200);self.assertEqual(response.json()['classification'],'confirmed_execution');self.assertEqual(before,Path(self.journal.path).read_bytes())
  self.assertEqual(client.post('/v1/reconciliation/1',headers=headers,json={}).status_code,405)
  self.assertEqual(client.post('/observer/sync-position',headers=headers,json={}).status_code,503);self.assertEqual(len(self.broker.sent),1)
 def test_close_uses_position_identifier_not_ticket_and_multiple_deals_balance(self):
  from history_reconcile import assess
  request={**self.request,'position':101,'type':1}
  mapping={**self.mapping,'request':json.dumps(request),'pre_positions':json.dumps([dict(ticket=101,identifier=777,type=0,volume=.1,magic=request['magic'],symbol='EURUSD')])}
  order=dict(ticket=800,state=4,type=1,magic=request['magic'],position_id=777,volume_initial=.1,volume_current=0,symbol='EURUSD',comment=request['comment'])
  deals=[dict(ticket=900+i,order=800,type=1,entry=1,magic=request['magic'],position_id=777,volume=v,symbol='EURUSD') for i,v in enumerate((.03,.07))]
  snapshot=dict(orders=[order],deals=deals,active_orders=[],positions=[])
  result=assess(mapping,snapshot);self.assertEqual(result['classification'],'confirmed_execution');self.assertTrue(result['exposure_consistent'])
  order['position_id']=101;self.assertEqual(assess(mapping,snapshot)['classification'],'inconclusive')
 def test_intent_nonce_and_prestate_are_durable_before_send(self):
  self.assertEqual(len(self.mapping['operation_id']),28);self.assertEqual(len(self.request['comment']),31);self.assertEqual(json.loads(self.mapping['pre_positions']),[]);self.assertGreater(self.mapping['created_at'],0)
  second=self.payload.model_copy(update={'sourceKey':'b'*64})
  self.assertTrue(synchronize(self.broker,second,self.journal,lambda *a:None,self.broker.send)['success'])
  other=load_mapping(self.journal,2);self.assertNotEqual(self.mapping['operation_id'],other['operation_id'])
