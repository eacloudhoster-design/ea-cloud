import json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from execution_gates import publish_stop_mirror,mirrored_stop_active
class GateTests(unittest.TestCase):
 def test_actual_root_file_atomic_stop_changes_staleness_and_clock_reversal(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);stop=root/'STOP';stop.touch();file=root/'state.json'
   publish_stop_mirror(root,[stop],now=100);self.assertTrue(mirrored_stop_active(file,now=101));stop.unlink()
   publish_stop_mirror(root,[stop],now=100);self.assertFalse(mirrored_stop_active(file,now=101))
   self.assertTrue(mirrored_stop_active(file,now=104));self.assertTrue(mirrored_stop_active(file,now=99));self.assertFalse(stop.exists())
 def test_missing_malformed_writable_and_symlinked_mirrors_are_closed(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);file=root/'state.json';self.assertTrue(mirrored_stop_active(file,now=101))
   file.write_text('{}');self.assertTrue(mirrored_stop_active(file,now=101))
   publish_stop_mirror(root,[],now=100);file.chmod(0o666);self.assertTrue(mirrored_stop_active(file,now=101));file.chmod(0o644)
   link=root/'link';link.symlink_to(file);self.assertTrue(mirrored_stop_active(link,now=101))
 def test_nonroot_and_unsafe_directory_cannot_publish(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   with patch('execution_gates.os.geteuid',return_value=123):
    with self.assertRaises(PermissionError):publish_stop_mirror(root,[])
   root.chmod(0o777)
   with self.assertRaises(PermissionError):publish_stop_mirror(root,[])
 def test_invalid_latch_entries_or_missing_parent_remain_closed(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);stop=root/'STOP';stop.mkdir();file=root/'state.json'
   self.assertTrue(publish_stop_mirror(root,[stop],now=100)['stops_active'])
   stop.rmdir();stop.symlink_to(root/'missing');self.assertTrue(publish_stop_mirror(root,[stop],now=100)['stops_active'])
   stop.unlink();self.assertTrue(publish_stop_mirror(root,[root/'missing-parent'/'STOP'],now=100)['stops_active'])
 def test_boolean_timestamps_never_establish_clear_metadata(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);file=root/'state.json';file.write_text(json.dumps(dict(observed_at=True,expires_at=3,stops_active=False)))
   self.assertTrue(mirrored_stop_active(file,now=2))
 def test_publisher_process_exit_expires_and_restart_requires_fresh_metadata(self):
  import subprocess,time
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);file=root/'state.json';script="import sys,time;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from execution_gates import publish_stop_mirror;publish_stop_mirror(Path(sys.argv[2]),[]);print('ready',flush=True);time.sleep(30)"
   def start():
    child=subprocess.Popen([sys.executable,'-c',script,str(Path(__file__).resolve().parents[1]),folder],stdout=subprocess.PIPE,text=True)
    self.assertEqual(child.stdout.readline().strip(),'ready');return child
   child=start()
   try:self.assertFalse(mirrored_stop_active(file))
   finally:child.terminate();child.wait(timeout=5);child.stdout.close()
   observed=json.loads(file.read_text())['observed_at'];self.assertTrue(mirrored_stop_active(file,now=observed+4))
   child=start()
   try:self.assertFalse(mirrored_stop_active(file));self.assertTrue(mirrored_stop_active(root/'unavailable.json'))
   finally:child.terminate();child.wait(timeout=5);child.stdout.close()
