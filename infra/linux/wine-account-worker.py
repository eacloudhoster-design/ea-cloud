#!/usr/bin/env python3
"""Launch the gated account worker with LoadCredential values over stdin."""
import json,os,subprocess,sys
from pathlib import Path

def main():
    try:
        root=Path(os.environ['CREDENTIALS_DIRECTORY']);home=Path(os.environ['HOME'])
        binding=dict(config=json.loads((root/'account.json').read_text()),password=(root/'broker-password').read_text().rstrip('\r\n'),token=(root/'api-token').read_text().strip(),port=int(os.environ['API_PORT']))
        if binding['config'].get('account_mode')!='demo' or not 1024<=binding['port']<=65535:raise ValueError('Invalid demo binding')
        # No credential in argv/environment; suppress arbitrary vendor output.
        result=subprocess.run(['/opt/wine-stable/bin/wine',str(home/'python/python.exe'),r'Z:\opt\ea-cloud\vps-mt5-service\demo_worker.py'],input=json.dumps(binding),text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        print('Account worker exited; status='+str(result.returncode),flush=True)
        return result.returncode
    except Exception:
        print('Account worker failed; sensitive details suppressed',flush=True);return 70
if __name__=='__main__':sys.exit(main())
