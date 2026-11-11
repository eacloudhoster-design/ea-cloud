#!/usr/bin/env python3
"""Keep a new account unit alive across MT5's child-process live-update handover.
No broker API, orders or credential arguments. Existing units are not changed.
"""
import os,signal,socket,subprocess,time
from pathlib import Path

def terminal_running(proc=Path('/proc'),uid=None,own=None,ready=False):
 uid=os.getuid() if uid is None else uid;own=os.getpid() if own is None else own
 for entry in proc.iterdir():
  if not entry.name.isdigit() or int(entry.name)==own:continue
  try:
   if entry.stat().st_uid!=uid:continue
   args=(entry/'cmdline').read_bytes().split(b'\0')
   if any(arg.lower().replace(b'\\',b'/').endswith(b'/terminal64.exe') for arg in args):
    if not ready or (entry/'comm').read_text().strip() in ('main','terminal64.exe'):return True
  except (FileNotFoundError,PermissionError,ProcessLookupError):continue
 return False

def main():
 if os.geteuid()==0:raise RuntimeError('Dedicated account user required')
 home=Path(os.environ['HOME']);terminal=home/'terminal/terminal64.exe'
 if not terminal.is_file() or home.stat().st_uid!=os.getuid():raise RuntimeError('Bound terminal unavailable')
 bootstrap=home/'terminal-bootstrap.ini'
 # Linux reads its own credential mount; Wine's shared namespace need not see it.
 content=(Path(os.environ['CREDENTIALS_DIRECTORY'])/'terminal-login.ini').read_bytes()
 fd=os.open(bootstrap,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 os.fchmod(fd,0o600)
 with os.fdopen(fd,'wb') as stream:stream.write(content)
 win='Z:'+str(bootstrap).replace('/','\\')
 child=subprocess.Popen(['/opt/wine-stable/bin/wine',str(terminal),'/portable','/config:'+win],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 absent=None;notified=False
 while True:
  if not notified and terminal_running(ready=True):
   address=os.environ.get('NOTIFY_SOCKET')
   if address:
    with socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM) as sock:
     sock.connect('\0'+address[1:] if address.startswith('@') else address);sock.sendall(b'READY=1')
   notified=True
  if child.poll() is None or terminal_running():absent=None
  elif absent is None:absent=time.monotonic()
  elif time.monotonic()-absent>=15:return 1
  time.sleep(1)
if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception:print('Portable terminal supervision failed; details suppressed',flush=True);raise SystemExit(70)
