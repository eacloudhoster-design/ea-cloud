import importlib.util,json,os,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('bootstrap',Path(__file__).parents[1]/'linux/bootstrap-account-runtime.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RuntimeTests(unittest.TestCase):
 def test_fresh_bootstrap_has_no_credentials_or_broker_calls(self):
  with tempfile.TemporaryDirectory() as root:
   home=Path(root);calls=[]
   def run(args,**kw):
    calls.append((args,kw));return SimpleNamespace(stdout=b'{"sdk":"fixture","fastapi":"fixture"}')
   with patch.dict(os.environ,HOME=root,WINEPREFIX=root+'/wine'),patch.object(m.os,'geteuid',return_value=1000),patch.object(m.subprocess,'run',side_effect=run):m.main()
   self.assertTrue((home/'.runtime-prepared').exists());self.assertIn('wineboot',calls[0][0][0]);self.assertEqual(calls[0][1]['timeout'],110)
   command=' '.join(str(x[0]) for x in calls)
   self.assertNotIn('.initialize(',command);self.assertNotIn('login(',command);self.assertNotIn('order_send',command)
 def test_partial_prefix_is_held_without_wineboot_retry(self):
  with tempfile.TemporaryDirectory() as root:
   (Path(root)/'wine').mkdir()
   with patch.dict(os.environ,HOME=root,WINEPREFIX=root+'/wine'),patch.object(m.os,'geteuid',return_value=1000),patch.object(m.subprocess,'run') as run:
    with self.assertRaises(RuntimeError):m.main()
   self.assertEqual(run.call_count,1);self.assertTrue(run.call_args.args[0][0].endswith('wineserver'));self.assertFalse((Path(root)/'.runtime-prepared').exists())
 def test_wrong_prefix_refused_before_process_creation(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,HOME=root,WINEPREFIX='/another/customer'),patch.object(m.os,'geteuid',return_value=1000),patch.object(m.subprocess,'run') as run:
   with self.assertRaises(RuntimeError):m.main()
   run.assert_not_called()
if __name__=='__main__':unittest.main()
