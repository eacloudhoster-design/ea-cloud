import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
from fastapi.testclient import TestClient
from readonly_account_relay import Binding,create_app,project_snapshot,PrivateStatusError
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
 def test_nonroot_private_proxy_preserves_owner_and_drops_extra_fields(self):
  import dataclasses
  binding=dataclasses.replace(self.new,owner_kind='client',owner_id=7)
  def proxy(payload):
   self.assertEqual(payload,{'login':222,'server':'Fixture','password':'new-fixture'})
   snapshot=dict.fromkeys(('success','read_only','initialized','identity_verified','portable_paths_verified','connected','positions_read_verified','orders_read_verified'),True)|{'automated_trading_enabled':False,'execution_enabled':False,'financial_trades':0,'account':{'login':222,'server':'Fixture','mode':'demo'},'open_positions':0,'pending_orders':0}
   return project_snapshot(binding,snapshot)|{'password':'DO_NOT_PROJECT','debug':'DO_NOT_PROJECT'}
  self.client=TestClient(create_app([self.base],'c'*40,forward_dynamic=proxy))
  response=self.query(222,'new-fixture');self.assertEqual(response.status_code,200);self.assertEqual(response.json()['owner_id'],7);self.assertNotIn('DO_NOT_PROJECT',response.text)
 def test_private_proxy_missing_owner_denied(self):
  self.client=TestClient(create_app([self.base],'c'*40,forward_dynamic=lambda payload:{'success':True,'read_only':True}))
  self.assertEqual(self.query(222,'new-fixture').status_code,503)
 def test_tunnel_provisioning_has_distinct_auth_and_no_financial_route(self):
  import hashlib
  from provisioning_proxy import ProvisioningProxy
  token='p'*48;calls=[]
  def send(*args):calls.append(args);return 202,{'state':'provisioning','executionEnabled':False}
  proxy=ProvisioningProxy(hashlib.sha256(token.encode()).hexdigest(),send)
  self.client=TestClient(create_app([self.base],'c'*40,provisioning_proxy=proxy))
  response=self.client.post('/v1/provision',json={},headers={'Authorization':'Bearer '+token});self.assertEqual(response.status_code,202);self.assertEqual(len(calls),1)
  response=self.client.post('/v1/provision',json={},headers={'Authorization':'Bearer '+'c'*40});self.assertEqual(response.status_code,401);self.assertEqual(len(calls),1)
  self.assertEqual(self.query(111,'base-fixture',token).status_code,401)
  response=self.client.post('/observer/sync-position',json={},headers={'Authorization':'Bearer '+'c'*40});self.assertEqual(response.status_code,404)
 def test_private_proxy_preserves_assignment_and_credential_error_codes(self):
  for code in ('ACCOUNT_NOT_ASSIGNED','ACCOUNT_PROOF_REJECTED'):
   def proxy(payload):raise PrivateStatusError(code)
   self.client=TestClient(create_app([self.base],'c'*40,forward_dynamic=proxy))
   response=self.query(222,'new-fixture');self.assertEqual(response.status_code,403);self.assertEqual(response.json()['code'],code)
 def test_static_missing_assignment_is_distinct_from_wrong_password(self):
  self.client=TestClient(create_app([self.base],'c'*40))
  self.assertEqual(self.query(999,'new-fixture').json()['code'],'ACCOUNT_NOT_ASSIGNED')
  self.assertEqual(self.query(111,'wrong').json()['code'],'ACCOUNT_PROOF_REJECTED')
 def test_active_engine_status_precedes_static_readonly_binding(self):
  def proxy(payload):
   return {'success':True,'connected':True,'simulation':False,'financial_routes':False,'owner_kind':'client','owner_id':7,'login':111,'server':'Fixture','broker':'justmarkets','role':'client','account_mode':'demo','read_only':False,'execution_enabled':False,'protocol':'EA_BOUND_ACCOUNT_STATUS_V1','journal_bound':True,'journal_holds':0,'emergency_stop_active':True,'currency':None,'balance':None,'equity':None,'open_positions':0,'pending_orders':0}
  self.client=TestClient(create_app([self.base],'c'*40,forward_dynamic=proxy));response=self.query(111,'base-fixture');self.assertEqual(response.status_code,200);self.assertFalse(response.json()['read_only']);self.assertTrue(response.json()['emergency_stop_active']);self.assertEqual(response.json()['owner_id'],7)
 def test_failed_engine_authority_blocks_static_fallback(self):
  def proxy(payload):raise ValueError('UNAVAILABLE')
  self.client=TestClient(create_app([self.base],'c'*40,forward_dynamic=proxy));self.assertEqual(self.query(111,'base-fixture').status_code,503)
 def test_only_explicit_no_dynamic_binding_allows_static_fallback(self):
  self.client=TestClient(create_app([self.base],'c'*40,forward_dynamic=lambda p:{'success':False,'code':'NO_DYNAMIC_BINDING'}));self.assertEqual(self.query(111,'wrong').status_code,403)
if __name__=='__main__':unittest.main(verbosity=2)
