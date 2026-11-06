import importlib.util,os,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('supervise',Path(__file__).resolve().parents[2]/'infra/linux/supervise-portable-terminal.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SupervisorTests(unittest.TestCase):
 def test_handover_tracks_terminal_updater_and_ignores_sdk_other_users_and_self(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'100';p.mkdir();(p/'cmdline').write_bytes(b'Z:\\bound\\terminal\\terminal64.exe\0/portable\0')
   self.assertTrue(module.terminal_running(root,os.getuid(),own=999))
   (p/'comm').write_text('wine\n');self.assertFalse(module.terminal_running(root,os.getuid(),own=999,ready=True))
   (p/'comm').write_text('main\n');self.assertTrue(module.terminal_running(root,os.getuid(),own=999,ready=True))
   (p/'cmdline').write_bytes(b'C:\\users\\account\\liveupdate\\terminal64.exe\0/update\0')
   self.assertTrue(module.terminal_running(root,os.getuid(),own=999))
   self.assertFalse(module.terminal_running(root,os.getuid()+1,own=999))
   self.assertFalse(module.terminal_running(root,os.getuid(),own=100))
   (p/'cmdline').write_bytes(b'python.exe\0demo_readonly_api.py\0')
   self.assertFalse(module.terminal_running(root,os.getuid(),own=999))
