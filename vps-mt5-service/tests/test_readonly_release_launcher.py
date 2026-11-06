import ast,contextlib,importlib.util,io,json,os,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
path=Path(__file__).resolve().parents[2]/'infra/linux/wine-readonly-api.py';spec=importlib.util.spec_from_file_location('readonly_launcher',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class LauncherTests(unittest.TestCase):
 def test_runtime_uses_its_release_and_secret_stdin_only(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'account.json').write_text(json.dumps({'account_mode':'demo'}));(root/'broker-password').write_text('fixture-private-password');(root/'api-token').write_text('x'*64)
   output=io.StringIO()
   with patch.dict(os.environ,{'CREDENTIALS_DIRECTORY':d,'HOME':d,'API_PORT':'8350'}),patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],0)) as run,contextlib.redirect_stdout(output):
    self.assertEqual(module.main(),0)
   args=run.call_args.args[0];options=run.call_args.kwargs
   self.assertEqual(args[2],'-c');self.assertEqual(ast.literal_eval(ast.parse(args[3]).body[1].value.args[1]),'Z:'+str(path.parents[2]/'vps-mt5-service').replace('/','\\'));self.assertIn('sys.path.insert(0,',args[3]);self.assertNotIn('fixture-private-password',' '.join(args));self.assertEqual(json.loads(options['input'])['password'],'fixture-private-password');self.assertEqual(options['stderr'],subprocess.DEVNULL);self.assertNotIn('fixture-private-password',output.getvalue())
