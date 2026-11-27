#!/opt/ea-cloud/infra/linux/.venv/bin/python
"""Fixed read-only root port for the nonroot relay. Never exports credentials."""
import hmac,json,os,sys,urllib.request
from pathlib import Path

class AccountStatusError(ValueError):
 def __init__(self,code,exit_code):super().__init__(code);self.exit_code=exit_code

def lookup(payload,load,fetch,project):
 if type(payload) is not dict or set(payload)!={'login','server','password'} or type(payload['login']) is not int or not 0<payload['login']<=9007199254740991 or type(payload['server']) is not str or not 0<len(payload['server'])<=256 or type(payload['password']) is not str or not 0<len(payload['password'])<=1024:raise ValueError('Invalid status request')
 binding=load(payload['login'],payload['server'])
 if binding is None:raise AccountStatusError('ACCOUNT_NOT_ASSIGNED',44)
 if binding.owner_kind not in ('client','mentor') or binding.owner_kind!=binding.role or type(binding.owner_id) is not int or binding.owner_id<=0:raise ValueError('Bound account unavailable')
 if not hmac.compare_digest(payload['password'].encode(),binding.password.encode()):raise AccountStatusError('ACCOUNT_PROOF_REJECTED',45)
 return project(binding,fetch(binding))
def engine_status(payload):
 registry=Path('/etc/ea-cloud/engine-router/registry.json');meta=registry.lstat()
 if meta.st_uid!=0 or meta.st_mode&0o077 or registry.is_symlink():raise ValueError('Untrusted engine registry')
 binding=next((b for b in json.loads(registry.read_text())['accounts'] if b['login']==payload['login'] and b['server']==payload['server'] and b.get('standby') is False),None)
 if binding is None:return None
 if binding.get('owner_kind') not in ('mentor','client') or type(binding.get('owner_id')) is not int:raise ValueError('No active original owner')
 token=Path('/etc/ea-cloud/engine-router/router-token').read_text().strip()
 request=urllib.request.Request('http://127.0.0.1:8004/observer/account-status',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 with opener.open(request,timeout=17) as response:
  raw=response.read(32769)
  if len(raw)>32768:raise ValueError('Oversized status')
  data=json.loads(raw)
 if data.get('success') is not True or data.get('connected') is not True or data.get('simulation') is not False or (data.get('login'),data.get('server'),data.get('broker'),data.get('role'),data.get('account_mode'))!=(binding['login'],binding['server'],binding['broker'],binding['role'],binding['mode']) or (data.get('owner_kind'),data.get('owner_id'))!=(binding['owner_kind'],binding['owner_id']):raise ValueError('Engine status mismatch')
 return {**data,'read_only':False,'financial_routes':False,'protocol':'EA_BOUND_ACCOUNT_STATUS_V1'}

def resolve_status(payload,engine,load,fetch,project):
 # Existing active engine authority always precedes legacy read-only fallback.
 result=engine(payload)
 if result is not None:return result
 binding=load(payload['login'],payload['server'])
 if binding is None:return {'success':False,'code':'NO_DYNAMIC_BINDING','execution_enabled':False}
 return lookup(payload,lambda *args:binding,fetch,project)

def main():
 if os.geteuid()!=0:raise ValueError('Private root port required')
 sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
 from dynamic_readonly_registry import load
 raw=sys.stdin.buffer.read(8193)
 if len(raw)>8192:raise ValueError('Oversized request')
 payload=json.loads(raw)
 if type(payload) is not dict or set(payload)!={'login','server','password'}:raise ValueError('Invalid status request')
 from readonly_account_relay import fetch_snapshot,project_snapshot
 result=resolve_status(payload,engine_status,load,fetch_snapshot,project_snapshot)
 print(json.dumps(result,allow_nan=False),flush=True)
if __name__=='__main__':
 try:main()
 except AccountStatusError as error:sys.exit(error.exit_code)
 except Exception:sys.exit(70)
