import contextlib,importlib.util,io,json,os,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
class AccountLauncherTests(unittest.TestCase):
 def test_account_credentials_only_cross_private_stdin(self):
  path=Path(__file__).resolve().parents[2]/'infra/linux/wine-account-worker.py'
  spec=importlib.util.spec_from_file_location('private_api_launcher',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   (root/'account.json').write_text(json.dumps(dict(account_mode='demo')))
   (root/'broker-password').write_text('fixture-broker-secret')
   (root/'api-token').write_text('fixture-api-secret')
   def run(args,**kwargs):
    self.assertEqual(args[2],'Z:'+str(path.resolve().parents[2]/'vps-mt5-service/demo_worker.py').replace('/','\\'))
    self.assertNotIn('fixture-broker-secret',str(args));self.assertNotIn('fixture-api-secret',str(args))
    data=json.loads(kwargs['input']);self.assertEqual(data['engine'],'real-sdk-v1');self.assertNotIn('fixture-broker-secret',kwargs['input']);self.assertNotIn('fixture-api-secret',kwargs['input'])
    self.assertEqual(kwargs['stdout'],module.subprocess.DEVNULL);self.assertEqual(kwargs['stderr'],module.subprocess.DEVNULL)
    return NS(returncode=0)
   with patch.dict(os.environ,dict(CREDENTIALS_DIRECTORY=directory,HOME=directory,API_PORT='8201')),patch.object(module.subprocess,'run',run):
    output=io.StringIO()
    with contextlib.redirect_stdout(output):status=module.main()
    self.assertEqual(status,0);self.assertNotIn('secret',output.getvalue())

 def test_relocated_release_never_launches_primary_checkout_worker(self):
  path=Path(__file__).resolve().parents[2]/'infra/linux/wine-account-worker.py';spec=importlib.util.spec_from_file_location('relocated_worker',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);launcher=root/'release/infra/linux/wine-account-worker.py';launcher.parent.mkdir(parents=True);entry=root/'release/vps-mt5-service/demo_worker.py';entry.parent.mkdir();entry.write_text('# isolated fixture')
   (root/'account.json').write_text(json.dumps({'account_mode':'demo'}));(root/'broker-password').write_text('fixture');(root/'api-token').write_text('fixture-token')
   captured=[]
   def run(args,**kwargs):captured.append(args);return NS(returncode=0)
   with patch.dict(os.environ,dict(CREDENTIALS_DIRECTORY=str(root),HOME=str(root),API_PORT='8201')),patch.object(module,'__file__',str(launcher)),patch.object(module.subprocess,'run',run),contextlib.redirect_stdout(io.StringIO()):self.assertEqual(module.main(),0)
   self.assertEqual(captured[0][2],'Z:'+str(entry).replace('/','\\'));self.assertNotIn(r'Z:\opt\ea-cloud\vps-mt5-service',captured[0][2])
