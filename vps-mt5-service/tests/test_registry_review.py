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

 def reviewed(self,configs):
  return m.assess_pair({'source':configs['mentor'],'receiver':configs['client']},{'source':'a'*64,'receiver':'b'*64})
 def test_truthy_enablement_coercion_never_looks_disabled(self):
  for value in ('true','1',1,True):
   for flag in ('enabled','execution_approved'):
    with self.subTest(value=value,flag=flag):
     configs=self.configs();configs['client'][flag]=value;report=self.reviewed(configs)
     self.assertFalse(report['mapping_contract_ready']);self.assertFalse(report['accounts']['receiver']['execution_disabled'])
 def test_unsafe_terminal_and_journal_paths_rejected_offline(self):
  for field in ('terminal_path','journal_path'):
   for value in ('relative.exe',r'C:relative.exe',r'\\host\share\terminal.exe',r'C:\root\..\terminal.exe',r'C:\root\NUL',r'C:\root\file:stream'):
    with self.subTest(field=field,value=value):
     configs=self.configs();configs['client'][field]=value;self.assertFalse(self.reviewed(configs)['mapping_contract_ready'])
 def test_same_terminal_directory_rejected_after_windows_normalization(self):
  configs=self.configs();configs['client']['terminal_path']=r'c:\MENTOR\terminal64.exe'
  report=self.reviewed(configs);self.assertFalse(report['distinct_terminal_directories']);self.assertFalse(report['mapping_contract_ready'])
 def test_shared_or_executable_journal_aliases_rejected(self):
  for value in (r'c:\MENTOR\journal.db',r'C:\mentor\terminal64.exe',r'C:\client\terminal64.exe',r'C:\mentor'):
   with self.subTest(path=value):
    configs=self.configs();configs['client']['journal_path']=value;self.assertFalse(self.reviewed(configs)['mapping_contract_ready'])
 def test_coerced_account_identity_cannot_evade_same_account_check(self):
  configs=self.configs();configs['client']['login']='1'
  report=self.reviewed(configs);self.assertFalse(report['distinct_account_identities']);self.assertFalse(report['mapping_contract_ready'])
 def test_valid_static_review_is_redacted_and_never_execution_authorization(self):
  from unittest.mock import patch
  with patch.object(m.urllib.request,'build_opener',side_effect=AssertionError('No network during metadata review')),patch('pathlib.Path.open',side_effect=AssertionError('No terminal or credential file access')):
   report=self.reviewed(self.configs())
  self.assertTrue(report['mapping_contract_ready'])
  self.assertFalse(report['terminal_files_verified']);self.assertFalse(report['sdk_runtime_verified']);self.assertFalse(report['execution_authorized'])
  for private in ('FixtureDemo','C:/mentor','C:/client','a'*64,'b'*64):self.assertNotIn(private,str(report))
  self.assertNotIn('MetaTrader5',sys.modules)
