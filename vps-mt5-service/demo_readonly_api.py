"""Private account-scoped read-only SDK adapter. No execution route exists."""
import hmac,json,sys,threading
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from demo_readonly_probe import probe

def create_app(mt5,config,password,token):
    if len(token)<32 or not password or config.get('account_mode')!='demo':raise ValueError('Secure demo binding required')
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None);lock=threading.Lock()
    @app.middleware('http')
    async def auth(request:Request,call_next):
        if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):
            return JSONResponse({'success':False,'message':'Unauthorized'},status_code=401)
        return await call_next(request)
    @app.get('/healthz')
    @app.get('/v1/read-only-snapshot')
    def snapshot():
        with lock:result=probe(mt5,config,password)
        ok=bool(result.get('identity_verified') and result.get('portable_paths_verified') and result.get('connected') and result.get('market_data_verified') and result.get('automated_trading_enabled') is False)
        return JSONResponse({**result,'success':ok,'execution_enabled':False},status_code=200 if ok else 503)
    @app.get('/observer/capabilities')
    def capabilities():
        return JSONResponse({'success':False,'version':2,'read_only':True,'execution_enabled':False,'persistentJournal':False,'absoluteTargets':False,'message':'Read-only account adapter; execution unavailable'},status_code=503)
    return app

def main():
    import MetaTrader5 as mt5
    import uvicorn
    binding=json.loads(sys.stdin.read())
    app=create_app(mt5,binding['config'],binding['password'],binding['token'])
    uvicorn.run(app,host='127.0.0.1',port=int(binding['port']),access_log=False,log_level='warning',server_header=False)
if __name__=='__main__':main()
