import importlib.util,json,sqlite3,sys,tempfile,types,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'vps-mt5-service'))
from dynamic_readonly_registry import load
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  import hashlib
  key=hashlib.sha256(json.dumps(['123','Fixture'],separators=(',',':')).encode()).hexdigest()
  self.db=self.root/'allocations.sqlite3'
  with sqlite3.connect(self.db) as db:db.execute('CREATE TABLE allocations(request TEXT,slot TEXT,owner TEXT,account TEXT,state TEXT)');db.execute('INSERT INTO allocations VALUES(?,?,?,?,?)',('fixture','ss-test','["client",7]',key,'verified_readonly'))
  self.db.chmod(0o600);credentials=self.root/'ss-test-credentials';credentials.mkdir(mode=0o700)
  for name in ('api-token','broker-password'):(credentials/name).write_text('ENCRYPTED');(credentials/name).chmod(0o600)
  self.descriptor=self.root/'ss-test-enrollment.json';self.descriptor.write_text(json.dumps({'requestId':'fixture','owner':['client',7],'login':123,'server':'Fixture','executionEnabled':False,'credentials':str(credentials),'broker':'justmarkets','role':'client','url':'http://127.0.0.1:10080'}));self.descriptor.chmod(0o600)
  self.old=sys.modules.get('readonly_account_relay');sys.modules['readonly_account_relay']=types.SimpleNamespace(Binding=lambda **kwargs:types.SimpleNamespace(**kwargs))
 def tearDown(self):
  if self.old is None:sys.modules.pop('readonly_account_relay',None)
  else:sys.modules['readonly_account_relay']=self.old
  self.tmp.cleanup()
 def resolve(self):return load(123,'Fixture',root=self.root,decrypt=lambda n,p:'test-token'*8 if n=='api-token' else 'test-secret')
 def test_verified_descriptor_returns_exact_binding(self):
  b=self.resolve();self.assertEqual(b.login,123);self.assertEqual(b.role,'client')
 def test_unknown_and_held_never_resolve(self):
  self.assertIsNone(load(999,'Fixture',root=self.root,decrypt=lambda *a:self.fail('must not decrypt')))
  with sqlite3.connect(self.db) as db:db.execute("UPDATE allocations SET state='held'")
  self.assertIsNone(self.resolve())
 def test_cross_owner_descriptor_rejected(self):
  v=json.loads(self.descriptor.read_text());v['owner']=['client',99];self.descriptor.write_text(json.dumps(v))
  with self.assertRaises(ValueError):self.resolve()
 def test_symlink_descriptor_rejected(self):
  target=self.root/'other';self.descriptor.rename(target);self.descriptor.symlink_to(target)
  with self.assertRaises(ValueError):self.resolve()
 def test_insecure_ciphertext_permissions_rejected(self):
  (self.root/'ss-test-credentials/api-token').chmod(0o644)
  with self.assertRaises(ValueError):self.resolve()
if __name__=='__main__':unittest.main(verbosity=2)
