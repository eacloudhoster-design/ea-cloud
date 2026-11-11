import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
from fastapi.testclient import TestClient
from readonly_account_relay import Binding,create_app
class Tests(unittest.TestCase):
 def setUp(self):
  self.base=Binding('justmarkets',111,'Fixture','client','http://127.0.0.1:10081','base-fixture','a'*40)
  self.new=Binding('justmarkets',222,'Fixture','client','http://127.0.0.1:10082','new-fixture','b'*40)
  self.broken=False;self.forwarded=[]
  def forward(b):
   self.forwarded.append(b.login)
   return dict.fromkeys(('success','read_only','initialized','identity_verified','portable_paths_verified','connected','positions_read_verified','orders_read_verified'),True)|{'automated_trading_enabled':False,'execution_enabled':False,'financial_trades':0,'account':{'login':b.login,'server':b.server,'mode':'demo'},'open_positions':0,'pending_orders':0}
  def resolve(login,server):return self.new if login==222 and server=='Fixture' else None
  self.client=TestClient(create_app([self.base],'c'*40,forward,resolve))
 def query(self,login,password,token='c'*40):return self.client.post('/observer/account-status',json={'login':login,'server':'Fixture','password':password},headers={'Authorization':'Bearer '+token})
 def test_new_account_resolves_and_projects_status(self):
  r=self.query(222,'new-fixture');self.assertEqual(r.status_code,200);self.assertTrue(r.json()['connected']);self.assertFalse(r.json()['execution_enabled']);self.assertNotIn('password',r.json());self.assertEqual(self.forwarded,[222])
 def test_static_binding_preserved(self):self.assertEqual(self.query(111,'base-fixture').status_code,200)
 def test_wrong_secret_denied_before_forward(self):self.assertEqual(self.query(222,'wrong').status_code,403);self.assertFalse(self.forwarded)
 def test_missing_service_authentication_denied(self):self.assertEqual(self.query(222,'new-fixture','wrong').status_code,401);self.assertFalse(self.forwarded)
 def test_endpoint_collision_holds(self):
  self.new=Binding('justmarkets',222,'Fixture','client',self.base.url,'new-fixture','b'*40)
  self.assertEqual(self.query(222,'new-fixture').status_code,503);self.assertFalse(self.forwarded)
if __name__=='__main__':unittest.main(verbosity=2)
