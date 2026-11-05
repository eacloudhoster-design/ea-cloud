import json,sys,sqlite3,unittest,importlib.util
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'infra/linux'))
spec=importlib.util.spec_from_file_location('engine_alerts',Path(__file__).resolve().parents[2]/'infra/linux/engine-alerts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class EngineAlertTests(unittest.TestCase):
 def test_stale_or_missing_snapshot_alarms_without_assuming_recovery(self):
  self.assertEqual(m.merge_status({'observed_at':100,'alerts':[]},{'observed_at':100,'alerts':['held']},now=101)['alerts'],['engine: held'])
  self.assertEqual(len(m.merge_status({}, {'observed_at':1,'alerts':[]},now=500)['alerts']),2)
 def test_combined_alarm_outbox_failure_restart_and_recovery_use_local_sink_only(self):
  db=sqlite3.connect(':memory:');status=m.merge_status({'observed_at':100,'alerts':[]},{'observed_at':100,'alerts':['held']},now=101)
  m.queue_alert(db,status);m.queue_alert(db,status);self.assertEqual(db.execute('SELECT count(*) FROM outbox').fetchone()[0],1)
  def fail(body):raise OSError('isolated sink failure')
  self.assertEqual(m.deliver_alerts(db,'https://fixture.invalid','a'*64,fail),0)
  db.execute('UPDATE outbox SET due=0');db.commit();received=[];self.assertEqual(m.deliver_alerts(db,'https://fixture.invalid','a'*64,received.append),1)
  self.assertIn('engine: held',received[0]);m.queue_alert(db,{'observed_at':102,'alerts':[]});self.assertEqual(m.deliver_alerts(db,'https://fixture.invalid','a'*64,received.append),1);self.assertEqual(json.loads(received[-1])['state'],'recovered');db.close()
