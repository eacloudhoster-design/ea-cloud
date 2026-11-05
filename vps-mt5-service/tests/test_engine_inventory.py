import sys,unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('engine_inventory',Path(__file__).resolve().parents[2]/'infra/linux/engine-inventory.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class InventoryTests(unittest.TestCase):
 def base(self):return dict(services={'fixture':'active'},accounts=[{'alias':'fixture','journal_holds':None}],both_emergency_stops_active=True,active_execution_grant=False)
 def test_unprovisioned_journal_is_not_fabricated_as_a_hold_or_connection_proof(self):self.assertEqual(module.assess(self.base()),[])
 def test_unavailable_service_and_held_submission_are_reported(self):
  r=self.base();r['services']['fixture']='failed';r['accounts'][0]['journal_holds']=1;self.assertEqual(len(module.assess(r)),2)
 def test_cleared_stops_without_grant_are_reported(self):
  r=self.base();r['both_emergency_stops_active']=False;self.assertEqual(len(module.assess(r)),1)

 def test_installed_publisher_with_unavailable_metadata_alarms(self):
  r=self.base();r['publisher']={'installed':True,'metadata_fresh':False};self.assertEqual(len(module.assess(r)),1)
  r['publisher']['installed']=False;self.assertEqual(module.assess(r),[])
