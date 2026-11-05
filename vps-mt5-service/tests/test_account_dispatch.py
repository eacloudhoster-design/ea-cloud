import sys,unittest
from pathlib import Path
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from account_dispatch import create_dispatch_app
class DispatchTests(unittest.TestCase):
 def setUp(self):
  self.calls=[];self.binding={'broker':'deriv','login':1,'server':'DemoFixture','mode':'demo','role':'client','url':'http://127.0.0.1:8201','token':'a'*64}
  def forward(binding,path,payload=None):
   self.calls.append((binding,path,payload))
   return 200,{'success':True,'simulation':False,'account_mode':'demo','version':2,'persistentJournal':True,'absoluteTargets':True,'login':1,'server':'DemoFixture'}
  self.forward=forward;self.client=TestClient(create_dispatch_app([self.binding],'b'*64,forward));self.headers={'Authorization':'Bearer '+'b'*64}
  self.payload={'login':1,'server':'DemoFixture','password':'must-stay-out-of-worker-request','sourceKey':'a'*64,'revision':1,'symbol':'EURUSD','target':.1,'sl':0,'tp':0,'maxVolume':1}
 def test_binding_authentication_and_password_is_not_forwarded(self):
  self.assertEqual(self.client.get('/observer/capabilities').status_code,401)
  self.assertEqual(self.client.get('/observer/capabilities',headers=self.headers).status_code,200)
  result=self.client.post('/observer/sync-position',headers=self.headers,json=self.payload)
  self.assertTrue(result.json()['success']);self.assertNotIn('must-stay-out-of-worker-request',str(self.calls))
  self.payload['login']=2;self.assertEqual(self.client.post('/observer/sync-position',headers=self.headers,json=self.payload).status_code,403)
 def test_simulation_cannot_masquerade_as_demo_execution(self):
  client=TestClient(create_dispatch_app([self.binding],'b'*64,lambda *a:(200,{'success':True,'simulation':True})))
  self.assertEqual(client.get('/observer/capabilities',headers=self.headers).status_code,503)
  self.assertEqual(client.post('/observer/sync-position',headers=self.headers,json=self.payload).status_code,503)
 def test_remote_worker_and_live_mode_are_rejected(self):
  for changed in [{'url':'http://203.0.113.1:8201'},{'mode':'live'}]:
   with self.assertRaises(ValueError):create_dispatch_app([{**self.binding,**changed}],'b'*64,self.forward)
 def test_real_http_forward_preserves_only_safe_pre_submission_retry(self):
  import http.server,json,threading
  mode=['offline']
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_POST(handler):
    handler.rfile.read(int(handler.headers.get('content-length','0')))
    body={'success':False,'retriable':True,'submission_started':False,'message':'fixture-secret-must-be-suppressed'}
    if mode[0]=='uncertain':body['uncertain']=True
    handler.send_response(503);handler.send_header('Content-Type','application/json');handler.end_headers();handler.wfile.write(json.dumps(body).encode())
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   binding={**self.binding,'url':'http://127.0.0.1:'+str(server.server_port)}
   client=TestClient(create_dispatch_app([binding],'b'*64))
   response=client.post('/observer/sync-position',headers=self.headers,json=self.payload)
   self.assertEqual(response.status_code,503);self.assertTrue(response.json()['retriable']);self.assertNotIn('fixture-secret',response.text)
   mode[0]='uncertain';response=client.post('/observer/sync-position',headers=self.headers,json=self.payload)
   self.assertFalse(response.json()['retriable'])
  finally:server.shutdown();server.server_close();thread.join()

 def test_account_status_projection_and_mentor_execution_rejection_for_all_profiles(self):
  for broker in ['deriv','exness','justmarkets','xm','rcg']:
   for role in ['mentor','client']:
    binding={**self.binding,'broker':broker,'role':role}
    def forward(binding,path,payload=None):
     self.assertEqual(path,'/v1/account-status');self.assertEqual(payload['password'],'fixture-private')
     return 200,dict(success=True,connected=True,simulation=False,account_mode='demo',broker=broker,role=role,login=1,server='DemoFixture',execution_enabled=False,emergency_stop_active=True,journal_bound=True,password='must-never-escape')
    client=TestClient(create_dispatch_app([binding],'b'*64,forward))
    result=client.post('/observer/account-status',headers=self.headers,json={'login':1,'server':'DemoFixture','password':'fixture-private'})
    self.assertEqual(result.status_code,200);self.assertNotIn('must-never-escape',result.text)
    if role=='mentor':self.assertEqual(client.post('/observer/sync-position',headers=self.headers,json=self.payload).status_code,403)
 def test_account_status_rejects_misbound_and_simulated_acknowledgements(self):
  for changes in [dict(simulation=True),dict(login=2),dict(broker='xm'),dict(role='mentor'),dict(connected=False)]:
   base=dict(success=True,connected=True,simulation=False,account_mode='demo',login=1,server='DemoFixture',broker='deriv',role='client')
   client=TestClient(create_dispatch_app([self.binding],'b'*64,lambda *a:(200,{**base,**changes})))
   self.assertEqual(client.post('/connect-mt5',headers=self.headers,json={'login':1,'server':'DemoFixture','password':'fixture'}).status_code,503)
