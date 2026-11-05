import sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as NS
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from demo_worker import DemoAccount,create_demo_app
class DemoGateTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.calls=[]
  self.info=NS(login=1,server='DemoFixture',trade_mode=0)
  self.mt5=NS(initialize=lambda *a,**kw:True,account_info=lambda:self.info,terminal_info=lambda:NS(connected=True,path=r'C:\fixture',data_path=r'C:\fixture'),order_send=lambda r:self.calls.append(r),ACCOUNT_TRADE_MODE_DEMO=0)
  self.config=DemoAccount(broker='deriv',login=1,server='DemoFixture',terminal_path=r'C:\fixture\terminal64.exe',journal_path=str(Path(self.tmp.name)/'journal.db'),enabled=True,execution_approved=True)
  self.client=TestClient(create_demo_app(self.config,self.mt5,'test-only-broker-secret','a'*64,stop_checker=lambda:False));self.headers={'Authorization':'Bearer '+'a'*64}
 def tearDown(self):self.tmp.cleanup()
 def test_live_account_and_wrong_identity_never_submit(self):
  for info in [NS(login=1,server='DemoFixture',trade_mode=2),NS(login=2,server='DemoFixture',trade_mode=0)]:
   self.info=info;self.assertEqual(self.client.get('/healthz',headers=self.headers).status_code,503)
  self.assertEqual(self.calls,[])
 def test_authentication_disabled_gate_and_safe_demo_health(self):
  self.assertEqual(self.client.get('/healthz').status_code,401)
  self.assertEqual(self.client.get('/healthz',headers=self.headers).status_code,200)
  self.config.enabled=False;self.assertEqual(self.client.get('/healthz',headers=self.headers).status_code,503)
 def test_validation_redacts_credentials(self):
  r=self.client.post('/observer/sync-position',headers=self.headers,json={'password':'secret-not-in-errors'})
  self.assertEqual(r.status_code,422);self.assertNotIn('secret-not-in-errors',r.text)

 def test_readonly_status_on_disabled_worker_proves_password_without_execution(self):
  self.mt5.positions_get=lambda:();self.mt5.orders_get=lambda:()
  self.config.enabled=False;self.config.execution_approved=False
  payload={'login':1,'server':'DemoFixture','password':'test-only-broker-secret'}
  r=self.client.post('/v1/account-status',headers=self.headers,json=payload)
  self.assertEqual(r.status_code,200);self.assertTrue(r.json()['connected']);self.assertFalse(r.json()['execution_enabled'])
  self.assertNotIn('test-only-broker-secret',r.text)
  payload['password']='wrong-secret';r=self.client.post('/v1/account-status',headers=self.headers,json=payload)
  self.assertEqual(r.status_code,403);self.assertNotIn('wrong-secret',r.text)
  self.assertEqual(self.calls,[])
 def test_emergency_stop_blocks_even_approved_worker(self):
  client=TestClient(create_demo_app(self.config,self.mt5,'fixture','a'*64,stop_checker=lambda:True))
  r=client.post('/observer/sync-position',headers=self.headers,json={'password':'fixture'})
  self.assertEqual(r.status_code,503);self.assertFalse(r.json()['retriable']);self.assertFalse(r.json()['submission_started']);self.assertEqual(self.calls,[])
 def test_unreadable_root_owned_emergency_latch_is_closed(self):
  from unittest.mock import patch
  from demo_worker import emergency_stop_active
  with patch('demo_worker.Path.exists',side_effect=PermissionError('fixture')):self.assertTrue(emergency_stop_active())
