"""Disposable journal and simulated broker; never connects to a trading account."""
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from observer_sync import ObserverSync, SyncJournal, synchronize

class Broker:
    ACCOUNT_MARGIN_MODE_RETAIL_HEDGING=2
    POSITION_TYPE_BUY=0
    ORDER_TYPE_BUY=0
    ORDER_TYPE_SELL=1
    TRADE_ACTION_DEAL=1
    TRADE_ACTION_SLTP=6
    ORDER_TIME_GTC=0
    def __init__(self):self.positions=[];self.sent=[];self.hedging=True;self.uncertain=False;self.partial=False;self.equity=1000
    def symbol_info(self,s):return NS(volume_step=.01,volume_min=.01,volume_max=10,point=.00001)
    def symbol_select(self,*a):return True
    def symbol_info_tick(self,s):return NS(bid=1.1,ask=1.1001)
    def account_info(self):return NS(margin_mode=2 if self.hedging else 0,equity=self.equity)
    def positions_get(self,**kw):return tuple(self.positions)
    def send(self,r,s):
        self.sent.append(r)
        if self.uncertain:return None
        if r['action']==6:
            p=next(p for p in self.positions if p.ticket==r['position']);p.sl=r['sl'];p.tp=r['tp']
        elif 'position'in r:
            p=next(p for p in self.positions if p.ticket==r['position']);p.volume=round(p.volume-r['volume'],8)
            if p.volume<=0:self.positions.remove(p)
        else:
            amount=r['volume']/2 if self.partial and len(self.sent)==1 else r['volume']
            self.positions.append(NS(ticket=100+len(self.sent),magic=r['magic'],type=r['type'],volume=amount,sl=r['sl'],tp=r['tp']))
        return NS(retcode=10010 if self.partial and len(self.sent)==1 else 10009)

class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.journal=SyncJournal(Path(self.tmp.name)/'journal.sqlite3');self.broker=Broker()
    def tearDown(self):self.tmp.cleanup()
    def sync(self,target,revision=1,**kw):
        p=ObserverSync(login=123,password='test-only',server='demo',sourceKey='a'*64,revision=revision,symbol='EURUSD',target=target,sl=kw.get('sl',0),tp=0,maxVolume=1,maxOpenTrades=kw.get('maxOpenTrades',10))
        return synchronize(self.broker,p,self.journal,lambda *a:None,self.broker.send)
    def test_retry_after_success_or_journal_reopen_does_not_duplicate(self):
        self.assertTrue(self.sync(.1)['success']);count=len(self.broker.sent)
        self.journal=SyncJournal(self.journal.path)
        self.assertTrue(self.sync(.1)['success']);self.assertEqual(len(self.broker.sent),count)
    def test_partial_close_full_close_and_reversal(self):
        self.assertTrue(self.sync(.1)['success']);self.assertTrue(self.sync(.06,2)['success'])
        self.assertAlmostEqual(self.broker.positions[0].volume,.06)
        self.assertTrue(self.sync(-.03,3)['success']);self.assertEqual(self.broker.positions[0].type,1)
        self.assertTrue(self.sync(0,4)['success']);self.assertEqual(self.broker.positions,[])
    def test_sl_update_preserves_volume(self):
        self.sync(.1);self.assertTrue(self.sync(.1,2,sl=1)['success']);self.assertEqual(self.broker.sent[-1]['action'],6)
        self.assertAlmostEqual(self.broker.positions[0].volume,.1)
    def test_uncertain_broker_result_stays_blocked_after_restart(self):
        self.broker.uncertain=True;self.assertTrue(self.sync(.1)['uncertain']);count=len(self.broker.sent)
        self.broker.uncertain=False;self.journal=SyncJournal(self.journal.path)
        self.assertTrue(self.sync(.1,2)['uncertain']);self.assertEqual(len(self.broker.sent),count)
    def test_netting_unrelated_position_is_never_touched(self):
        self.broker.hedging=False;self.broker.positions=[NS(ticket=2,magic=7,type=0,volume=.4)]
        self.assertFalse(self.sync(.1)['success']);self.assertEqual(self.broker.sent,[])
    def test_old_revision_rejected_and_volume_cap_enforced(self):
        self.sync(.1,3);count=len(self.broker.sent)
        self.assertFalse(self.sync(.2,2)['success']);self.assertFalse(self.sync(2,4)['success']);self.assertEqual(len(self.broker.sent),count)
    def test_risk_limits_block_increases_but_allow_closes(self):
        self.sync(.1);self.broker.equity=900
        self.assertFalse(self.sync(.2,2)['success'])
        self.assertTrue(self.sync(0,3)['success']);self.assertEqual(self.broker.positions,[])
    def test_client_stop_or_manual_close_is_not_reopened_by_next_snapshot(self):
        self.sync(.1);self.broker.positions=[];count=len(self.broker.sent)
        self.assertFalse(self.sync(.1,2)['success']);self.assertFalse(self.sync(.1,3)['success']);self.assertEqual(len(self.broker.sent),count)
    def test_max_open_trades_is_enforced(self):
        self.sync(.1)
        self.assertFalse(self.sync(.2,2,maxOpenTrades=1)['success'])
    def test_partial_fill_reconciles_remaining_exposure(self):
        self.broker.partial=True;self.assertTrue(self.sync(.1)['success'])
        self.assertAlmostEqual(sum(p.volume for p in self.broker.positions),.1)

if __name__=='__main__':unittest.main()

class ObserverAuthTests(unittest.TestCase):
    def test_capabilities_require_separate_strong_service_credential(self):
        import threading
        from unittest.mock import patch
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from observer_sync import register_observer_routes
        with tempfile.TemporaryDirectory() as directory:
            app=FastAPI();broker=Broker()
            register_observer_routes(app,broker,threading.Lock(),lambda *a:None,broker.send,Path(directory)/'auth.sqlite3')
            client=TestClient(app)
            with patch.dict('os.environ',{'OBSERVER_MT5_VPS_TOKEN':'short'}):
                self.assertEqual(client.get('/observer/capabilities').status_code,503)
            with patch.dict('os.environ',{'OBSERVER_MT5_VPS_TOKEN':'a'*32}):
                self.assertEqual(client.get('/observer/capabilities').status_code,401)
                response=client.get('/observer/capabilities',headers={'Authorization':'Bearer '+'a'*32})
                self.assertEqual(response.status_code,200);self.assertTrue(response.json()['persistentJournal'])
                self.assertEqual(broker.sent,[])
