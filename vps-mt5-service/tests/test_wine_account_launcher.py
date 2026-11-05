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
    self.assertNotIn('fixture-broker-secret',str(args));self.assertNotIn('fixture-api-secret',str(args))
    data=json.loads(kwargs['input']);self.assertEqual(data['password'],'fixture-broker-secret');self.assertEqual(data['token'],'fixture-api-secret')
    self.assertEqual(kwargs['stdout'],module.subprocess.DEVNULL);self.assertEqual(kwargs['stderr'],module.subprocess.DEVNULL)
    return NS(returncode=0)
   with patch.dict(os.environ,dict(CREDENTIALS_DIRECTORY=directory,HOME=directory,API_PORT='8201')),patch.object(module.subprocess,'run',run):
    output=io.StringIO()
    with contextlib.redirect_stdout(output):status=module.main()
    self.assertEqual(status,0);self.assertNotIn('secret',output.getvalue())
