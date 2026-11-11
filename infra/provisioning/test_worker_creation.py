import importlib.util,json,tempfile,unittest,uuid,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('driver',Path(__file__).with_name('dedicated-worker-driver.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Host:
 def __init__(self):self.calls=[];self.fail=False;self.live=False;self.bad=False
 def verify_slot(self,s):self.calls.append('verify')
 def encrypt(self,n,v,p):p.write_bytes(b'ENCRYPTED_FIXTURE');p.chmod(0o600);self.calls.append('encrypt')
 def prepare(self,s):self.calls.append('prepare')
 def start(self,s,c):self.calls.append('start');self.live=True
 def snapshot(self,s,t):
  if self.fail:raise TimeoutError('SECRET_VENDOR_ERROR')
  return dict.fromkeys(('success','read_only','initialized','identity_verified','portable_paths_verified','connected','positions_read_verified','orders_read_verified'),True)|{'automated_trading_enabled':False,'execution_enabled':False,'financial_trades':0,'account':{'login':999 if self.bad else 123,'server':'FixtureDemo','mode':'demo'}}
 def stop(self,s):self.calls.append('stop');self.live=False
 def inactive(self,s):return not self.live
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.image=self.root/'clean-image';self.image.mkdir()
  for name in ('python/python.exe','terminal/terminal64.exe'):
   p=self.image/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('offline fixture')
  self.state=self.root/'state';self.state.mkdir(mode=0o700)
  self.stops=[self.root/'STOP',self.root/'CLEANUP'];[p.touch() for p in self.stops]
  slot={'id':'ss-fixture','broker':'justmarkets','servers':['FixtureDemo'],'uid':40001,'gid':40001,'port':10080,'display':200,'home':str(self.root/'newhome'),'image':str(self.image),'manifest':{str(p.relative_to(self.image)):m.sha(p) for p in self.image.rglob('*') if p.is_file()}}
  self.config={'enabled':True,'state_root':str(self.state),'stops':list(map(str,self.stops)),'slots':[slot]};self.host=Host();self.driver=m.Driver(self.config,self.host)
  self.request={'requestId':str(uuid.uuid4()),'ownerKind':'client','ownerId':7,'broker':'justmarkets','login':'123','server':'FixtureDemo','password':'PASSWORD_FIXTURE_ONLY','role':'client','accountMode':'demo','executionEnabled':False}
 def tearDown(self):self.tmp.cleanup()
 def test_create_separate_home_encrypted_creds_verified_descriptor(self):
  result=self.driver.create(self.request);self.assertEqual(result['state'],'verified_readonly');self.assertTrue((self.root/'newhome').is_dir());self.assertEqual((self.root/'newhome').stat().st_mode&0o777,0o700)
  for p in self.state.rglob('*'):
   if p.is_file():self.assertNotIn(b'PASSWORD_FIXTURE_ONLY',p.read_bytes())
  cfg=json.loads((self.state/'ss-fixture-enrollment.json').read_text());self.assertEqual(cfg['owner'],['client',7]);self.assertFalse(cfg['executionEnabled'])
 def test_duplicate_request_never_restarts(self):
  self.driver.create(self.request)
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertEqual(self.host.calls.count('start'),1)
 def test_cross_owner_same_account_blocked(self):
  self.driver.create(self.request);self.request.update(requestId=str(uuid.uuid4()),ownerId=99)
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertEqual(self.host.calls.count('start'),1)
 def test_unknown_broker_role_live_and_command_refused(self):
  for k,v in [('broker','unknown'),('role','mentor'),('accountMode','live'),('executionEnabled',True),('command','shell')]:
   with self.subTest(k=k),self.assertRaises(RuntimeError):self.driver.create(self.request|{k:v})
  self.assertNotIn('start',self.host.calls)
 def test_image_extra_file_and_tampering_fail_closed(self):
  (self.image/'unexpected').write_text('no')
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  (self.image/'unexpected').unlink();(self.image/'python/python.exe').write_text('modified')
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
 def test_symlink_image_refused(self):
  (self.image/'link').symlink_to('/etc/passwd')
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
 def test_stops_mandatory_and_default_disabled(self):
  self.config['enabled']=False
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.config['enabled']=True;self.stops[1].unlink()
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
 def test_wrong_broker_identity_holds_and_stops(self):
  self.host.bad=True
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertFalse(self.host.live);self.assertIn('stop',self.host.calls)
 def test_partial_creation_timeout_not_retried(self):
  self.host.fail=True
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertEqual(self.host.calls.count('start'),1)
 def test_cleanup_requires_stop_confirmation_preserves_evidence(self):
  self.driver.create(self.request);result=self.driver.cleanup(self.request['requestId']);self.assertFalse(result['resourcesDeleted']);self.assertFalse(self.host.live);self.assertTrue((self.root/'newhome').exists())
 def test_broker_server_must_be_in_reviewed_slot_admission(self):
  self.request['server']='AnotherBrokerServer'
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertNotIn('start',self.host.calls)
 def test_existing_static_account_cannot_create_a_second_worker(self):
  from types import SimpleNamespace
  from unittest.mock import patch
  original_stat=m.Path.lstat;original_read=m.Path.read_text
  self.config['existing_registry']='/etc/ea-cloud/readonly-relay/registry.json'
  def metadata(path,*a,**kw):return SimpleNamespace(st_mode=m.stat.S_IFREG|0o600,st_uid=0) if str(path)==self.config['existing_registry'] else original_stat(path,*a,**kw)
  def contents(path,*a,**kw):return json.dumps({'accounts':[{'login':123,'server':'FixtureDemo'}]}) if str(path)==self.config['existing_registry'] else original_read(path,*a,**kw)
  with patch.object(m.Path,'lstat',metadata),patch.object(m.Path,'read_text',contents),self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertNotIn('start',self.host.calls)
 def test_conservative_capacity_counts_held_allocations(self):
  self.config['max_active_workers']=1
  with self.driver.db() as db:db.execute("INSERT INTO allocations VALUES('old','prior','[\"client\",7]','ss-prior','held')")
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertNotIn('start',self.host.calls)
 def test_capacity_and_existing_home_refused(self):
  self.config['slots']=[]
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
 def test_stop_after_materialization_prevents_start(self):
  old=self.host.prepare
  def prepare(s):old(s);self.stops[0].unlink()
  self.host.prepare=prepare
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.assertNotIn('start',self.host.calls)
 def test_approved_live_readonly_uses_exact_live_identity_and_never_execution(self):
  self.request['accountMode']='live'
  with self.assertRaises(RuntimeError):self.driver.create(self.request)
  self.config['allow_live_readonly']=True
  snapshot=self.host.snapshot
  def live(s,t):
   proof=snapshot(s,t);proof['account']['mode']='live';return proof
  self.host.snapshot=live
  self.assertEqual(self.driver.create(self.request)['state'],'verified_readonly')
  descriptor=json.loads((self.state/'ss-fixture-enrollment.json').read_text());self.assertEqual(descriptor['accountMode'],'live');self.assertFalse(descriptor['executionEnabled'])
 def test_readonly_startup_waits_for_api_without_restarting_worker(self):
  import urllib.request
  from unittest.mock import patch,MagicMock
  response=MagicMock();response.status=200;response.read.return_value=b'{"success":true}';response.__enter__.return_value=response
  opener=MagicMock();opener.open.side_effect=[OSError('not ready'),response]
  with patch.object(urllib.request,'build_opener',return_value=opener),patch.object(m.time,'sleep'):
   result=m.SystemdHost(self.config).snapshot(self.config['slots'][0],'FIXTURE')
  self.assertTrue(result['success']);self.assertEqual(opener.open.call_count,2);self.assertNotIn('start',self.host.calls)
if __name__=='__main__':unittest.main(verbosity=2)
