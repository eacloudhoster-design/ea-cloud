"""Private-stdin, ephemeral loopback acceptance server; never imports the SDK."""
import json,socket,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'vps-mt5-service'))
from readonly_account_relay import Binding,create_app
import uvicorn
binding=json.loads(sys.stdin.readline())
app=create_app([Binding(**row) for row in binding['accounts']],binding['token'])
sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(64)
print(json.dumps({'port':sock.getsockname()[1]}),flush=True)
uvicorn.Server(uvicorn.Config(app,access_log=False,log_level='critical',server_header=False)).run(sockets=[sock])
