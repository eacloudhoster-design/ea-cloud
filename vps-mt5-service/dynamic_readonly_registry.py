"""Optional root-only self-service enrollment resolver. No SDK, mutation or restart.
Root service config opts in explicitly. Existing static bindings retain precedence.
"""
import json,os,sqlite3,stat,subprocess
from pathlib import Path

ROOT=Path('/var/lib/ea-cloud/private-provisioner')
def safe(path,root=ROOT):
 path=Path(path)
 if not path.is_relative_to(root) or path.resolve()!=path.absolute():raise ValueError('Untrusted registry')
 for p in (root,path):
  s=p.lstat()
  if s.st_uid!=0 or s.st_mode&0o077 or p.is_symlink():raise ValueError('Untrusted registry')
 if not path.is_file():raise ValueError('Untrusted registry')
 return path

def load(login,server,*,root=ROOT,decrypt=None):
 # Only fixed configured root, never a path/credential selector supplied by HTTP.
 root=Path(root)
 database=safe(root/'allocations.sqlite3',root)
 with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True) as db:
  account=__import__('hashlib').sha256(json.dumps([str(login),server],sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
  rows=db.execute("SELECT request,slot,owner FROM allocations WHERE account=? AND state='verified_readonly'",(account,)).fetchall()
 if len(rows)!=1:return None
 request,slot,owner=rows[0]
 import re
 if not re.fullmatch('ss-[a-z0-9]{1,20}',slot):raise ValueError('Invalid slot')
 descriptor=json.loads(safe(root/(slot+'-enrollment.json'),root).read_text())
 if descriptor['requestId']!=request or descriptor['owner']!=json.loads(owner) or descriptor['login']!=login or descriptor['server']!=server or descriptor['executionEnabled'] is not False:raise ValueError('Binding mismatch')
 expected=root/(slot+'-credentials')
 if Path(descriptor['credentials'])!=expected or expected.is_symlink() or expected.stat().st_uid!=0 or expected.stat().st_mode&0o077:raise ValueError('Untrusted credential directory')
 def decrypt_real(name,path):
  return subprocess.run(['/usr/bin/systemd-creds','decrypt','--name='+name,str(path),'-'],check=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=2).stdout.decode().rstrip('\r\n')
 decode=decrypt or decrypt_real
 password=decode('broker-password',safe(expected/'broker-password',root))
 token=decode('api-token',safe(expected/'api-token',root))
 from readonly_account_relay import Binding
 return Binding(broker=descriptor['broker'],login=login,server=server,role=descriptor['role'],url=descriptor['url'],password=password,api_token=token,account_mode=descriptor.get('accountMode','demo'))
