"""Credential-bound status relay. No SDK import, trading route or journal creation."""
import hmac,json,math,re,os,urllib.request,urllib.error
from dataclasses import dataclass,field
from pathlib import Path
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from account_dispatch import worker_url,NoRedirect
from demo_worker import AccountCheck,_credential_path

@dataclass(frozen=True)
class Binding:
 broker:str
 login:int
 server:str
 role:str
 url:str
 password:str=field(repr=False)
 api_token:str=field(repr=False)

def create_app(bindings,token,forward=None):
 if len(token)<32 or not 1<=len(bindings)<=2:raise ValueError('Bound service credentials and capacity required')
 routes={};urls=set();tokens=set()
 for b in bindings:
  if b.broker not in ('justmarkets','exness','xm','rcg','deriv') or b.role not in ('mentor','client') or type(b.login) is not int or b.login<=0 or not isinstance(b.server,str) or not b.server or b.server.strip()!=b.server or not b.password or len(b.api_token)<32:raise ValueError('Invalid bound demo identity')
  origin=worker_url(b.url);key=(b.login,b.server)
  if key in routes or origin in urls or b.api_token in tokens or b.api_token==token:raise ValueError('Account/endpoint/credential isolation required')
  routes[key]=b;urls.add(origin);tokens.add(b.api_token)
 if forward is None:
  opener=urllib.request.build_opener(NoRedirect)
  def forward(binding):
   request=urllib.request.Request(worker_url(binding.url)+'/v1/read-only-snapshot',headers={'Authorization':'Bearer '+binding.api_token})
   with opener.open(request,timeout=17) as response:
    body=response.read(32769)
    if response.status!=200 or len(body)>32768:raise ValueError('Snapshot unavailable')
    return json.loads(body)
 app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
 @app.middleware('http')
 async def auth(request:Request,call_next):
  if not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):return JSONResponse({'success':False,'message':'Unauthorized'},status_code=401)
  return await call_next(request)
 @app.exception_handler(RequestValidationError)
 async def invalid(request,exc):return JSONResponse({'success':False,'message':'Invalid account request'},status_code=422)
 @app.get('/healthz')
 def health():return {'status':'ok','read_only':True,'execution_enabled':False,'accounts':len(routes)}
 @app.get('/observer/capabilities')
 def capabilities():return JSONResponse({'success':False,'read_only':True,'execution_enabled':False,'persistentJournal':False,'absoluteTargets':False,'message':'Status-only relay; financial routes unavailable'},status_code=503)
 @app.post('/observer/account-status')
 @app.post('/connect-mt5')
 def status(payload:AccountCheck):
  b=routes.get((payload.login,payload.server))
  if b is None or not hmac.compare_digest(payload.password.get_secret_value().encode(),b.password.encode()):return JSONResponse({'success':False,'message':'Bound account credentials not verified'},status_code=403)
  try:
   data=forward(b);a=data.get('account',{})
   if not all(data.get(k) is True for k in ('success','read_only','initialized','identity_verified','portable_paths_verified','connected','positions_read_verified','orders_read_verified')):raise ValueError('Incomplete identity evidence')
   if data.get('automated_trading_enabled') is not False or data.get('execution_enabled') is not False or type(data.get('financial_trades')) is not int or data['financial_trades']!=0:raise ValueError('Unsafe upstream mode')
   if a.get('login')!=b.login or a.get('server')!=b.server or a.get('mode')!='demo':raise ValueError('Identity mismatch')
   if any(type(data.get(k)) is not int or data[k]<0 for k in ('open_positions','pending_orders')):raise ValueError('Incomplete exposure evidence')
   cash=lambda value:value if type(value) in (int,float) and math.isfinite(value) else None
   return {'success':True,'connected':True,'simulation':False,'account_mode':'demo','read_only':True,'protocol':'EA_READ_ONLY_STATUS_V1','financial_routes':False,'broker':b.broker,'login':b.login,'server':b.server,'role':b.role,'currency':a.get('currency'),'balance':cash(a.get('balance')),'equity':cash(a.get('equity')),'open_positions':data['open_positions'],'pending_orders':data['pending_orders'],'execution_enabled':False,'emergency_stop_active':None,'journal_bound':False,'journal_holds':None}
  except Exception:return JSONResponse({'success':False,'connected':False,'message':'Read-only account verification unavailable'},status_code=503)
 return app

def from_environment():
 config=json.loads(_credential_path('readonly-registry.json').read_text());bindings=[]
 for row in config['accounts']:
  for key in ['password_credential','api_credential']:
   if not re.fullmatch(r'[A-Za-z0-9_-]+',row[key]):raise ValueError('Invalid credential selector')
  bindings.append(Binding(**{k:row[k] for k in ['broker','login','server','role','url']},password=_credential_path(row['password_credential']).read_text().rstrip('\r\n'),api_token=_credential_path(row['api_credential']).read_text().strip()))
 return create_app(bindings,_credential_path('relay-token').read_text().strip())
