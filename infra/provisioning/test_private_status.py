import importlib.util,unittest
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('status',Path(__file__).with_name('read-account-status.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.binding=SimpleNamespace(owner_kind='mentor',owner_id=1,role='mentor',password='FIXTURE')
  self.input={'login':123,'server':'Fixture','password':'FIXTURE'};self.calls=[]
 def fetch(self,b):self.calls.append(b);return {'fixture':True}
 def call(self,p=None):return m.lookup(p or self.input,lambda *args:self.binding,self.fetch,lambda b,d:{'owner_id':b.owner_id,'execution_enabled':False})
 def test_projects_owner_from_private_binding(self):self.assertEqual(self.call(),{'owner_id':1,'execution_enabled':False});self.assertEqual(len(self.calls),1)
 def test_wrong_password_never_contacts_sdk(self):
  with self.assertRaises(ValueError):self.call(self.input|{'password':'wrong'})
  self.assertFalse(self.calls)
 def test_role_mismatch_never_contacts_sdk(self):
  self.binding.role='client'
  with self.assertRaises(ValueError):self.call()
  self.assertFalse(self.calls)
 def test_request_cannot_select_tenant_or_command(self):
  for extra in ({'owner_id':99},{'command':'shell'},{'path':'/etc'}):
   with self.assertRaises(ValueError):self.call(self.input|extra)
  self.assertFalse(self.calls)
if __name__=='__main__':unittest.main()
