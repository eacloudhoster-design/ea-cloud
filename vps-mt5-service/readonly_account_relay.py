"""Credential-bound status relay. No SDK import, trading route or journal creation."""
import hmac,json,math,re,os,logging,urllib.request,urllib.error
from dataclasses import dataclass,field
from pathlib import Path
from http_guard import PrivateHttpGuard
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from account_dispatch import worker_url,NoRedirect
from demo_worker import AccountCheck,_credential_path

class PrivateStatusError(ValueError):
 def __init__(self,code):super().__init__(code);self.code=code

@dataclass(frozen=True)
class Binding:
 broker:str
 login:int
 server:str
 role:str
 url:str
 password:str=field(repr=False)
 api_token:str=field(repr=False)
 account_mode:str="demo"
 owner_kind:str|None=None
 owner_id:int|None=None

def project_snapshot(b,data):
 a=data.get('account',{})
 if not all(data.get(k) is True for k in ('success','read_only','initialized','identity_verified','portable_paths_verified','connected','positions_read_verified','orders_read_verified')):raise ValueError('Incomplete identity evidence')
 if data.get('automated_trading_enabled') is not False or data.get('execution_enabled') is not False or type(data.get('financial_trades')) is not int or data['financial_trades']!=0:raise ValueError('Unsafe upstream mode')
 if a.get('login')!=b.login or a.get('server')!=b.server or a.get('mode')!=b.account_mode:raise ValueError('Identity mismatch')
 if any(type(data.get(k)) is not int or data[k]<0 for k in ('open_positions','pending_orders')):raise ValueError('Incomplete exposure evidence')
 cash=lambda value:value if type(value) in (int,float) and math.isfinite(value) else None
 return {**({'owner_kind':b.owner_kind,'owner_id':b.owner_id} if b.owner_kind is not None else {}),'success':True,'connected':True,'simulation':False,'account_mode':b.account_mode,'read_only':True,'protocol':'EA_READ_ONLY_STATUS_V1','financial_routes':False,'broker':b.broker,'login':b.login,'server':b.server,'role':b.role,'currency':a.get('currency'),'balance':cash(a.get('balance')),'equity':cash(a.get('equity')),'open_positions':data['open_positions'],'pending_orders':data['pending_orders'],'execution_enabled':False,'emergency_stop_active':None,'journal_bound':False,'journal_holds':None}

def fetch_snapshot(binding):
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
 request=urllib.request.Request(worker_url(binding.url)+'/v1/read-only-snapshot',headers={'Authorization':'Bearer '+binding.api_token})
 with opener.open(request,timeout=17) as response:
  body=response.read(32769)
  if response.status!=200 or len(body)>32768:raise ValueError('Snapshot unavailable')
  return json.loads(body)

def create_app(bindings,token,forward=None,resolve_dynamic=None,forward_dynamic=None,provisioning_proxy=None):
 if len(token)<32 or not bindings:raise ValueError('Bound service credentials and capacity required')
 routes={};urls=set();tokens=set()
 for b in bindings:
  if (b.owner_kind is None)!=(b.owner_id is None) or (b.owner_kind is not None and (b.owner_kind not in ('mentor','client') or type(b.owner_id) is not int or b.owner_id<=0)):raise ValueError('Invalid tenant binding')
  if b.account_mode not in ('demo','live') or b.broker not in ('justmarkets','exness','xm','rcg','deriv') or b.role not in ('mentor','client') or type(b.login) is not int or b.login<=0 or not isinstance(b.server,str) or not b.server or b.server.strip()!=b.server or not b.password or len(b.api_token)<32:raise ValueError('Invalid bound demo identity')
  origin=worker_url(b.url);key=(b.login,b.server)
  if key in routes or origin in urls or b.api_token in tokens or b.api_token==token:raise ValueError('Account/endpoint/credential isolation required')
  routes[key]=b;urls.add(origin);tokens.add(b.api_token)
 if forward is None:forward=fetch_snapshot
 app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
 @app.middleware('http')
 async def auth(request:Request,call_next):
  if provisioning_proxy is not None and provisioning_proxy.supports(request.method,request.url.path):return await provisioning_proxy(request)
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
  if forward_dynamic is not None:
   try:
    dynamic=forward_dynamic({'login':payload.login,'server':payload.server,'password':payload.password.get_secret_value()})
    if dynamic.get('code')!='NO_DYNAMIC_BINDING':
     data=dynamic
     if data.get('success') is not True or data.get('connected') is not True or data.get('simulation') is not False or data.get('financial_routes') is not False or data.get('login')!=payload.login or data.get('server')!=payload.server or data.get('owner_kind') not in ('mentor','client') or data.get('role')!=data['owner_kind'] or type(data.get('owner_id')) is not int or data['owner_id']<=0 or data.get('account_mode') not in ('demo','live'):raise ValueError('Invalid owner status')
     if data.get('read_only') is True:
      if data.get('protocol')!='EA_READ_ONLY_STATUS_V1' or data.get('execution_enabled') is not False or data.get('journal_bound') is not False:raise ValueError('Invalid read-only status')
     elif data.get('read_only') is False:
      if data.get('protocol')!='EA_BOUND_ACCOUNT_STATUS_V1' or data.get('journal_bound') is not True or type(data.get('journal_holds')) is not int or data['journal_holds']<0 or type(data.get('emergency_stop_active')) is not bool or type(data.get('execution_enabled')) is not bool:raise ValueError('Invalid engine status')
      if data['execution_enabled'] and (data['journal_holds'] or data['emergency_stop_active'] or data['role']!='client'):raise ValueError('Contradictory engine status')
     else:raise ValueError('Invalid status mode')
     fields=('owner_kind','owner_id','success','connected','simulation','account_mode','read_only','protocol','financial_routes','broker','login','server','role','currency','balance','equity','open_positions','pending_orders','execution_enabled','emergency_stop_active','journal_bound','journal_holds')
     return {key:data[key] for key in fields}
   except PrivateStatusError as error:return JSONResponse({'success':False,'connected':False,'code':error.code},status_code=403)
   except Exception:return JSONResponse({'success':False,'connected':False,'code':'MT5_SESSION_UNAVAILABLE','message':'Authoritative account controller unavailable'},status_code=503)
  if b is None and resolve_dynamic is not None:
   try:
    candidate=resolve_dynamic(payload.login,payload.server)
    if candidate is not None:
     create_app([candidate],token,forward=forward)
     if worker_url(candidate.url) in urls or candidate.api_token in tokens:raise ValueError('Endpoint collision')
     b=candidate
   except Exception:return JSONResponse({'success':False,'connected':False,'message':'Dynamic binding unavailable'},status_code=503)
  if b is None:return JSONResponse({'success':False,'code':'ACCOUNT_NOT_ASSIGNED','message':'Account not provisioned'},status_code=403)
  if not hmac.compare_digest(payload.password.get_secret_value().encode(),b.password.encode()):return JSONResponse({'success':False,'code':'ACCOUNT_PROOF_REJECTED','message':'Bound account credentials not verified'},status_code=403)
  try:
   return project_snapshot(b,forward(b))
  except Exception as error:
   logging.getLogger('ea.readonly').warning('Read-only snapshot unavailable: type=%s http=%s',type(error).__name__,getattr(error,'code',None) if isinstance(error,urllib.error.HTTPError) else None)
   return JSONResponse({'success':False,'connected':False,'code':'MT5_SESSION_UNAVAILABLE','message':'Read-only account verification unavailable'},status_code=503)
 app.add_middleware(PrivateHttpGuard)
 return app

def from_environment():
 config=json.loads(_credential_path('readonly-registry.json').read_text());bindings=[];provisioning_proxy=None
 if config.get('self_service_provisioning_proxy') is True:
  from provisioning_proxy import ProvisioningProxy
  provisioning_proxy=ProvisioningProxy(_credential_path('provisioner-token-digest').read_text().strip())
 for row in config['accounts']:
  for key in ['password_credential','api_credential']:
   if not re.fullmatch(r'[A-Za-z0-9_-]+',row[key]):raise ValueError('Invalid credential selector')
  bindings.append(Binding(account_mode=row.get('account_mode','demo'),**{k:row[k] for k in ['broker','login','server','role','url']},password=_credential_path(row['password_credential']).read_text().rstrip('\r\n'),api_token=_credential_path(row['api_credential']).read_text().strip()))
 if config.get('self_service_status_proxy') is True:
  # Separate status-only credential; nonroot relay cannot provision or decrypt.
  status_token=_credential_path('provisioner-status-token').read_text().strip()
  if not re.fullmatch(r'[\x21-\x7e]{32,2048}',status_token):raise ValueError('Private status credential required')
  def proxy(payload):
   request=urllib.request.Request('http://127.0.0.1:10040/v1/account-status',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+status_token,'Content-Type':'application/json'})
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
   try:response=opener.open(request,timeout=19)
   except urllib.error.HTTPError as error:
    try:failure=json.loads(error.read(4096))
    except Exception:failure={}
    if failure.get('code') in ('ACCOUNT_NOT_ASSIGNED','ACCOUNT_PROOF_REJECTED'):raise PrivateStatusError(failure['code']) from None
    raise ValueError('Private status unavailable') from None
   with response:
    raw=response.read(32769)
    if response.status!=200 or len(raw)>32768:raise ValueError('Private status unavailable')
    return json.loads(raw)
  return create_app(bindings,_credential_path('relay-token').read_text().strip(),forward_dynamic=proxy,provisioning_proxy=provisioning_proxy)
 if config.get('self_service_registry') is True:
  from dynamic_readonly_registry import load
  return create_app(bindings,_credential_path('relay-token').read_text().strip(),resolve_dynamic=load,provisioning_proxy=provisioning_proxy)
 return create_app(bindings,_credential_path('relay-token').read_text().strip(),provisioning_proxy=provisioning_proxy)
