"""Private simulation gateway using the existing observer HTTP contract.
NEVER bind this to the production backend as a broker execution endpoint.
"""
import hmac,json,os,time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI,Request,Header
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from observer_sync import ObserverSync
from account_workers import Account,AccountWorkers

def create_app(accounts,root,token):
    if len(token)<32:raise ValueError('Strong service token required')
    workers=AccountWorkers(accounts,root)
    @asynccontextmanager
    async def lifespan(app):
        yield
        workers.close()
    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    app.state.workers=workers
    @app.middleware('http')
    async def auth(request:Request,call_next):
        if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):
            return JSONResponse({'success':False,'message':'Unauthorized'},status_code=401)
        if request.headers.get('content-length','0').isdigit() and int(request.headers.get('content-length','0'))>16384:
            return JSONResponse({'success':False,'message':'Request too large'},status_code=413)
        return await call_next(request)
    @app.exception_handler(RequestValidationError)
    async def invalid(request,exc):return JSONResponse({'success':False,'message':'Invalid request'},status_code=422)
    @app.get('/observer/capabilities')
    def capabilities():
        return {'version':2,'persistentJournal':True,'absoluteTargets':True,'simulation':True,'accountIsolation':'process','accounts':len(accounts)}
    @app.post('/observer/sync-position')
    def sync(payload:ObserverSync):
        start=time.monotonic_ns();result=workers.dispatch(payload)
        result['gateway_ms']=(time.monotonic_ns()-start)/1e6
        return JSONResponse(result,status_code=503 if result.get('retriable') is True else 200)
    @app.get('/healthz')
    def health():return {'status':'ok','simulation':True,'trading_enabled':False}
    return app

def from_environment():
    if os.environ.get('EA_WORKER_MODE')!='simulation':
        raise RuntimeError('This gateway is exclusively for simulation')
    manifest=json.loads(Path(os.environ['EA_ACCOUNTS_FILE']).read_text())
    accounts=[Account(**a) for a in manifest['accounts']]
    return create_app(accounts,os.environ['EA_WORKER_STATE'],os.environ['EA_SIMULATION_TOKEN'])
