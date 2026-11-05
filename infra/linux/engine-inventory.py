#!/usr/bin/env python3
"""Root read-only inventory. No SDK, process mutation or credentials in output."""
import datetime,json,os,sqlite3,subprocess,time,tempfile,re
from pathlib import Path

def owned_journal(path,alias,base=Path('/var/lib/ea-cloud/accounts')):
 if not re.fullmatch(r'[a-zA-Z0-9_-]+',alias):return None
 try:
  resolved=Path(path).resolve(strict=True)
  return resolved if resolved.is_file() and resolved.is_relative_to(base.resolve()/alias) else None
 except OSError:return None

def assess(report):
 alerts=[unit+': service unavailable' for unit,state in report['services'].items() if state!='active']
 alerts += [a['alias']+': broker submission requires reconciliation' for a in report['accounts'] if isinstance(a.get('journal_holds'),int) and a['journal_holds']>0]
 if not report['both_emergency_stops_active'] and not report['active_execution_grant']:alerts.append('Emergency gates are not both latched and no active grant exists')
 if report.get("publisher",{}).get("installed") and not report["publisher"].get("metadata_fresh"):alerts.append("Root stop publisher metadata unavailable or stale")
 return alerts

def inventory():
 root=Path('/etc/ea-cloud');accounts=[]
 for file in sorted((root/'accounts').glob('*/account.json'))[:100]:
  try:
   c=json.loads(file.read_text());alias=file.parent.name
   path=str(c.get('journal_path','')).replace('\\','/')
   if path.lower().startswith('z:'):path=path[2:]
   journal=owned_journal(path,alias);holds=None
   if journal is not None:
    db=sqlite3.connect(journal.as_uri()+'?mode=ro',uri=True,timeout=1)
    try:
     db.execute('PRAGMA query_only=ON');db.execute('PRAGMA busy_timeout=1000')
     holds=db.execute("SELECT count(*) FROM allocations WHERE phase IN ('dispatching','reconciled_hold','external_reduction')").fetchone()[0]
    finally:db.close()
   accounts.append({'alias':alias,'broker':c.get('broker'),'role':c.get('role'),'account_mode':c.get('account_mode'),'enabled':c.get('enabled') is True,'execution_approved':c.get('execution_approved') is True,'journal_holds':holds,'journal_inspected':holds is not None})
  except Exception:accounts.append({'alias':file.parent.name,'status':'inspection_unavailable'})
 units=['ea-mt5-api','ea-simulation','ea-jm-demo-terminal','ea-jm-demo-readonly-api','ea-account-terminal@jm-client-demo','ea-account-readonly@jm-client-demo','ssh','fail2ban']
 services={u:subprocess.run(['systemctl','is-active',u],capture_output=True,text=True,timeout=3).stdout.strip() for u in units}
 publisher={'installed':subprocess.run(['systemctl','show','ea-execution-gates.service','--property=LoadState','--value'],capture_output=True,text=True,timeout=3).stdout.strip()=='loaded','metadata_fresh':False}
 if publisher['installed']:
  services['ea-execution-gates']=subprocess.run(['systemctl','is-active','ea-execution-gates'],capture_output=True,text=True,timeout=3).stdout.strip()
  try:
   file=Path('/run/ea-cloud-execution-gate/state.json');meta=file.stat();parent=file.parent.stat();data=json.loads(file.read_text());observed=data['observed_at'];expiry=data['expires_at'];now=time.time()
   publisher['metadata_fresh']=not file.is_symlink() and not file.parent.is_symlink() and meta.st_uid==parent.st_uid==0 and not (meta.st_mode|parent.st_mode)&0o022 and type(observed) in (int,float) and type(expiry) in (int,float) and 0<=now-observed<=3 and now<expiry<=observed+3 and type(data.get('stops_active')) is bool
  except Exception:pass

 return {'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'read_only':True,'accounts':accounts,'services':services,'publisher':publisher,'both_emergency_stops_active':all((root/'acceptance'/n).is_file() for n in ['XAUUSD.STOP','XAUUSD.CLEANUP_STOP']),'active_execution_grant':(root/'acceptance/XAUUSD_AUTHORIZATION.json').exists(),'production_api_env_available':(root/'api.env').is_file(),'process_database_url_bound':bool(os.environ.get('DATABASE_URL')),'process_encryption_secret_bound':bool(os.environ.get('SESSION_SECRET')),'external_alert_destination_config_available':(root/'alerts.env').is_file(),'offsite_destination_config_available':(root/'offsite.env').is_file(),'broker_execution_or_production_readiness_claimed':False}
if __name__=='__main__':
 if os.geteuid()!=0:raise SystemExit('Root required for private metadata inspection')
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
 report=inventory();report['alerts']=assess(report)
 if args.output:
  # Fixed destination; no user-selected path or credential file replacement.
  if args.output!=Path('/var/lib/ea-cloud/monitor/engine-status.json'):raise SystemExit('Unsupported inventory destination')
  fd,tmp=tempfile.mkstemp(dir=args.output.parent)
  try:
   with os.fdopen(fd,'w') as f:json.dump(report,f);f.flush();os.fsync(f.fileno())
   os.chmod(tmp,0o644);os.replace(tmp,args.output)
  finally:
   if os.path.exists(tmp):os.unlink(tmp)
 print(json.dumps(report,indent=2));raise SystemExit(1 if report['alerts'] else 0)
