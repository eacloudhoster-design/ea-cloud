"""New live-read-only contract tests. Fixture SDK only; order submission must never run."""
import sys,unittest
from pathlib import Path
from types import SimpleNamespace as NS
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from demo_readonly_probe import probe
from readonly_account_relay import Binding,create_app

class SDK:
 __version__='fixture';ACCOUNT_TRADE_MODE_DEMO=0;ACCOUNT_TRADE_MODE_REAL=2
 def __init__(self):self.calls=[];self.mode=2;self.auto=False
 def initialize(self,*args,**kw):self.calls.append('initialize');return True
 def account_info(self):return NS(login=10001,server='Fixture-Live',trade_mode=self.mode,currency='USD',balance=12,equity=11)
 def terminal_info(self):return NS(path=r'C:\blank',data_path=r'C:\blank',connected=True,trade_allowed=self.auto)
 def positions_get(self):return ()
 def orders_get(self):return ()
 def symbols_get(self):return (NS(name='EURUSD'),)
 def symbol_select(self,*args):return True
 def symbol_info(self,*args):return NS()
 def symbol_info_tick(self,*args):return NS(bid=1.1,ask=1.2,time_msc=1)
 def shutdown(self):self.calls.append('shutdown')
 def order_send(self,*args):raise AssertionError('No order permission exists')

class Tests(unittest.TestCase):
 def setUp(self):self.sdk=SDK();self.config=dict(account_mode='live',allow_live_readonly=True,login=10001,server='Fixture-Live',terminal_path=r'C:\blank\terminal64.exe')
 def test_live_requires_explicit_mode_approval_before_sdk(self):
  del self.config['allow_live_readonly'];r=probe(self.sdk,self.config,'FIXTURE');self.assertFalse(r['initialized']);self.assertEqual(self.sdk.calls,[])
 def test_mode_is_verified_from_sdk_and_not_server_name(self):
  r=probe(self.sdk,self.config,'FIXTURE');self.assertTrue(r['identity_verified']);self.assertEqual(r['account']['mode'],'live');self.assertFalse(r['execution_enabled']);self.assertEqual(r['financial_trades'],0)
  self.sdk.mode=0;self.assertFalse(probe(self.sdk,self.config,'FIXTURE')['identity_verified'])
 def test_autotrading_on_or_wrong_portable_path_never_passes(self):
  self.sdk.auto=True;r=probe(self.sdk,self.config,'FIXTURE');self.assertNotIn('account',r)
  self.sdk.auto=False;self.config['terminal_path']=r'C:\other\terminal64.exe';self.assertFalse(probe(self.sdk,self.config,'FIXTURE')['portable_paths_verified'])
 def test_live_relay_exact_mode_and_no_financial_routes(self):
  b=Binding('justmarkets',10001,'Fixture-Live','client','http://127.0.0.1:10080','FIXTURE','x'*48,account_mode='live')
  snapshot={**probe(self.sdk,self.config,'FIXTURE'),'success':True};headers={'Authorization':'Bearer '+'y'*48}
  client=TestClient(create_app([b],'y'*48,lambda binding:snapshot))
  payload=dict(login=10001,server='Fixture-Live',password='FIXTURE');r=client.post('/observer/account-status',headers=headers,json=payload)
  self.assertEqual(r.status_code,200);self.assertEqual(r.json()['account_mode'],'live');self.assertFalse(r.json()['execution_enabled'])
  for path in ('/execute-trade','/observer/sync-position','/close-trade'):self.assertEqual(client.post(path,headers=headers,json={}).status_code,404)
  snapshot['account']['mode']='demo';self.assertEqual(client.post('/observer/account-status',headers=headers,json=payload).status_code,503)
if __name__=='__main__':unittest.main()
