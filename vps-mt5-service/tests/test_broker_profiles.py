import sys,unittest
from pathlib import Path
from types import SimpleNamespace as N
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from broker_profiles import PROFILES,filling_policy
class ProfileTests(unittest.TestCase):
 def test_every_profile_uses_advertised_filling_never_guesses_market_return(self):
  self.assertEqual(set(PROFILES),{'deriv','exness','justmarkets','xm','rcg'})
  for profile in PROFILES:
   self.assertTrue(PROFILES[profile]['official_origin'].startswith('https://'))
   for mask,mode,want in [(1,2,0),(2,2,1),(3,2,0),(0,1,2)]:self.assertEqual(filling_policy(N(),N(filling_mode=mask,trade_exemode=mode)),want)
   for info in [None,N(filling_mode=0,trade_exemode=2),N(filling_mode=0)]:
    with self.assertRaises(ValueError):filling_policy(N(),info)
