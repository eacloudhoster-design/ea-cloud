#!/usr/bin/env python3
"""Launch only the read-only account API with LoadCredential values over stdin."""
import json,os,subprocess,sys
from pathlib import Path

def main():
    try:
        root=Path(os.environ['CREDENTIALS_DIRECTORY']);home=Path(os.environ['HOME'])
        binding=dict(config=json.loads((root/'account.json').read_text()),password=(root/'broker-password').read_text().rstrip('\r\n'),token=(root/'api-token').read_text().strip(),port=int(os.environ['API_PORT']))
        if (binding['config'].get('account_mode') not in ('demo','live') or (binding['config'].get('account_mode')=='live' and binding['config'].get('allow_live_readonly') is not True)) or not 1024<=binding['port']<=65535:raise ValueError('Invalid demo binding')
        # No credential in argv/environment; suppress arbitrary vendor output.
        release=Path(__file__).resolve().parents[2]
        module_path='Z:'+str(release/'vps-mt5-service').replace('/','\\')
        entry="import sys,runpy;sys.path.insert(0,"+repr(module_path)+");runpy.run_module('demo_readonly_api',run_name='__main__')"
        result=subprocess.run(['/opt/wine-stable/bin/wine',str(home/'python/python.exe'),'-c',entry],input=json.dumps(binding),text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        print('Read-only account API exited; status='+str(result.returncode),flush=True)
        return result.returncode
    except Exception:
        print('Read-only account API failed; sensitive details suppressed',flush=True);return 70
if __name__=='__main__':sys.exit(main())
