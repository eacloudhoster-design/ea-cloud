#!/opt/ea-cloud/infra/linux/.venv/bin/python
"""Fixed read-only root port for the nonroot relay. Never exports credentials."""
import hmac,json,os,sys
from pathlib import Path

def lookup(payload,load,fetch,project):
 if type(payload) is not dict or set(payload)!={'login','server','password'} or type(payload['login']) is not int or not 0<payload['login']<=9007199254740991 or type(payload['server']) is not str or not 0<len(payload['server'])<=256 or type(payload['password']) is not str or not 0<len(payload['password'])<=1024:raise ValueError('Invalid status request')
 binding=load(payload['login'],payload['server'])
 if binding is None or binding.owner_kind not in ('client','mentor') or binding.owner_kind!=binding.role or type(binding.owner_id) is not int or binding.owner_id<=0 or not hmac.compare_digest(payload['password'].encode(),binding.password.encode()):raise ValueError('Bound account unavailable')
 return project(binding,fetch(binding))
def main():
 if os.geteuid()!=0:raise ValueError('Private root port required')
 sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
 from dynamic_readonly_registry import load
 from readonly_account_relay import fetch_snapshot,project_snapshot
 raw=sys.stdin.buffer.read(8193)
 if len(raw)>8192:raise ValueError('Oversized request')
 print(json.dumps(lookup(json.loads(raw),load,fetch_snapshot,project_snapshot),allow_nan=False),flush=True)
if __name__=='__main__':
 try:main()
 except Exception:sys.exit(70)
