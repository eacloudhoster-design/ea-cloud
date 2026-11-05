import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as NS
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from demo_worker import DemoAccount,create_demo_app
from account_workers import BROKERS
from test_observer_sync import Broker
class WorkerIntegrationTests(unittest.TestCase):
 def test_five_broker_profiles_mapping_replay_disconnect_and_reconnect(self):
  with tempfile.TemporaryDirectory() as directory:
   for index,profile in enumerate(BROKERS):
    with self.subTest(broker=profile):
     broker=Broker();online=[False];shutdown=[]
     broker.initialize=lambda *a,**kw:online[0];broker.shutdown=lambda:shutdown.append(True)
     broker.account_info=lambda:NS(login=1,server='Synthetic',trade_mode=0,trade_allowed=True,margin_mode=2,equity=1000)
     broker.terminal_info=lambda:NS(connected=online[0],trade_allowed=True,path=r'C:\fixture',data_path=r'C:\fixture')
     old=broker.symbol_info;broker.symbol_info=lambda symbol:NS(**vars(old(symbol)),filling_mode=1 if index%2 else 2,trade_exemode=2)
     def send(request):
      result=broker.send(request,request['symbol']);result.order=len(broker.sent);result.deal=len(broker.sent);return result
     broker.order_send=send
     config=DemoAccount(broker=profile,login=1,server='Synthetic',terminal_path=r'C:\fixture\terminal64.exe',journal_path=str(Path(directory)/(profile+'.db')),enabled=True,execution_approved=True)
     headers={'Authorization':'Bearer '+'a'*64}
     body=dict(login=1,password='never-store-this',server='Synthetic',sourceKey='a'*64,revision=1,symbol='EURUSD.test',target=.1,sl=0,tp=0,maxVolume=1)
     with TestClient(create_demo_app(config,broker,'bound-secret','a'*64,stop_checker=lambda:False)) as client:
      response=client.post('/observer/sync-position',headers=headers,json=body);self.assertEqual(response.status_code,503);self.assertTrue(response.json()['retriable']);self.assertEqual(broker.sent,[])
      online[0]=True
      for revision,target in enumerate((.1,.06,-.03,0),1):
       body.update(revision=revision,target=target)
       response=client.post('/observer/sync-position',headers=headers,json=body);self.assertTrue(response.json()['success'],response.text)
       count=len(broker.sent)
       self.assertTrue(client.post('/observer/sync-position',headers=headers,json=body).json()['success']);self.assertEqual(len(broker.sent),count)
      self.assertEqual(broker.positions,[])
      body['login']=2;self.assertEqual(client.post('/observer/sync-position',headers=headers,json=body).status_code,403)
     with sqlite3.connect(config.journal_path) as db:
      mappings=db.execute('SELECT request,receipt,phase FROM order_mappings').fetchall();self.assertEqual(len(mappings),5)
      self.assertTrue(all(row[2]=='acknowledged' and json.loads(row[1])['order']>0 for row in mappings))
      self.assertEqual(db.execute('SELECT confirmed_volume FROM allocations').fetchone()[0],0)
     self.assertNotIn(b'never-store-this',Path(config.journal_path).read_bytes());self.assertTrue(shutdown)
 def test_execution_gate_and_single_owner_identity_binding(self):
  with tempfile.TemporaryDirectory() as directory:
   config=DemoAccount(broker='xm',login=1,server='Synthetic',terminal_path=r'C:\fixture\terminal64.exe',journal_path=str(Path(directory)/'journal.db'),enabled=True)
   broker=NS(shutdown=lambda:None)
   with TestClient(create_demo_app(config,broker,'fixture','a'*64,stop_checker=lambda:False)) as client:
    response=client.post('/observer/sync-position',headers={'Authorization':'Bearer '+'a'*64},json={});self.assertEqual(response.status_code,503)
    from worker_state import StateLease,bind_identity
    from observer_sync import SyncJournal
    with self.assertRaises(ValueError):StateLease(config.journal_path).acquire()
   with sqlite3.connect(config.journal_path) as db:identity=json.loads(db.execute('SELECT identity FROM worker_identity').fetchone()[0])
   identity['login']=2
   with self.assertRaisesRegex(ValueError,'identity mismatch'):bind_identity(SyncJournal(config.journal_path),identity)
 def test_stop_latched_after_http_guard_prevents_sdk_send_and_keeps_intent_held(self):
  with tempfile.TemporaryDirectory() as directory:
   broker=Broker();broker.initialize=lambda *a,**k:True;broker.shutdown=lambda:None
   broker.account_info=lambda:NS(login=1,server='Synthetic',trade_mode=0,trade_allowed=True,margin_mode=2,equity=1000)
   broker.terminal_info=lambda:NS(connected=True,trade_allowed=True,path=r'C:\fixture',data_path=r'C:\fixture')
   previous=broker.symbol_info;broker.symbol_info=lambda symbol:NS(**vars(previous(symbol)),filling_mode=1,trade_exemode=2)
   broker.order_send=lambda request:self.fail('Emergency stop must prevent all SDK order sends')
   checks=[]
   def stop():checks.append(True);return len(checks)>1
   config=DemoAccount(broker='justmarkets',login=1,server='Synthetic',terminal_path=r'C:\fixture\terminal64.exe',journal_path=str(Path(directory)/'journal.db'),enabled=True,execution_approved=True)
   with TestClient(create_demo_app(config,broker,'fixture','a'*64,stop_checker=stop)) as client:
    response=client.post('/observer/sync-position',headers={'Authorization':'Bearer '+'a'*64},json=dict(login=1,password='fixture',server='Synthetic',sourceKey='a'*64,revision=1,symbol='EURUSD.fixture',target=.01,sl=0,tp=0,maxVolume=1))
    self.assertFalse(response.json()['success']);self.assertTrue(response.json()['uncertain'])
   with sqlite3.connect(config.journal_path) as db:self.assertEqual(db.execute('SELECT phase FROM allocations').fetchone()[0],'dispatching')
