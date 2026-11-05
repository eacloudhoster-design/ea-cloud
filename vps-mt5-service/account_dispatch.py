"""Private routing for independently supervised, credential-bound DEMO workers.
Reuses the existing backend observer contract; no cross-account fallback exists.
"""
import hmac,json,os,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from observer_sync import ObserverSync
from demo_worker import _credential_path,AccountCheck

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def worker_url(url):
    p=urlsplit(url)
    if p.scheme!='http' or p.hostname!='127.0.0.1' or not p.port or p.path not in ('','/') or p.query or p.fragment or p.username or p.password:
        raise ValueError('Worker must use a dedicated loopback HTTP origin')
    return url.rstrip('/')

def create_dispatch_app(bindings,token,forward=None):
    if len(token)<32:raise ValueError('Strong router credential required')
    if len(bindings)>2:raise ValueError('VPS demo capacity limited to two MT5 workers until load acceptance')
    routes={};urls=set();worker_tokens=set()
    for binding in bindings:
        if binding['mode']!='demo' or binding['role'] not in ('mentor','client') or binding['broker'] not in ('deriv','exness','justmarkets','xm','rcg'):
            raise ValueError('Only bound demo accounts are routable')
        if type(binding['login']) is not int or binding['login']<=0 or not isinstance(binding['server'],str) or not binding['server'] or binding['server']!=binding['server'].strip():
            raise ValueError('Exact positive account and server binding required')
        key=(binding['login'],binding['server']);url=worker_url(binding['url'])
        if key in routes or url in urls or len(binding['token'])<32 or binding['token']==token or binding['token'] in worker_tokens:raise ValueError('Duplicate account/endpoint/credential or invalid credential')
        routes[key]={**binding,'url':url};urls.add(url);worker_tokens.add(binding['token'])
    if not routes:raise ValueError('No provisioned account workers')
    if forward is None:
        opener=urllib.request.build_opener(NoRedirect)
        def forward(binding,path,payload=None):
            headers={'Authorization':'Bearer '+binding['token'],'Content-Type':'application/json'}
            body=json.dumps(payload).encode() if payload is not None else None
            request=urllib.request.Request(binding['url']+path,data=body,headers=headers)
            try:
                with opener.open(request,timeout=20) as response:return response.status,json.load(response)
            except urllib.error.HTTPError as e:
                # Only preserve an explicit no-submission retry assertion from
                # this pinned authenticated worker. Never relay arbitrary text.
                try:data=json.loads(e.read(8193))
                except Exception:data={}
                if e.code==503 and isinstance(data,dict) and data.get('success') is False and data.get('retriable') is True and data.get('submission_started') is False and data.get('uncertain') is not True:
                    return 503,{'success':False,'message':'Bound account unavailable before submission','retriable':True,'submission_started':False}
                return e.code,{'success':False,'message':'Account worker rejected request','retriable':False}
            except Exception:
                return 503,{'success':False,'message':'Worker response unavailable; reconcile before retry','uncertain':True,'retriable':False}
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
    @app.middleware('http')
    async def guard(request:Request,call_next):
        if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):
            return JSONResponse({'success':False,'message':'Unauthorized'},status_code=401)
        return await call_next(request)
    @app.exception_handler(RequestValidationError)
    async def invalid(request,exc):return JSONResponse({'success':False,'message':'Invalid request'},status_code=422)
    @app.get('/healthz')
    def health():return {'status':'ok','service':'isolated-demo-router','accounts':len(routes),'simulation':False,'execution_readiness_claimed':False}
    @app.get('/observer/capabilities')
    def capabilities():
        clients=[(key,binding) for key,binding in routes.items() if binding['role']=='client']
        if not clients:return JSONResponse({'success':False,'message':'No receiving workers provisioned'},status_code=503)
        for (login,server),binding in clients:
            status,data=forward(binding,'/observer/capabilities')
            if status!=200 or not isinstance(data,dict) or data.get('simulation') is not False or data.get('account_mode')!='demo' or data.get('login')!=login or data.get('server')!=server or data.get('version')!=2 or data.get('persistentJournal') is not True or data.get('absoluteTargets') is not True or data.get('execution_enabled') is not True or data.get('emergency_stop_active') is not False or type(data.get('journal_holds')) is not int or data['journal_holds']!=0:
                return JSONResponse({'success':False,'message':'Account workers not ready'},status_code=503)
        return {'version':2,'persistentJournal':True,'absoluteTargets':True,'simulation':False,'account_mode':'demo','accountIsolation':'dedicated-prefix','execution_enabled':True,'emergency_stop_active':False,'journal_holds':0,'accounts':len(clients),'registeredAccounts':len(routes)}
    @app.post('/connect-mt5')
    @app.post('/observer/account-status')
    def account_status(payload:AccountCheck):
        binding=routes.get((payload.login,payload.server))
        if binding is None:return JSONResponse({'success':False,'connected':False,'message':'Account not provisioned'},status_code=403)
        status,data=forward(binding,'/v1/account-status',{'login':payload.login,'server':payload.server,'password':payload.password.get_secret_value()})
        if status!=200 or not isinstance(data,dict) or data.get('success') is not True or data.get('connected') is not True or data.get('simulation') is not False or data.get('account_mode')!='demo' or data.get('login')!=payload.login or data.get('server')!=payload.server or data.get('broker')!=binding['broker'] or data.get('role')!=binding['role']:
            return JSONResponse({'success':False,'connected':False,'message':'Bound account verification unavailable'},status_code=503)
        valid_controls=all(type(data.get(k)) is bool for k in ('execution_enabled','emergency_stop_active')) and data.get('journal_bound') is True and all(type(data.get(k)) is int and data[k]>=0 for k in ('journal_holds','open_positions','pending_orders'))
        if not valid_controls or (data['execution_enabled'] and (data['emergency_stop_active'] or data['journal_holds']>0 or binding['role']!='client')):
            return JSONResponse({'success':False,'connected':False,'message':'Account safety snapshot is unavailable or contradictory'},status_code=503)
        allowed=('success','connected','simulation','account_mode','broker','login','server','role','currency','balance','equity','open_positions','pending_orders','execution_enabled','emergency_stop_active','journal_bound','journal_holds')
        return {key:data[key] for key in allowed if key in data}
    @app.post('/observer/sync-position')
    def sync(payload:ObserverSync):
        binding=routes.get((payload.login,payload.server))
        if binding is None or binding['role']!='client':return JSONResponse({'success':False,'message':'Client account not provisioned'},status_code=403)
        body=payload.model_dump(mode='json',exclude={'password'})
        body['password']='credential-bound-worker' # actual secret stays in worker
        status,data=forward(binding,'/observer/sync-position',body)
        if not isinstance(data,dict) or data.get('simulation') is True or (data.get('success') is True and (data.get('simulation') is not False or data.get('account_mode')!='demo')):
            return JSONResponse({'success':False,'message':'Unexpected worker execution mode','uncertain':True,'retriable':False},status_code=503)
        return JSONResponse(data,status_code=status)
    return app

def from_environment():
    config=json.loads(_credential_path('registry.json').read_text())
    bindings=[]
    for binding in config['accounts']:
        name=binding['token_credential']
        if not __import__('re').fullmatch(r'[a-zA-Z0-9_-]+',name):raise ValueError('Invalid credential selector')
        bindings.append({**binding,'token':_credential_path(name).read_text().strip()})
    return create_dispatch_app(bindings,_credential_path('router-token').read_text().strip())
