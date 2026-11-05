#!/usr/bin/env python3
"""Prepared engine alert outbox; no external send without configured destination."""
import datetime,json,os,sqlite3,time,hashlib
from pathlib import Path
from operations import queue_alert,deliver_alerts,atomic_json

def merge_status(base,engine,now=None):
 now=time.time() if now is None else now;alerts=[]
 for label,status in [('host',base),('engine',engine)]:
  try:
   stamp=status['observed_at']
   if type(stamp) is bool:raise ValueError('Invalid timestamp')
   stamp=float(stamp) if isinstance(stamp,(int,float)) else datetime.datetime.fromisoformat(stamp).timestamp()
   if not 0<=now-stamp<=180:raise ValueError('Stale monitor')
   entries=status['alerts']
   if not isinstance(entries,list) or any(not isinstance(x,str) or len(x)>256 or any(ord(c)<32 for c in x) for x in entries):raise ValueError('Invalid alerts')
   alerts.extend(label+': '+x for x in entries)
  except (KeyError,ValueError,TypeError,OverflowError):alerts.append(label+': monitoring snapshot unavailable or stale')
 return {'observed_at':now,'alerts':sorted(set(alerts))}

def delivery_summary(db,destination,token,newly_sent=0):
 # Prior successful delivery to a different endpoint/token is not current proof.
 db.execute('CREATE TABLE IF NOT EXISTS engine_delivery_receipts(config_hash TEXT PRIMARY KEY, confirmations INTEGER NOT NULL)')
 configured=bool(destination);confirmed=0
 if configured:
  key=hashlib.sha256(json.dumps([destination,token],separators=(',',':')).encode()).hexdigest()
  if newly_sent:
   with db:db.execute('INSERT INTO engine_delivery_receipts VALUES(?,?) ON CONFLICT(config_hash) DO UPDATE SET confirmations=confirmations+excluded.confirmations',[key,newly_sent])
  row=db.execute('SELECT confirmations FROM engine_delivery_receipts WHERE config_hash=?',[key]).fetchone();confirmed=row[0] if row else 0
 pending=db.execute('SELECT count(*) FROM outbox WHERE sent IS NULL AND superseded=0').fetchone()[0]
 return {'configured':configured,'pending':pending,'delivery_verified':bool(configured and confirmed and pending==0),'confirmed_deliveries':confirmed,'observed_at':time.time()}

def main():
 reports=[]
 for name in ['status.json','engine-status.json']:
  try:reports.append(json.loads((Path('/var/lib/ea-cloud/monitor')/name).read_text()))
  except Exception:reports.append({})
 status=merge_status(*reports);db=sqlite3.connect('/var/lib/ea-cloud/monitor/engine-alert-outbox.sqlite3')
 try:
  queue_alert(db,status);destination=os.environ.get('EA_ALERT_WEBHOOK_URL');sent=0
  if destination:sent=deliver_alerts(db,destination,os.environ.get('EA_ALERT_TOKEN',''))
  report=delivery_summary(db,destination,os.environ.get('EA_ALERT_TOKEN',''),sent)
  atomic_json('/var/lib/ea-cloud/monitor/engine-alert-delivery.json',report);print(json.dumps(report))
 finally:db.close()
if __name__=='__main__':os.umask(0o077);main()
