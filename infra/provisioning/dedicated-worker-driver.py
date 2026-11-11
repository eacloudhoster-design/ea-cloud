#!/usr/bin/env python3
"""Approved-slot MT5 read-only worker creator. Disabled CLI; tests inject every host operation.
Uses sanitized, manifest-pinned images and pre-authorized isolated OS identities.
Never copies an existing account/prefix and never accepts paths/commands from the API.
"""
import fcntl,hashlib,json,os,re,secrets,shutil,sqlite3,stat,subprocess,sys,time
from pathlib import Path

def require(v):
 if not v:raise RuntimeError('WORKER_CREATION_HELD')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)
def save(p,value):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as stream:stream.write(canonical(value));stream.flush();os.fsync(stream.fileno())
 parent=os.open(Path(p).parent,os.O_RDONLY)
 try:os.fsync(parent)
 finally:os.close(parent)
def validate(v):
 require(set(v)=={'requestId','ownerKind','ownerId','broker','login','server','password','role','accountMode','executionEnabled'})
 require(type(v['requestId']) is str and re.fullmatch('[0-9a-fA-F-]{36}',v['requestId']) and type(v['ownerId']) is int and v['ownerId']>0)
 require(v['ownerKind'] in ('client','mentor') and v['role']==('client' if v['ownerKind']=='client' else 'mentor'))
 require(v['broker'] in ('justmarkets','deriv','exness','xm','rcg') and v['accountMode'] in ('demo','live') and v['executionEnabled'] is False)
 require(type(v['login']) is str and re.fullmatch('[1-9][0-9]*',v['login']) and int(v['login'])<=9007199254740991)
 require(type(v['server']) is str and 0<len(v['server'])<=256 and v['server']==v['server'].strip() and not any(ord(c)<32 or ord(c)==127 for c in v['server']))
 require(type(v['password']) is str and 0<len(v['password'])<=1024)

def inspect_image(root,manifest):
 root=Path(root);require(root.is_dir() and not root.is_symlink())
 actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
 require(actual==set(manifest) and all(not p.is_symlink() for p in root.rglob('*')))
 for name,h in manifest.items():
  p=Path(name);require(not p.is_absolute() and '..' not in p.parts and sha(root/p)==h)
 require({'python/python.exe','terminal/terminal64.exe'}.issubset(manifest))
 # Hash allowlist must be an independently reviewed sanitized image, not a known account home.

class Driver:
 def __init__(self,config,host):
  self.config=config;self.host=host;self.root=Path(config['state_root'])
  require(self.root.is_dir() and not self.root.is_symlink() and self.root.resolve()==self.root.absolute() and self.root.stat().st_uid==os.geteuid() and self.root.stat().st_mode&0o077==0)
 def db(self):
  path=self.root/'allocations.sqlite3';require(not path.is_symlink())
  db=sqlite3.connect(path,timeout=1);os.chmod(path,0o600);db.execute('PRAGMA synchronous=FULL')
  db.executescript('CREATE TABLE IF NOT EXISTS allocations(request TEXT PRIMARY KEY,account TEXT UNIQUE,owner TEXT,slot TEXT UNIQUE,state TEXT);CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,request TEXT,event TEXT,observed REAL);')
  return db
 def gate(self):
  require(self.config.get('enabled') is True and len(self.config['stops'])==2 and all(Path(p).is_file() for p in self.config['stops']))
 def create(self,v):
  validate(v);self.gate();require(v['accountMode']=='demo' or self.config.get('allow_live_readonly') is True);owner=[v['ownerKind'],v['ownerId']]
  account=hashlib.sha256(canonical([v['login'],v['server']]).encode()).hexdigest()
  lock=os.open(self.root/'allocator.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
  try:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   with self.db() as db:
    existing=db.execute('SELECT owner,state FROM allocations WHERE request=?',(v['requestId'],)).fetchone()
    # No replay/recovery by rerunning driver, even if prior host action may have completed.
    require(existing is None)
    require(db.execute('SELECT 1 FROM allocations WHERE account=?',(account,)).fetchone() is None)
    used={x[0] for x in db.execute('SELECT slot FROM allocations')}
    candidates=[s for s in self.config['slots'] if s['id'] not in used and s['broker']==v['broker']]
    require(candidates);slot=candidates[0]
    require(re.fullmatch('ss-[a-z0-9]{1,20}',slot['id']) and type(slot['uid']) is int and slot['uid']>0 and type(slot['gid']) is int and slot['gid']>0)
    require(type(slot['port']) is int and 10000<=slot['port']<=11000 and type(slot['display']) is int and 100<=slot['display']<=999)
    require(len({s['id'] for s in self.config['slots']})==len(self.config['slots']))
    for field in ('uid','port','display','home'):
     require(len({s[field] for s in self.config['slots']})==len(self.config['slots']))
    image=Path(slot['image']);home=Path(slot['home']);require(not home.exists() and not home.is_symlink())
    inspect_image(image,slot['manifest']);self.host.verify_slot(slot)
    db.execute("INSERT INTO allocations VALUES(?,?,?,?,'reserved')",(v['requestId'],account,canonical(owner),slot['id']))
    db.execute('INSERT INTO audit(request,event,observed) VALUES(?,?,?)',(v['requestId'],'reserved',time.time()));db.commit()
   try:
    self.gate();shutil.copytree(image,home,symlinks=False)
    secrets_dir=self.root/(slot['id']+'-credentials');secrets_dir.mkdir(mode=0o700)
    cfg={'broker':v['broker'],'login':int(v['login']),'server':v['server'],'role':v['role'],'account_mode':v['accountMode'],'allow_live_readonly':v['accountMode']=='live','enabled':False,'execution_approved':False,'terminal_path':'Z:'+str(home/'terminal/terminal64.exe').replace('/','\\'),'journal_path':'Z:'+str(home/'readonly-unused.sqlite3').replace('/','\\')}
    token=secrets.token_urlsafe(48)
    # systemd encrypted credentials at rest. Only transient private stdin carries plaintext.
    for name,value in [('account.json',canonical(cfg)),('broker-password',v['password']),('api-token',token)]:
     self.host.encrypt(name,value,secrets_dir/name)
    self.host.prepare(slot)
    self.gate();self.host.start(slot,secrets_dir)
    proof=self.host.snapshot(slot,token)
    require(all(proof.get(k) is True for k in ('success','read_only','initialized','identity_verified','portable_paths_verified','connected','positions_read_verified','orders_read_verified')))
    require(proof.get('automated_trading_enabled') is False and proof.get('execution_enabled') is False and proof.get('financial_trades')==0)
    require(proof.get('account',{}).get('login')==int(v['login']) and proof['account'].get('server')==v['server'] and proof['account'].get('mode')==v['accountMode'])
    # Private descriptor, not a claim that the existing static relay hot-reloaded.
    save(self.root/(slot['id']+'-enrollment.json'),{'requestId':v['requestId'],'owner':owner,'slot':slot['id'],'broker':v['broker'],'login':int(v['login']),'server':v['server'],'role':v['role'],'url':'http://127.0.0.1:'+str(slot['port']),'credentials':str(secrets_dir),'executionEnabled':False,'accountMode':v['accountMode']})
    with self.db() as db:
     db.execute("UPDATE allocations SET state='verified_readonly' WHERE request=?",(v['requestId'],));db.execute('INSERT INTO audit(request,event,observed) VALUES(?,?,?)',(v['requestId'],'verified_readonly',time.time()))
    return {'state':'verified_readonly','slot':slot['id'],'executionEnabled':False}
   except BaseException:
    # Stop only our allowlisted new units. Keep encrypted state/audit for reconciliation.
    stopped=False
    try:self.host.stop(slot);stopped=True
    except Exception:pass
    with self.db() as db:
     db.execute("UPDATE allocations SET state='held' WHERE request=?",(v['requestId'],));db.execute('INSERT INTO audit(request,event,observed) VALUES(?,?,?)',(v['requestId'],'held_stopped' if stopped else 'held_shutdown_uncertain',time.time()))
    raise RuntimeError('WORKER_CREATION_HELD') from None
  finally:os.close(lock)
 def cleanup(self,request_id):
  # Explicit maintenance only; no automatic cleanup of uncertain allocation or registry.
  with self.db() as db:row=db.execute('SELECT slot,state FROM allocations WHERE request=?',(request_id,)).fetchone()
  require(row and row[1] in ('reserved','held','verified_readonly','stopped_retained'))
  slot=next(s for s in self.config['slots'] if s['id']==row[0]);self.host.stop(slot);require(self.host.inactive(slot))
  # Retain homes/credentials until authenticated relay removal and retention approval.
  with self.db() as db:
   db.execute("UPDATE allocations SET state='stopped_retained' WHERE request=?",(request_id,));db.execute('INSERT INTO audit(request,event,observed) VALUES(?,?,?)',(request_id,'stopped_retained',time.time()))
  return {'state':'stopped_retained','resourcesDeleted':False}

class SystemdHost:
 """Deployment-only host port. Unit names, users and images are operator-approved."""
 def __init__(self,config):self.config=config
 def run(self,args,data=None):
  return subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=6,check=True).stdout
 def verify_slot(self,s):
  import pwd
  user=pwd.getpwuid(s['uid']);require(user.pw_name=='ea-account-'+s['id'] and user.pw_gid==s['gid'])
  require(Path(s['home']).parent.resolve()==Path(self.config['accounts_root']).resolve())
  require(self.config['state_root']=='/var/lib/ea-cloud/private-provisioner' and self.config['accounts_root']=='/var/lib/ea-cloud/selfservice-accounts')
  require(Path(s['home'])==Path(self.config['accounts_root'])/s['id'])
  require(Path(s['image']).resolve().is_relative_to(Path(self.config['images_root']).resolve()))
 def encrypt(self,name,value,path):
  result=self.run(['/usr/bin/systemd-creds','encrypt','--name='+name,'-','-'],value.encode())
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb') as f:f.write(result);f.flush();os.fsync(f.fileno())
 def prepare(self,s):
  runtime=Path(self.config['state_root'])/(s['id']+'-runtime.env')
  home=str(Path(s['home']));require(not any(c in home for c in '\r\n\" '))
  text='HOME='+home+'\nWINEPREFIX='+home+'/wine\nDISPLAY=:'+str(s['display'])+'\nAPI_PORT='+str(s['port'])+'\nWINEDEBUG=-all\n'
  fd=os.open(runtime,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w') as f:f.write(text);f.flush();os.fsync(f.fileno())
  self.run(['/usr/bin/xauth','-f',home+'/.Xauthority'],('add :'+str(s['display'])+' . '+secrets.token_hex(16)+'\n').encode())
  for p in [Path(s['home']),*Path(s['home']).rglob('*')]:os.chown(p,s['uid'],s['gid'])
 def start(self,s,credentials):
  # Pre-reviewed templates read encrypted credentials from fixed operator config roots.
  # The config validator must match those roots to this driver's credential directory.
  self.run(['/usr/bin/systemctl','start','ea-selfservice-display@'+s['id']+'.service'])
  self.run(['/usr/bin/systemctl','start','ea-selfservice-readonly@'+s['id']+'.service'])
 def stop(self,s):
  self.run(['/usr/bin/systemctl','stop','ea-selfservice-readonly@'+s['id']+'.service','ea-selfservice-display@'+s['id']+'.service'])
 def inactive(self,s):
  for name in ('readonly','display'):
   value=self.run(['/usr/bin/systemctl','show','--property=ActiveState','--value','ea-selfservice-'+name+'@'+s['id']+'.service']).decode().strip()
   if value not in ('inactive','failed'):return False
  return True
 def snapshot(self,s,token):
  import urllib.request
  class NoRedirect(urllib.request.HTTPRedirectHandler):
   def redirect_request(self,*a,**kw):return None
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
  request=urllib.request.Request('http://127.0.0.1:'+str(s['port'])+'/v1/read-only-snapshot',headers={'Authorization':'Bearer '+token})
  deadline=time.monotonic()+75
  while True:
   require(all(Path(p).is_file() for p in self.config['stops']))
   remaining=deadline-time.monotonic();require(remaining>0)
   try:
    with opener.open(request,timeout=min(17,remaining)) as response:
     raw=response.read(32769);require(len(raw)<=32768 and response.status==200);return json.loads(raw)
   except (OSError,TimeoutError):
    if time.monotonic()>=deadline:raise RuntimeError('WORKER_STARTUP_UNAVAILABLE') from None
    time.sleep(min(1,max(0,deadline-time.monotonic())))

def main():
 require(os.geteuid()==0)
 # Root-owned config enabled=false by default; service executable hash is separately pinned.
 config_path=Path('/etc/ea-cloud/private-provisioner/worker-driver.json');meta=config_path.lstat()
 require(stat.S_ISREG(meta.st_mode) and meta.st_uid==0 and meta.st_mode&0o077==0)
 config=json.loads(config_path.read_text());raw=sys.stdin.buffer.read(8193);require(len(raw)<=8192)
 driver=Driver(config,SystemdHost(config))
 if len(sys.argv)==3 and sys.argv[1]=='--stop-retain':
  require(re.fullmatch('[0-9a-fA-F-]{36}',sys.argv[2]));driver.cleanup(sys.argv[2]);return
 require(len(sys.argv)==1);driver.create(json.loads(raw))
if __name__=='__main__':
 try:main()
 except BaseException:sys.exit(70) # Never print request, credentials or vendor diagnostics.
