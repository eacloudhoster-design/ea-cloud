#!/usr/bin/env python3
"""Credential-free initialization of a dedicated, clean account Wine prefix.
No SDK initialize/login/order call. Never operates on another user's prefix.
"""
import json,os,subprocess,sys
from pathlib import Path

def main():
 home=Path(os.environ['HOME']);prefix=Path(os.environ['WINEPREFIX'])
 if os.geteuid()==0 or home.stat().st_uid!=os.getuid() or prefix!=home/'wine' or prefix.is_symlink():raise RuntimeError('Invalid dedicated prefix')
 marker=home/'.runtime-prepared'
 wine='/opt/wine-stable/bin/'
 try:
  if not marker.exists():
   # A failed bootstrap is retained for reconciliation, never silently repaired.
   if prefix.exists():raise RuntimeError('Incomplete prefix requires reconciliation')
   subprocess.run([wine+'wineboot','-u'],check=True,timeout=110,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   subprocess.run([wine+'wineserver','-k'],check=True,timeout=5)
   subprocess.run([wine+'wineserver','-w'],check=True,timeout=10)
  code="import json,MetaTrader5,numpy,fastapi,pydantic,uvicorn;print(json.dumps({'sdk':MetaTrader5.__version__,'fastapi':fastapi.__version__}))"
  result=subprocess.run([wine+'wine',str(home/'python/python.exe'),'-B','-c',code],check=True,timeout=40,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  versions=json.loads(result.stdout);assert isinstance(versions['sdk'],str) and isinstance(versions['fastapi'],str)
  if not marker.exists():
   fd=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'w') as stream:stream.write(json.dumps(versions));stream.flush();os.fsync(stream.fileno())
  print('Credential-free account runtime prepared',flush=True)
 finally:
  subprocess.run([wine+'wineserver','-k'],timeout=5,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if __name__=='__main__':
 try:main()
 except Exception:print('Account runtime bootstrap held; details suppressed',flush=True);sys.exit(70)
