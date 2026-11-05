#!/usr/bin/python3
"""Sanitized alert queue and encrypted offsite-backup runner. No secret output."""
import hashlib,json,os,sqlite3,subprocess,time,urllib.request,tempfile
from pathlib import Path
from urllib.parse import urlsplit

def atomic_json(path,value):
    path=Path(path);fd,tmp=tempfile.mkstemp(dir=path.parent)
    with os.fdopen(fd,'w') as f:json.dump(value,f)
    os.chmod(tmp,0o644);os.replace(tmp,path)

def validate_webhook(url):
    parsed=urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Webhook requires a credential-free HTTPS URL')
    return url

def queue_alert(db,status):
    db.execute('CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,body TEXT,attempts INTEGER DEFAULT 0,due REAL DEFAULT 0,sent REAL,superseded INTEGER DEFAULT 0)')
    if 'superseded' not in {row[1] for row in db.execute('PRAGMA table_info(outbox)')}:
        db.execute('ALTER TABLE outbox ADD COLUMN superseded INTEGER DEFAULT 0')
        db.execute('UPDATE outbox SET superseded=1 WHERE sent IS NULL AND rowid<(SELECT max(rowid) FROM outbox WHERE sent IS NULL)')
        db.commit()
    db.execute('CREATE TABLE IF NOT EXISTS alert_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),fingerprint TEXT)')
    alerts=sorted(status.get('alerts',[]))
    fingerprint=hashlib.sha256(json.dumps(alerts).encode()).hexdigest()
    previous=db.execute('SELECT fingerprint FROM alert_state WHERE singleton=1').fetchone()
    if previous and previous[0]==fingerprint:return
    body=json.dumps({'service':'EA Cloud infrastructure','state':'degraded' if alerts else 'recovered','alerts':alerts,'observed_at':status.get('observed_at')})
    event=hashlib.sha256((fingerprint+str(time.time_ns())).encode()).hexdigest()
    with db:
        db.execute('UPDATE outbox SET superseded=1 WHERE sent IS NULL')
        if alerts or previous:db.execute('INSERT INTO outbox(id,body) VALUES(?,?)',[event,body])
        db.execute('INSERT OR REPLACE INTO alert_state VALUES(1,?)',[fingerprint])

class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never forward an alert authorization header to another host.
    def redirect_request(self,*args,**kwargs):return None

def deliver_alerts(db,url,token,send=None):
    validate_webhook(url)
    if token and len(token)<32:raise ValueError('Alert credential too short')
    opener=urllib.request.build_opener(NoRedirect)
    if send is None:
        def send(body):
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            with opener.open(urllib.request.Request(url,data=body.encode(),headers=headers),timeout=10) as response:
                if not 200<=response.status<300:raise RuntimeError('Delivery failed')
    delivered=0
    rows=db.execute('SELECT id,body,attempts FROM outbox WHERE sent IS NULL AND superseded=0 AND due<=? ORDER BY rowid LIMIT 10',[time.time()]).fetchall()
    for event,body,attempts in rows:
        try:
            send(body)
            with db:db.execute('UPDATE outbox SET sent=? WHERE id=?',[time.time(),event])
            delivered+=1
        except Exception:
            with db:db.execute('UPDATE outbox SET attempts=attempts+1,due=? WHERE id=?',[time.time()+min(3600,30*2**min(attempts,7)),event])
    return delivered

def alerts_main():
    status=json.loads(Path('/var/lib/ea-cloud/monitor/status.json').read_text())
    db=sqlite3.connect('/var/lib/ea-cloud/monitor/alert-outbox.sqlite3')
    queue_alert(db,status)
    configured=bool(os.environ.get('EA_ALERT_WEBHOOK_URL'))
    if configured:deliver_alerts(db,os.environ['EA_ALERT_WEBHOOK_URL'],os.environ.get('EA_ALERT_TOKEN',''))
    pending=db.execute('SELECT count(*) FROM outbox WHERE sent IS NULL AND superseded=0').fetchone()[0]
    atomic_json('/var/lib/ea-cloud/monitor/alert-delivery.json',{'configured':configured,'pending':pending,'delivery_verified':configured and pending==0,'observed_at':time.time()})
    db.close();print(json.dumps({'alert_destination_configured':configured,'pending_alerts':pending}))

def offsite_main():
    repository=os.environ.get('RESTIC_REPOSITORY','')
    password_file=os.environ.get('RESTIC_PASSWORD_FILE','')
    # No local filesystem destination can be labeled offsite. Only HTTPS remote
    # backends are supported here; provider credentials stay in environment/files.
    valid=repository.startswith(('s3:https://','rest:https://'))
    if valid:
        url=repository.split(':',1)[1] if repository.startswith('s3:') else repository[5:]
        parsed=urlsplit(url)
        valid=parsed.hostname not in ('localhost','127.0.0.1','::1') and bool(parsed.hostname) and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
    report={'configured':bool(repository and password_file),'offsite_verified':False,'observed_at':time.time()}
    if not report['configured']:
        report['reason']='Repository and password-file binding missing'
    elif not valid or not Path(password_file).is_file() or Path(password_file).stat().st_mode & 0o077:
        report['reason']='Unsupported remote repository or missing secure password file'
    else:
        # Never initializes, prunes, forgets or deletes an existing repository.
        r=subprocess.run(['restic','backup','--json','/var/backups/ea-cloud'],capture_output=True,timeout=1800)
        report['offsite_verified']=r.returncode==0
        report['reason']='Encrypted backup completed' if r.returncode==0 else 'Restic failed; inspect repository access without exposing credentials'
    atomic_json('/var/lib/ea-cloud/monitor/offsite-status.json',report)
    print(json.dumps(report))

if __name__=='__main__':
    import sys
    os.umask(0o077)
    if sys.argv[1]=='alerts':alerts_main()
    elif sys.argv[1]=='offsite':offsite_main()
    else:raise SystemExit('Unknown operation')
