"""One MT5 DEMO account per Wine prefix/process. No live trading mode exists."""
import hmac,json,os,sys,threading,ntpath,stat
from contextlib import asynccontextmanager
from worker_state import StateLease,bind_identity
from pathlib import Path
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel,Field,SecretStr
from typing import Literal
from observer_sync import ObserverSync,SyncJournal,synchronize,ConnectionFailure
from broker_profiles import filling_policy

class DemoAccount(BaseModel):
    broker:Literal['deriv','exness','justmarkets','xm','rcg']
    login:int=Field(gt=0)
    server:str=Field(min_length=1)
    terminal_path:str=Field(min_length=1)
    journal_path:str=Field(min_length=1)
    enabled:bool=False
    account_mode:Literal['demo']='demo'
    role:Literal['mentor','client']='client'
    execution_approved:bool=False

class AccountCheck(BaseModel):
    login:int=Field(gt=0)
    server:str=Field(min_length=1,max_length=256)
    password:SecretStr=Field(min_length=1,max_length=1024)

def emergency_stop_active():
    root=Path(r'Z:\etc\ea-cloud\acceptance') if sys.platform=='win32' else Path('/etc/ea-cloud/acceptance')
    try:
        before=root.lstat()
        # Absence of a latch is evidence only inside a verified directory.
        # lstat rejects a redirected directory; listing also sees dangling latches.
        if not stat.S_ISDIR(before.st_mode):return True
        if sys.platform!='win32' and (before.st_uid!=0 or before.st_mode&0o022):return True
        names={entry.name for entry in root.iterdir()}
        if names.intersection(('XAUUSD.STOP','XAUUSD.CLEANUP_STOP')):return True
        after=root.lstat()
        # A disappeared/replaced directory or changed protection is not a clear state.
        identity=lambda meta:(meta.st_dev,meta.st_ino,meta.st_mode,meta.st_uid)
        return identity(before)!=identity(after)
    except (FileNotFoundError,NotADirectoryError):
        # Even a recently clear mirror must not override a known missing directory.
        return True
    except OSError:
        # The private directory may be unreadable to Wine. Retain the existing
        # root-published, fixed-path, freshness-checked fallback in that case.
        from execution_gates import mirrored_stop_active,MIRROR
        path=Path('Z:'+str(MIRROR).replace('/','\\')) if sys.platform=='win32' else MIRROR
        try:return mirrored_stop_active(path) is not False
        except (OSError,ValueError,TypeError):return True

def create_demo_app(config,mt5,password,token,stop_checker=None):
    if len(token)<32 or not password:raise ValueError('Secure account credentials required')
    stop_checker=stop_checker or emergency_stop_active
    lock=threading.Lock();journal=SyncJournal(config.journal_path)
    lease=StateLease(config.journal_path)
    identity={field:getattr(config,field) for field in ('broker','login','server','role','account_mode')}
    identity.update(terminal_path=ntpath.normcase(ntpath.normpath(config.terminal_path)))
    def bound():bind_identity(journal,identity)
    @asynccontextmanager
    async def lifespan(app):
        lease.acquire()
        try:
            bound();yield
        finally:
            getattr(mt5,'shutdown',lambda:None)();lease.close()
    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    @app.middleware('http')
    async def guard(request:Request,call_next):
        if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):
            return JSONResponse({'success':False,'message':'Unauthorized'},status_code=401)
        if not config.enabled and request.url.path!='/v1/account-status':return JSONResponse({'success':False,'message':'Account worker disabled'},status_code=503)
        if request.url.path.startswith('/observer/') and (not config.execution_approved or config.role!='client'):
            return JSONResponse({'success':False,'message':'Execution not approved for this account','retriable':False},status_code=503)
        if request.url.path.startswith('/observer/') and stop_checker():
            return JSONResponse({'success':False,'message':'Emergency stop active','retriable':False,'submission_started':False},status_code=503)
        return await call_next(request)
    @app.exception_handler(RequestValidationError)
    async def validation(request,exc):return JSONResponse({'success':False,'message':'Invalid request'},status_code=422)
    def connected():
        if not mt5.initialize(config.terminal_path,login=config.login,password=password,server=config.server,portable=True,timeout=15000):
            return 'MT5 initialization failed'
        info=mt5.account_info();terminal=mt5.terminal_info()
        if not info or info.login!=config.login or info.server!=config.server:
            return 'Account identity mismatch'
        if getattr(info,'trade_mode',None)!=getattr(mt5,'ACCOUNT_TRADE_MODE_DEMO',0):
            return 'Only verified DEMO accounts are permitted'
        if not terminal or not terminal.connected:return 'Broker disconnected'
        expected=ntpath.normcase(ntpath.normpath(ntpath.dirname(config.terminal_path)))
        if any(ntpath.normcase(ntpath.normpath(getattr(terminal,field,'')))!=expected for field in ('path','data_path')):
            return 'Portable terminal directory mismatch'
        return None
    @app.get('/healthz')
    def health():
        with lock:
            try:
                error=connected()
                return JSONResponse({'success':error is None,'account_mode':'demo','message':error or 'Verified demo connection'},status_code=503 if error else 200)
            finally:getattr(mt5,'shutdown',lambda:None)()
    @app.post('/v1/account-status')
    def account_status(payload:AccountCheck):
        # Browser authentication is not proof of broker-account ownership.
        if payload.login!=config.login or payload.server!=config.server or not hmac.compare_digest(payload.password.get_secret_value().encode(),password.encode()):
            return JSONResponse({'success':False,'connected':False,'message':'Account credentials do not match provisioned binding'},status_code=403)
        with lock:
            try:
                error=connected()
                if error:return JSONResponse({'success':False,'connected':False,'message':'Bound account unavailable'},status_code=503)
                bound();a=mt5.account_info();t=mt5.terminal_info();positions=mt5.positions_get();orders=mt5.orders_get()
                db=journal.open()
                try:holds=db.execute("SELECT count(*) FROM allocations WHERE phase IN ('dispatching','reconciled_hold','external_reduction')").fetchone()[0]
                finally:db.close()
                if a is None or t is None or positions is None or orders is None:raise ValueError('Account snapshot unavailable')
                if a.login!=config.login or a.server!=config.server or a.trade_mode!=getattr(mt5,'ACCOUNT_TRADE_MODE_DEMO',0):raise ValueError('Account changed')
                expected=ntpath.normcase(ntpath.normpath(ntpath.dirname(config.terminal_path)))
                if not t.connected or any(ntpath.normcase(ntpath.normpath(getattr(t,k,'')))!=expected for k in ('path','data_path')):raise ValueError('Terminal changed')
                stopped=bool(stop_checker())
                return {'success':True,'connected':True,'simulation':False,'account_mode':'demo','broker':config.broker,'login':config.login,'server':config.server,'role':config.role,'currency':getattr(a,'currency',None),'balance':getattr(a,'balance',None),'equity':getattr(a,'equity',None),'open_positions':len(positions),'pending_orders':len(orders),'execution_enabled':bool(config.enabled and config.execution_approved and config.role=='client' and not stopped and holds==0 and getattr(t,'trade_allowed',False) and getattr(a,'trade_allowed',False) and getattr(a,'trade_expert',False) and not getattr(t,'tradeapi_disabled',True)),'emergency_stop_active':stopped,'journal_bound':True,'journal_holds':holds}
            except Exception:
                return JSONResponse({'success':False,'connected':False,'message':'Account status unavailable; execution unchanged'},status_code=503)
            finally:getattr(mt5,'shutdown',lambda:None)()
    @app.get('/observer/capabilities')
    def capabilities():
        with lock:
            try:
                error=connected()
                if error:return JSONResponse({'success':False,'message':error},status_code=503)
                try:bound()
                except ValueError:return JSONResponse({'success':False,'message':'Unverified account journal binding'},status_code=503)
                db=journal.open()
                try:holds=db.execute("SELECT count(*) FROM allocations WHERE phase IN ('dispatching','reconciled_hold','external_reduction')").fetchone()[0]
                finally:db.close()
                a=mt5.account_info();t=mt5.terminal_info()
                expected=ntpath.normcase(ntpath.normpath(ntpath.dirname(config.terminal_path)))
                permitted=bool(a and t and a.login==config.login and a.server==config.server and getattr(a,'trade_mode',None)==getattr(mt5,'ACCOUNT_TRADE_MODE_DEMO',0) and t.connected and all(ntpath.normcase(ntpath.normpath(getattr(t,k,'')))==expected for k in ('path','data_path')) and getattr(a,'trade_allowed',False) and getattr(a,'trade_expert',False) and getattr(t,'trade_allowed',False) and not getattr(t,'tradeapi_disabled',True) and holds==0 and not stop_checker())
                if not permitted:return JSONResponse({'success':False,'message':'Account safety gates or unresolved holds block execution','execution_enabled':False},status_code=503)
                return {'execution_enabled':True,'emergency_stop_active':False,'journal_holds':0,'version':2,'persistentJournal':True,'absoluteTargets':True,'simulation':False,'account_mode':'demo','accountIsolation':'dedicated-prefix','login':config.login,'server':config.server}
            finally:getattr(mt5,'shutdown',lambda:None)()
    @app.get('/v1/reconciliation/{mapping_id}')
    def reconciliation_preview(mapping_id:int):
        from history_reconcile import reconcile
        with lock:
            try:
                error=connected()
                if error:return JSONResponse({'success':False,'message':'History connection unavailable'},status_code=503)
                return reconcile(mt5,journal,config.model_dump(),mapping_id,record=False)
            except Exception:
                return JSONResponse({'success':False,'message':'History assessment unavailable; no state or orders changed'},status_code=409)
            finally:getattr(mt5,'shutdown',lambda:None)()
    @app.post('/observer/sync-position')
    def sync(payload:ObserverSync):
        if payload.login!=config.login or payload.server!=config.server:
            return JSONResponse({'success':False,'message':'Account identity mismatch'},status_code=403)
        with lock:
            try:bound()
            except ValueError:return JSONResponse({'success':False,'message':'Unverified account journal binding','retriable':False},status_code=503)
            def connect(login,unused_password,server):
                if login!=config.login or server!=config.server:return ConnectionFailure('Identity mismatch',False)
                error=connected()
                return ConnectionFailure(error,error in ('MT5 initialization failed','Broker disconnected')) if error else None
            def send(request,symbol):
                # Recheck immediately before EVERY submission, including closes.
                if stop_checker():return None
                account=mt5.account_info();terminal=mt5.terminal_info()
                if not account or account.login!=config.login or account.server!=config.server or getattr(account,'trade_mode',None)!=getattr(mt5,'ACCOUNT_TRADE_MODE_DEMO',0):
                    return None
                expected=ntpath.normcase(ntpath.normpath(ntpath.dirname(config.terminal_path)))
                if not terminal or any(ntpath.normcase(ntpath.normpath(getattr(terminal,field,'')))!=expected for field in ('path','data_path')):return None
                if not terminal.connected or not terminal.trade_allowed or not getattr(account,'trade_allowed',False):return None
                # Use the broker-advertised filling mode. Do not resubmit an
                # ambiguous request. 10030 is a definitive rejection, not a fill.
                info=mt5.symbol_info(symbol)
                if request['action']==mt5.TRADE_ACTION_DEAL:
                    try:request['type_filling']=filling_policy(mt5,info)
                    except ValueError:return None
                return mt5.order_send(request)
            try:result=synchronize(mt5,payload,journal,connect,send)
            finally:getattr(mt5,'shutdown',lambda:None)()
            result.update(simulation=False,account_mode='demo')
            return JSONResponse(result,status_code=503 if result.get('retriable') is True else 200)
    return app

def _credential_path(name):
    root=os.environ['CREDENTIALS_DIRECTORY']
    if sys.platform=='win32' and root.startswith('/'):root='Z:'+root.replace('/','\\')
    return Path(root)/name

def from_environment():
    if sys.platform!='win32':raise RuntimeError('Demo worker requires Windows Python in its dedicated Wine prefix')
    import MetaTrader5 as mt5
    config=DemoAccount(**json.loads(_credential_path('account.json').read_text()))
    return create_demo_app(config,mt5,_credential_path('broker-password').read_text().rstrip('\r\n'),_credential_path('api-token').read_text().strip())


def from_private_binding(binding):
    if sys.platform!='win32':raise RuntimeError('Account worker requires its isolated Windows runtime')
    import MetaTrader5 as mt5
    return create_demo_app(DemoAccount(**binding['config']),mt5,binding['password'],binding['token'])

def main():
    import uvicorn
    binding=json.loads(sys.stdin.read())
    app=from_private_binding(binding)
    uvicorn.run(app,host='127.0.0.1',port=int(binding['port']),access_log=False,log_level='warning',server_header=False)

if __name__=='__main__':main()
