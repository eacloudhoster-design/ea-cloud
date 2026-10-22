import os, unittest, threading
from types import SimpleNamespace as N
from unittest.mock import patch
from fastapi import FastAPI
from fastapi import HTTPException
from scanner_api import register_scanner_routes, ScannerQuoteRequest, ScannerCheckRequest
class ScannerBridgeTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        self.mt5=N(initialize=lambda:True,login=lambda **kw:True,account_info=lambda:N(login=7,server='Fixture',trade_allowed=True,trade_expert=True),symbol_select=lambda *a:True,
          symbol_info=lambda s:N(digits=2,point=.01,trade_tick_size=.01,trade_stops_level=5,volume_min=.01,volume_max=10,volume_step=.01,volume_limit=20,order_mode=3,trade_mode=4),
          symbol_info_tick=lambda s:N(bid=100,ask=100.02,time_msc=100000),terminal_info=lambda:N(connected=True,trade_allowed=True),positions_get=lambda **k:[],orders_get=lambda **k:[],shutdown=lambda:None,
          order_check=lambda request:self.calls.append(request) or N(retcode=0),order_send=lambda *_:self.fail('read-only scanner must never send orders'),
          TRADE_ACTION_PENDING=5,TRADE_ACTION_DEAL=1,ORDER_TYPE_BUY_LIMIT=2,ORDER_TYPE_SELL_LIMIT=3,ORDER_TYPE_BUY=0,ORDER_TYPE_SELL=1,ORDER_TIME_GTC=0,ORDER_FILLING_RETURN=2,ORDER_FILLING_FOK=0)
        app=FastAPI();register_scanner_routes(app,self.mt5,threading.Lock());self.endpoints={route.path:route.endpoint for route in app.routes if route.path.startswith("/scanner/")}
        self.payload=dict(login=7,password='isolated-password',server='Fixture',symbol='XAUUSD')
        self.auth={'x-scanner-token':'isolated-scanner-token-32-characters'}
        self.env=patch.dict(os.environ,{'SCANNER_MT5_VPS_TOKEN':self.auth['x-scanner-token']});self.env.start()
    def tearDown(self):self.env.stop()
    def call(self,path,payload,authenticated=True):
        cls=ScannerCheckRequest if path.endswith('check-order') else ScannerQuoteRequest
        try:return 200,self.endpoints[path](cls(**payload),self.auth['x-scanner-token'] if authenticated else '')
        except HTTPException as error:return error.status_code,{}
    def test_quote_and_session_are_honest(self):
        self.assertEqual(self.call('/scanner/quote',self.payload,False)[0],401)
        status,r=self.call('/scanner/quote',self.payload);self.assertEqual(status,200)
        self.assertEqual(r['quote']['bid'],100);self.assertIsNone(r['quote']['marketOpen'])
        self.assertNotIn('password',str(r))
    def test_pending_side_and_broker_validation_without_order_send(self):
        p=dict(self.payload,direction='BUY',orderType='BUY LIMIT',entry=98,stopLoss=97,takeProfit=101,volume=.05)
        status,r=self.call('/scanner/check-order',p);self.assertTrue(r['brokerChecked']);self.assertEqual(self.calls[0]['type'],2)
        p['entry']=102;self.assertEqual(self.call('/scanner/check-order',p)[0],422);self.assertEqual(len(self.calls),1)
    def test_identity_mismatch_and_market_closed_reject(self):
        self.mt5.account_info=lambda:N(login=8,server='Fixture');self.assertEqual(self.call('/scanner/quote',self.payload)[0],503)
        self.mt5.account_info=lambda:N(login=7,server='Fixture',trade_allowed=True,trade_expert=True);self.mt5.order_check=lambda r:N(retcode=10018)
        p=dict(self.payload,direction='SELL',orderType='MARKET',entry=100,stopLoss=101,takeProfit=97,volume=.05)
        _,r=self.call('/scanner/check-order',p);self.assertFalse(r['brokerChecked']);self.assertFalse(r['quote']['marketOpen'])

    def test_real_snapshot_identity_currency_and_exact_symbol(self):
        self.mt5.account_info=lambda:N(login=7,server='Fixture',trade_allowed=True,trade_expert=True,balance=1200,equity=1235.5,profit=35.5,currency='ZAR')
        original=self.mt5.symbol_info
        self.mt5.symbol_info=lambda symbol:None if symbol=='GOLD' else original(symbol)
        from scanner_api import ScannerActivityRequest
        payload=ScannerActivityRequest(**self.payload,symbols=['XAUUSDm','GOLD'])
        endpoint=self.endpoints['/scanner/activity-snapshot']
        with self.assertRaises(HTTPException):endpoint(payload,'wrong')
        result=endpoint(payload,self.auth['x-scanner-token'])
        self.assertEqual(result['account']['currency'],'ZAR')
        self.assertEqual(result['account']['equity'],1235.5)
        self.assertEqual(result['symbols'],[dict(symbol='XAUUSDm',available=True),dict(symbol='GOLD',available=False)])
        self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
