import sys,unittest,importlib.util
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
spec=importlib.util.spec_from_file_location('registry_review',Path(__file__).resolve().parents[2]/'infra/linux/review-account-routing.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RegistryTests(unittest.TestCase):
 def configs(self):return {role:dict(broker='justmarkets',login=i,server='FixtureDemo',account_mode='demo',terminal_path='C:/'+role+'/terminal64.exe',journal_path='C:/'+role+'/journal.db',role=role,enabled=False,execution_approved=False) for role,i in [('mentor',1),('client',2)]}
 def test_complete_pair_and_role_mismatch_are_distinguished_without_bindings_in_output(self):
  configs=self.configs();configs={'source':configs['mentor'],'receiver':configs['client']};tokens={'source':'a'*64,'receiver':'b'*64}
  result=m.assess_pair(configs,tokens);self.assertTrue(result['mapping_contract_ready']);self.assertNotIn('FixtureDemo',str(result));self.assertNotIn('a'*64,str(result))
  configs['source'].pop('role');self.assertFalse(m.assess_pair(configs,tokens)['mapping_contract_ready'])
 def test_registry_rejects_duplicate_identity_endpoint_and_wrong_role(self):
  configs=self.configs();rows=[dict(login=i,server='FixtureDemo',mode='demo',broker='justmarkets',role=role,url='http://127.0.0.1:'+str(8300+i)) for role,i in [('mentor',1),('client',2)]]
  self.assertTrue(m.inspect_registry({'accounts':rows},configs)['valid'])
  for change in [dict(login=1),dict(url=rows[0]['url']),dict(role='mentor')]:self.assertFalse(m.inspect_registry({'accounts':[rows[0],{**rows[1],**change}]},configs)['valid'])
