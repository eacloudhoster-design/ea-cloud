import sys,tempfile,unittest,sqlite3,threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from account_workers import Account,AccountWorkers
from observer_sync import ObserverSync

def payload(login=1,server='SimulationOnly',revision=1,target=.1,**kw):
 return ObserverSync(login=login,password='never-persist-this',server=server,sourceKey='a'*64,revision=revision,symbol='EURUSD',target=target,sl=kw.get('sl',0),tp=0,maxVolume=1)
class AccountTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
 def tearDown(self):self.tmp.cleanup()
 def test_parallel_account_isolation_lifecycle_and_durable_restart(self):
  accounts=[Account('one','deriv',1,'SimulationOnly'),Account('two','exness',2,'SimulationOnly')]
  pool=AccountWorkers(accounts,self.root)
  try:
   with ThreadPoolExecutor(2) as executor:results=list(executor.map(pool.dispatch,[payload(1),payload(2)]))
   self.assertTrue(all(r['success'] for r in results));self.assertNotEqual(results[0]['worker_pid'],results[1]['worker_pid'])
   self.assertTrue(pool.dispatch(payload(1,revision=2,target=.06))['success'])
   self.assertTrue(pool.dispatch(payload(1,revision=3,target=-.03,sl=1.2))['success'])
   self.assertTrue(pool.dispatch(payload(1,revision=4,target=0))['success'])
  finally:pool.close()
  pool=AccountWorkers(accounts,self.root)
  try:
   self.assertTrue(pool.dispatch(payload(2))['success'])
   self.assertFalse(pool.dispatch(payload(2,target=.2))['success'])
   self.assertFalse(pool.dispatch(payload(99))['success'])
  finally:pool.close()
  with sqlite3.connect(self.root/'two/simulated-broker.sqlite3') as db:
   self.assertEqual(db.execute('SELECT count(*) FROM fills').fetchone()[0],1)
  for path in self.root.rglob('*.sqlite3'):
   self.assertNotIn(b'never-persist-this',path.read_bytes())
 def test_worker_crash_after_fill_blocks_duplicate_after_restart(self):
  pool=AccountWorkers([Account('crash','xm',1,'SimulationOnly',crash_after_commit=True)],self.root,timeout=3)
  try:
   result=pool.dispatch(payload());self.assertTrue(result['uncertain']);self.assertFalse(result['retriable'])
  finally:pool.close()
  pool=AccountWorkers([Account('crash','xm',1,'SimulationOnly')],self.root)
  try:self.assertTrue(pool.dispatch(payload(revision=2))['uncertain'])
  finally:pool.close()
  with sqlite3.connect(self.root/'crash/simulated-broker.sqlite3') as db:
   self.assertEqual(db.execute('SELECT count(*) FROM fills').fetchone()[0],1)
 def test_mentor_and_duplicate_bindings_rejected(self):
  pool=AccountWorkers([Account('mentor','rcg',1,'SimulationOnly',role='mentor')],self.root)
  try:self.assertFalse(pool.dispatch(payload())['success'])
  finally:pool.close()
  with self.assertRaises(ValueError):AccountWorkers([Account('one','deriv',1,'S'),Account('two','exness',1,'S')],self.root)
 def test_second_gateway_cannot_own_the_same_account_journals(self):
  pool=AccountWorkers([],self.root)
  try:
   with self.assertRaises(ValueError):AccountWorkers([],self.root)
  finally:pool.close()

 def test_additive_journal_upgrade_preserves_existing_rows(self):
  from observer_sync import SyncJournal
  path=self.root/'legacy.sqlite3'
  with sqlite3.connect(path) as db:
   db.execute("CREATE TABLE allocations(scope TEXT PRIMARY KEY, account TEXT NOT NULL, source TEXT NOT NULL, magic INTEGER NOT NULL, symbol TEXT NOT NULL, revision INTEGER NOT NULL, phase TEXT NOT NULL, response TEXT, UNIQUE(account,magic))")
   db.execute("INSERT INTO allocations VALUES('scope','account','source',123,'EURUSD',7,'done','{}')")
  db=SyncJournal(path).open()
  try:
   row=db.execute('SELECT * FROM allocations').fetchone()
   self.assertEqual(row['revision'],7);self.assertEqual(row['phase'],'done');self.assertEqual(row['response'],'{}');self.assertIsNone(row['request_hash'])
  finally:db.close()

 def test_persisted_identity_rejects_reassignment_without_changing_state(self):
  from dataclasses import replace
  account=Account('bound','deriv',1,'SimulationOnly')
  pool=AccountWorkers([account],self.root)
  try:self.assertTrue(pool.dispatch(payload())['success'])
  finally:pool.close()
  before={p.name:p.read_bytes() for p in (self.root/'bound').iterdir()}
  for changes in [dict(login=2),dict(server='Other'),dict(broker='xm')]:
   changed=replace(account,**changes)
   pool=AccountWorkers([changed],self.root)
   try:
    result=pool.dispatch(payload(login=changed.login,server=changed.server))
    self.assertFalse(result['success']);self.assertFalse(result['retriable'])
    self.assertNotIn('worker_pid',result)
   finally:pool.close()
  self.assertEqual(before,{p.name:p.read_bytes() for p in (self.root/'bound').iterdir()})

 def test_unbound_legacy_state_is_preserved_and_rejected(self):
  root=self.root/'legacy';root.mkdir();state=root/'simulated-broker.sqlite3'
  state.write_bytes(b'preserved legacy data')
  pool=AccountWorkers([Account('legacy','deriv',1,'SimulationOnly')],self.root)
  try:
   result=pool.dispatch(payload())
   self.assertFalse(result['success']);self.assertFalse(result['retriable'])
  finally:pool.close()
  self.assertEqual(state.read_bytes(),b'preserved legacy data')
  self.assertFalse((root/'account-binding.json').exists())

 def test_all_broker_workers_recover_from_disconnect_and_serialize_duplicate_retries(self):
  from dataclasses import replace
  from account_workers import BROKERS
  accounts=[Account('recover-'+broker,broker,i+1,'SimulationOnly',disconnected=True) for i,broker in enumerate(BROKERS)]
  pool=AccountWorkers(accounts,self.root)
  try:
   for account in accounts:
    result=pool.dispatch(payload(account.login,revision=2))
    self.assertFalse(result['success']);self.assertTrue(result['retriable'])
    self.assertFalse(result['submission_started'])
  finally:pool.close()
  pool=AccountWorkers([replace(account,disconnected=False) for account in accounts],self.root)
  try:
   for account in accounts:
    self.assertFalse(pool.dispatch(payload(account.login,revision=1))['success'])
    self.assertFalse(pool.dispatch(payload(account.login,revision=2,target=.2))['success'])
   with ThreadPoolExecutor(10) as executor:
    results=list(executor.map(pool.dispatch,[payload(account.login,revision=2) for account in accounts for _ in range(4)]))
   self.assertTrue(all(result['success'] for result in results))
  finally:pool.close()
  for account in accounts:
   with sqlite3.connect(self.root/account.id/'simulated-broker.sqlite3') as db:
    self.assertEqual(db.execute('SELECT count(*) FROM fills').fetchone()[0],1)
    self.assertAlmostEqual(db.execute('SELECT sum(volume) FROM positions').fetchone()[0],.1)

 def test_gateway_reports_retryable_disconnect_without_blocking_another_account(self):
  from dataclasses import replace
  from fastapi.testclient import TestClient
  from account_gateway import create_app
  accounts=[Account('offline','deriv',1,'SimulationOnly',disconnected=True),Account('online','exness',2,'SimulationOnly')]
  headers={'Authorization':'Bearer '+'a'*64}
  with TestClient(create_app(accounts,self.root,'a'*64)) as client:
   result=client.post('/observer/sync-position',headers=headers,json=payload(1).model_dump(mode='json'))
   self.assertEqual(result.status_code,503);self.assertTrue(result.json()['retriable'])
   self.assertFalse(result.json()['submission_started'])
   result=client.post('/observer/sync-position',headers=headers,json=payload(2).model_dump(mode='json'))
   self.assertEqual(result.status_code,200);self.assertTrue(result.json()['success'])
  with TestClient(create_app([replace(a,disconnected=False) for a in accounts],self.root,'a'*64)) as client:
   for login in (1,2):
    for attempt in range(2):
     result=client.post('/observer/sync-position',headers=headers,json=payload(login).model_dump(mode='json'))
     self.assertTrue(result.json()['success'])
  for account in accounts:
   with sqlite3.connect(self.root/account.id/'simulated-broker.sqlite3') as db:
    self.assertEqual(db.execute('SELECT count(*) FROM fills').fetchone()[0],1)
