import sys,unittest
from pathlib import Path
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from readonly_account_relay import Binding,create_app
class RelayTests(unittest.TestCase):
 def setUp(self):
  self.b=Binding('justmarkets',1,'FixtureDemo','client','http://127.0.0.1:8203','fixture-private','a'*64);self.headers={'Authorization':'Bearer '+'b'*64};self.calls=[]
  self.snapshot=dict(success=True,read_only=True,initialized=True,identity_verified=True,portable_paths_verified=True,connected=True,positions_read_verified=True,orders_read_verified=True,automated_trading_enabled=False,execution_enabled=False,financial_trades=0,open_positions=0,pending_orders=0,account=dict(login=1,server='FixtureDemo',mode='demo',currency='ZAR',balance=1000,equity=1000),password='must-not-escape')
  def forward(binding):self.calls.append(binding.login);return self.snapshot
  self.client=TestClient(create_app([self.b],'b'*64,forward))
 def query(self,password='fixture-private'):return self.client.post('/observer/account-status',headers=self.headers,json=dict(login=1,server='FixtureDemo',password=password))
 def test_real_proof_shape_requires_credentials_and_does_not_invent_journal_or_stop(self):
  self.assertEqual(self.query('wrong').status_code,403);self.assertEqual(self.calls,[])
  r=self.query();self.assertEqual(r.status_code,200);self.assertTrue(r.json()['connected']);self.assertFalse(r.json()['execution_enabled']);self.assertFalse(r.json()['journal_bound']);self.assertIsNone(r.json()['journal_holds']);self.assertIsNone(r.json()['emergency_stop_active']);self.assertNotIn('must-not-escape',r.text)
 def test_execution_and_simulated_or_incomplete_account_claims_rejected(self):
  for key,value in [('automated_trading_enabled',True),('execution_enabled',True),('identity_verified',False),('positions_read_verified',False),('financial_trades',1)]:
   old=self.snapshot[key];self.snapshot[key]=value;self.assertEqual(self.query().status_code,503);self.snapshot[key]=old
  self.snapshot['account']['login']=2;self.assertEqual(self.query().status_code,503)
 def test_no_financial_route_or_capability_and_no_unauthorized_query(self):
  self.assertEqual(self.client.get('/observer/capabilities',headers=self.headers).status_code,503)
  for path in ['/observer/sync-position','/execute-trade','/close-trade','/modify-trade']:self.assertEqual(self.client.post(path,headers=self.headers,json={}).status_code,404)
  self.assertEqual(self.client.post('/observer/account-status',json=dict(login=1,server='FixtureDemo',password='fixture-private')).status_code,401);self.assertEqual(self.calls,[])
 def test_distinct_accounts_endpoints_and_tokens_required(self):
  for b in [self.b,Binding('justmarkets',2,'FixtureDemo','mentor',self.b.url,'fixture','c'*64),Binding('justmarkets',2,'FixtureDemo','mentor','http://127.0.0.1:8201','fixture','a'*64)]:
   with self.assertRaises(ValueError):create_app([self.b,b],'b'*64)
