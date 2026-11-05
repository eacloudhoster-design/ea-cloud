#!/usr/bin/env python3
"""Read-only routing review; exports no logins, servers, passwords or tokens."""
import json,sys,os,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps-mt5-service'))
from demo_worker import DemoAccount
from account_dispatch import worker_url,NoRedirect

def assess_pair(configs,tokens):
 roles={'source':'mentor','receiver':'client'};rows={};identities=[]
 for role in roles:
  cfg=configs[role];identities.append((cfg.get('login'),cfg.get('server')))
  try:DemoAccount(**cfg);missing=[]
  except Exception as e:missing=sorted({'.'.join(map(str,x['loc'])) for x in e.errors()}) if hasattr(e,'errors') else ['manifest_validation']
  rows[role]={'demo_mode':cfg.get('account_mode')=='demo','effective_role':cfg.get('role','client'),'expected_role':roles[role],'role_matches':cfg.get('role','client')==roles[role],'worker_manifest_valid':not missing,'invalid_or_missing_fields':missing,'execution_disabled':cfg.get('enabled') is not True and cfg.get('execution_approved') is not True,'service_token_strong':len(tokens[role])>=32}
 distinct=identities[0]!=identities[1]
 independent=tokens['source']!=tokens['receiver']
 return {'accounts':rows,'distinct_account_identities':distinct,'distinct_service_tokens':independent,'mapping_contract_ready':distinct and independent and all(row['demo_mode'] and row['role_matches'] and row['worker_manifest_valid'] and row['execution_disabled'] and row['service_token_strong'] for row in rows.values())}

def inspect_registry(registry,configs):
 rows=registry.get('accounts',[]);identities=set();urls=set();roles=[]
 if not isinstance(rows,list) or not 1<=len(rows)<=2:return {'valid':False,'reason':'Missing or unsupported account count'}
 try:
  for row in rows:
   key=(row['login'],row['server']);url=worker_url(row['url']);matches=[cfg for cfg in configs.values() if (cfg.get('login'),cfg.get('server'))==key]
   if type(row['login']) is not int or row['login']<=0 or key in identities or url in urls or len(matches)!=1 or row['mode']!='demo' or row['broker']!=matches[0].get('broker') or row['role']!=matches[0].get('role','client'):raise ValueError()
   identities.add(key);urls.add(url);roles.append(row['role'])
  valid=sorted(roles)==['client','mentor']
  return {'valid':valid,'registered_accounts':len(rows),'complete_demo_pair':valid,'loaded_service_credentials_verified':False}
 except (KeyError,TypeError,ValueError):return {'valid':False,'reason':'Registry identity/role/endpoint mismatch'}

def main():
 if os.geteuid()!=0:raise PermissionError('Private configuration metadata access requires root')
 root=Path('/etc/ea-cloud');aliases={'source':'jm-demo','receiver':'jm-client-demo'};configs={};tokens={}
 for role,alias in aliases.items():
  configs[role]=json.loads((root/'accounts'/alias/'account.json').read_text());tokens[role]=(root/'accounts'/alias/'api-token').read_text().strip()
 report=assess_pair(configs,tokens);registry=root/'router/registry.json';report['router_registry_provisioned']=registry.is_file()
 report['registry_review']=inspect_registry(json.loads(registry.read_text()),configs) if registry.is_file() else {'valid':False,'reason':'Registry not provisioned'}
 report['existing_readonly_endpoints']={};opener=urllib.request.build_opener(NoRedirect)
 # Existing documented ports. This GET handler has no SDK initialization path.
 for role,port in [('source',8201),('receiver',8203)]:
  request=urllib.request.Request('http://127.0.0.1:'+str(port)+'/observer/capabilities',headers={'Authorization':'Bearer '+tokens[role]})
  try:
   try:
    with opener.open(request,timeout=5) as response:status=response.status;raw=response.read(4097)
   except urllib.error.HTTPError as e:status=e.code;raw=e.read(4097)
   data=json.loads(raw) if len(raw)<=4096 else {}
   report['existing_readonly_endpoints'][role]={'http_status':status,'readonly_contract':data.get('read_only') is True,'execution_explicitly_disabled':data.get('execution_enabled') is False,'v2_execution_ready':status==200 and data.get('persistentJournal') is True and data.get('absoluteTargets') is True and data.get('simulation') is False}
  except Exception:report['existing_readonly_endpoints'][role]={'status':'unavailable','v2_execution_ready':False}
 report.update(read_only=True,broker_queries_or_orders=0,configuration_modified=False,ready_for_router_cutover=report['mapping_contract_ready'] and report['registry_review'].get('valid') is True and report['registry_review'].get('loaded_service_credentials_verified') is True)
 print(json.dumps(report,indent=2))
if __name__=='__main__':main()
