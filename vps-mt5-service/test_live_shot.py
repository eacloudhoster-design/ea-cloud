"""All prices are isolated test fixtures; never connect to a live terminal."""
from test_scanner_api import ScannerBridgeTests
from scanner_api import ScannerCandlesRequest, ScannerActivityRequest
from types import SimpleNamespace as N
from fastapi import HTTPException
class LiveShotBridgeTests(ScannerBridgeTests):
    def test_symbols_preserve_broker_suffixes_and_hide_credentials(self):
        self.mt5.symbols_get=lambda:[N(name='XAUUSD.a'),N(name='EURUSD.raw')]
        result=self.endpoints['/scanner/symbols'](ScannerActivityRequest(login=7,password='fixture',server='Fixture'),self.auth['x-scanner-token'])
        self.assertEqual(result['symbols'],['EURUSD.raw','XAUUSD.a']);self.assertNotIn('password',str(result));self.assertEqual(self.calls,[])
    def test_candles_are_actual_bridge_rates_not_generated_or_executed(self):
        self.mt5.TIMEFRAME_M15=15
        self.mt5.symbol_select=lambda *_:self.fail("Live Shot must not modify Market Watch")
        rows=[dict(time=1700000000+i*900,open=100.,high=102.,low=99.,close=101.) for i in range(40)]
        self.mt5.copy_rates_from_pos=lambda symbol,tf,start,count:rows
        request=ScannerCandlesRequest(**self.payload,timeframe='M15')
        result=self.endpoints['/scanner/candles'](request,self.auth['x-scanner-token'])
        self.assertEqual(result['candles'],rows);self.assertEqual(result['marketStatus'],'unknown');self.assertEqual(self.calls,[])
        with self.assertRaises(HTTPException):self.endpoints['/scanner/candles'](request,'bad-token')
    def test_missing_candles_fail_instead_of_simulating(self):
        self.mt5.TIMEFRAME_M15=15;self.mt5.copy_rates_from_pos=lambda *args:None
        with self.assertRaises(HTTPException) as error:self.endpoints['/scanner/candles'](ScannerCandlesRequest(**self.payload,timeframe='M15'),self.auth['x-scanner-token'])
        self.assertEqual(error.exception.status_code,503)

    def test_busy_terminal_rejects_market_read_without_queuing(self):
        import threading
        from fastapi import FastAPI
        from scanner_api import register_scanner_routes
        app=FastAPI();lock=threading.Lock();register_scanner_routes(app,self.mt5,lock)
        endpoint=next(r.endpoint for r in app.routes if r.path=='/scanner/symbols')
        with lock:
            with self.assertRaises(HTTPException) as error:
                endpoint(ScannerActivityRequest(login=7,password='fixture',server='Fixture'),self.auth['x-scanner-token'])
        self.assertEqual(error.exception.status_code,503)
