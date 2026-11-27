import sys,hashlib,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
from fastapi import FastAPI,Request
from fastapi.testclient import TestClient
from provisioning_proxy import ProvisioningProxy
class Tests(unittest.TestCase):
 def setUp(self):
  self.token='P'*48;self.calls=[]
  def send(*args):self.calls.append(args);return 202,{'requestId':'fixture','state':'provisioning','executionEnabled':False}
  self.proxy=ProvisioningProxy(hashlib.sha256(self.token.encode()).hexdigest(),send)
  app=FastAPI()
  @app.api_route('/{path:path}',methods=['POST','GET','DELETE'])
  async def route(request:Request):
   if not self.proxy.supports(request.method,request.url.path):return {'unsupported':True}
   return await self.proxy(request)
  self.client=TestClient(app)
 def test_auth_is_separate_and_never_contacts_root_on_failure(self):
  response=self.client.post('/v1/provision',json={},headers={'Authorization':'Bearer '+'S'*48});self.assertEqual(response.status_code,401);self.assertFalse(self.calls)
 def test_exact_path_body_and_original_provisioning_auth_forwarded_once(self):
  response=self.client.post('/v1/provision',json={'password':'FIXTURE_ONLY'},headers={'Authorization':'Bearer '+self.token});self.assertEqual(response.status_code,202);self.assertEqual(len(self.calls),1);self.assertEqual(self.calls[0][:3],('POST','/v1/provision','Bearer '+self.token));self.assertNotIn('FIXTURE_ONLY',response.text)
 def test_size_limit_before_root_call(self):
  response=self.client.post('/v1/provision',content=b'x'*8193,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'});self.assertEqual(response.status_code,413);self.assertFalse(self.calls)
 def test_redirect_selector_query_and_financial_routes_not_supported(self):
  response=self.client.post('/v1/provision?url=http://other',json={},headers={'Authorization':'Bearer '+self.token});self.assertEqual(response.status_code,422);self.assertFalse(self.calls)
  for path in ['/observer/sync-position','/v1/provision/../../secret','/v1/account-status']:
   self.assertFalse(self.proxy.supports('POST',path))
 def test_poll_does_not_retransmit_credentials(self):
  path='/v1/provision/12345678-1234-1234-1234-123456789abc';response=self.client.get(path,headers={'Authorization':'Bearer '+self.token});self.assertEqual(response.status_code,202);self.assertEqual(self.calls[0][3],b'')
if __name__=='__main__':unittest.main()
