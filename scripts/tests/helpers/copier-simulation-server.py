"""Disposable HTTP/process fixture. Never imports MT5 or reads broker credentials."""
import json,os,socket,sqlite3,sys
from dataclasses import replace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'vps-mt5-service'))
from account_gateway import create_app
from account_workers import Account,BROKERS

def main():
 if os.environ.get('EA_WORKER_MODE')!='simulation':raise RuntimeError('Simulation-only fixture')
 import uvicorn
 root=Path(sys.argv[1]);accounts=[Account('e2e-'+b,b,i+1,'SimulationOnly') for i,b in enumerate(BROKERS)]
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
if __name__=='__main__':main()
