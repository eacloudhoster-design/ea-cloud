"""Disposable HTTP/process fixture. Never imports MT5 or reads broker credentials."""
import json,os,socket,sqlite3,sys
from dataclasses import replace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'vps-mt5-service'))
from account_gateway import create_app
from account_workers import Account,BROKERS

def main():
 if os.environ.get('EA_WORKER_MODE')!='simulation':raise RuntimeError('Simulation-only fixture')
 if sys.argv[2:] not in ([],['--guarded-ipc']):raise RuntimeError('Unknown fixture transport')
 import uvicorn
 root=Path(sys.argv[1]);accounts=[Account('e2e-'+b,b,i+1,'SimulationOnly') for i,b in enumerate(BROKERS)]
 if sys.argv[2:]==['--guarded-ipc']:
  app=guarded_app(root,os.environ['EA_TEST_TOKEN'])
  sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(128)
  print(json.dumps({'port':sock.getsockname()[1]}),flush=True)
  uvicorn.Server(uvicorn.Config(app,log_level='critical',access_log=False)).run(sockets=[sock]);return
 app=create_app(accounts,root,os.environ['EA_TEST_TOKEN']);pool=app.state.workers
 @app.get('/test/state')
 def state():
  result={}
  for account in accounts:
   folder=root/account.id;entry=dict(fills=[],positions=[],mappings=[])
   if (folder/'simulated-broker.sqlite3').exists():
    with sqlite3.connect(folder/'simulated-broker.sqlite3') as db:
     db.row_factory=sqlite3.Row
     entry['fills']=[dict(r) for r in db.execute('SELECT * FROM fills')]
     entry['positions']=[dict(r) for r in db.execute('SELECT * FROM positions')]
   if (folder/'observer-journal.sqlite3').exists():
    with sqlite3.connect(folder/'observer-journal.sqlite3') as db:
     db.row_factory=sqlite3.Row
     entry['mappings']=[dict(r) for r in db.execute('SELECT * FROM order_mappings')]
   result[account.broker]=entry
  return result
 @app.post('/test/fault/{login}/{mode}')
 def fault(login:int,mode:str):
  key=(login,'SimulationOnly')
  if key not in pool.accounts or mode not in ('offline','healthy','crash'):return {'success':False}
  with pool.locks[key]:
   pool._stop(key);pool.accounts[key]=replace(pool.accounts[key],disconnected=mode=='offline',crash_after_commit=mode=='crash')
  return {'success':True}
 sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(128)
 print(json.dumps({'port':sock.getsockname()[1]}),flush=True)
 server=uvicorn.Server(uvicorn.Config(app,log_level='critical',access_log=False));server.run(sockets=[sock])


def guarded_app(root, token):
 """Test-only HTTP shape adapter to the EXISTING fenced authority subprocess.

 No new execution engine: gateway/PipeLink are reused from multiprocess acceptance.
 No public/production entry point, credentials, backend selection or hold clearing.
 """
 import hashlib,multiprocessing as mp,threading
 from contextlib import asynccontextmanager
 from fastapi import FastAPI,Request
 from fastapi.responses import JSONResponse
 sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'vps-mt5-service/tests'))
 from test_multiprocess_coordination import gateway,PipeLink
 from shared_lease_simulation import SharedAuthority,SimulatedHost,prepare_authority
 from private_ipc import Binding,SyncTarget,canonical
 from sdk_ipc_candidate import wall_ms
 profiles=[Binding(simulation=True,tenant='mentor-'+str(i),account='client-'+str(i),broker=b,login=i,server='SimulationOnly') for i,b in ((1,'justmarkets'),(2,'xm'))]
 keys=[os.urandom(32) for _ in profiles];ctx=mp.get_context('spawn');lock=threading.Lock()
 prepare_authority(root);authority=SharedAuthority(root)
 try:
  for profile,key in zip(profiles,keys):authority.register(profile,key)
 finally:authority.close()
 state={}
 def start():
  admin,child_admin=ctx.Pipe();pairs=[ctx.Pipe() for _ in profiles];state['hit']=ctx.Event()
  child=ctx.Process(target=gateway,args=(str(root),[b.model_dump() for b in profiles],keys,False,
                                       [p[0] for p in pairs],child_admin,state['hit'],''))
  child.start();state.update(child=child,admin=admin,links=[p[1] for p in pairs])
  if not admin.poll(5) or not (ready:=admin.recv()).get('ready'):raise RuntimeError('Guarded fixture startup refused')
  state['hosts']={b.login:SimulatedHost(PipeLink(pair[1],ready['service']),b,key,'application-fixture') for b,key,pair in zip(profiles,keys,pairs)}
  for pair in pairs:pair[0].close()
  child_admin.close()
 def stop():
  child=state['child']
  if child.is_alive():child.terminate()
  child.join(3)
  if child.is_alive():child.kill();child.join(2)
  if child.is_alive():raise RuntimeError('Fixture quiescence unconfirmed')
  for link in state['links']:link.close()
  state['admin'].close()
 start()
 @asynccontextmanager
 async def lifespan(app):
  yield
  stop()
 app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
 @app.middleware('http')
 async def authenticate(request:Request,call_next):
  import hmac
  if not hmac.compare_digest(request.headers.get('authorization',''), 'Bearer '+token):
   return JSONResponse({'success':False},status_code=401)
  return await call_next(request)
 @app.get('/healthz')
 def health():return {'simulation':True,'trading_enabled':False}
 @app.post('/observer/sync-position')
 async def sync(request:Request):
  raw=await request.body()
  if len(raw)>16384:return JSONResponse({'success':False},status_code=413)
  try:
   body=json.loads(raw);body.pop('password',None)  # Never forward application secrets through IPC.
   if type(body.get('login')) is not str or not body['login'].isdigit():raise ValueError()
   body['login']=int(body['login']);target=SyncTarget.model_validate(body)
   profile=next(b for b in profiles if (b.login,b.server)==(target.login,target.server))
  except Exception:return JSONResponse({'success':False,'simulation':True,'code':'UNASSIGNED_OR_INVALID'},status_code=422)
  with lock:
   host=state['hosts'][profile.login]
   # Refresh the existing controller only. Never acquire over a conflicting owner.
   grant=host.call('renew' if host.token else 'acquire')
   if not grant['success']:outcome=grant
   else:
    rid=hashlib.sha256(canonical(dict(binding=profile.digest(),body=body))).hexdigest()[:32]
    outcome=host.call('sync',body,request_id=rid)
   # Preserve uncertainty/non-retry semantics, simulation identity and full receipt.
   return JSONResponse(outcome,status_code=200)
 @app.get('/test/state')
 def snapshot():
  accounts={}
  for b in profiles:
   path=root/'accounts'/b.digest();entry=dict(fills=[],positions=[],mappings=[])
   for filename,queries in [('simulated-broker.sqlite3',[('fills','fills'),('positions','positions')]),('observer.sqlite3',[('mappings','order_mappings')])]:
    with sqlite3.connect(path/filename) as db:
     db.row_factory=sqlite3.Row
     for key,table in queries:
      if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[table]).fetchone():entry[key]=[dict(r) for r in db.execute('SELECT * FROM '+table)]
   accounts[str(b.login)]=entry
  return {'accounts':accounts,'gateway_pid':state['child'].pid,'http_pid':os.getpid()}
 @app.post('/test/fault/{login}/{mode}')
 def fault(login:int,mode:str):
  with lock:
   if mode in ('kill','restart'):
    stop()
    if mode=='restart':start()
    return {'success':True}
   profile=next((b for b in profiles if b.login==login),None)
   if profile is None or mode not in ('clear','stop','missing'):return {'success':False}
   path=root/'accounts'/profile.digest()/'mock-stop.json'
   if mode=='missing':path.unlink(missing_ok=True)
   else:
    now=wall_ms();tmp=path.with_suffix('.tmp');tmp.write_bytes(canonical(dict(simulation=True,binding=profile.digest(),stopped=mode=='stop',observed_ms=now,expires_ms=now+3000)));tmp.chmod(0o600);tmp.replace(path)
   return {'success':True}
 return app

if __name__=='__main__':main()
