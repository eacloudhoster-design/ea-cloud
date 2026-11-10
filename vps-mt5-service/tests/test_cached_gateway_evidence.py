"""Regression for cached success after loss of supporting execution journals."""
import secrets
import sqlite3
import unittest
from contextlib import closing
import test_shared_lease_simulation as fixture
target=fixture.target


class CachedEvidenceTests(unittest.TestCase):
    setUp=fixture.SharedLeaseTests.setUp
    host=fixture.SharedLeaseTests.host
    claim=fixture.SharedLeaseTests.claim
    mirror=fixture.SharedLeaseTests.mirror

    def completed(self):
        self.claim(self.a);self.mirror();self.rid=secrets.token_hex(16)
        self.assertTrue(self.a.call('sync',target(),request_id=self.rid)['success'])
        self.account=self.authority.account_root(self.b)

    def held_retry(self):
        reply=self.a.call('sync',target(),request_id=self.rid)
        self.assertEqual(reply['code'],'HELD');self.assertTrue(reply['uncertain'])
        self.assertTrue(self.authority._row(self.b.digest())['held'])

    def mutate(self,name,sql,args=()):
        with closing(sqlite3.connect(self.account/name)) as db:
            with db:db.execute(sql,args)

    def test_missing_sdk_journal_never_acknowledged_or_recreated(self):
        self.completed();path=self.account/'simulated-broker.sqlite3';path.unlink()
        self.held_retry();self.assertFalse(path.exists())

    def test_missing_observer_journal_never_acknowledged_or_recreated(self):
        self.completed();path=self.account/'observer.sqlite3';path.unlink()
        self.held_retry();self.assertFalse(path.exists())

    def test_incomplete_sdk_schema_never_reinitialized(self):
        self.completed();self.mutate('simulated-broker.sqlite3','DROP TABLE sdk_adapter_state')
        self.held_retry()
        with closing(sqlite3.connect(self.account/'simulated-broker.sqlite3')) as db:
            self.assertIsNone(db.execute("SELECT 1 FROM sqlite_master WHERE name='sdk_adapter_state'").fetchone())

    def test_existing_adapter_hold_overrides_cached_success(self):
        self.completed();self.mutate('simulated-broker.sqlite3','UPDATE sdk_adapter_state SET held=1')
        self.held_retry()

    def test_missing_worker_receipt_overrides_central_cached_success(self):
        self.completed();self.mutate('observer.sqlite3','DELETE FROM ipc_requests WHERE id=?',[self.rid])
        self.held_retry()

    def test_conflicting_worker_receipt_is_not_replayed(self):
        self.completed();self.mutate('observer.sqlite3',"UPDATE ipc_requests SET response='{}' WHERE id=?",[self.rid])
        self.held_retry()
