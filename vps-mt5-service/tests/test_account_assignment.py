"""Durable in-root account assignment; no cross-host/global lock claim."""
from contextlib import closing
from dataclasses import replace
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest
import test_account_workers as fixture


class AssignmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.original=fixture.Account('original','xm',1,'SimulationOnly')
    def execute(self,accounts,payload):
        pool=fixture.AccountWorkers(accounts,self.root,timeout=3)
        try:return pool.dispatch(payload)
        finally:pool.close()
    def uncertain_original(self):
        result=self.execute([replace(self.original,crash_after_commit=True)],fixture.payload())
        self.assertTrue(result['uncertain']);self.assertFalse(result['retriable'])
    def original_phase(self):
        with closing(sqlite3.connect(self.root/'original/observer-journal.sqlite3')) as db:
            return db.execute('SELECT phase FROM allocations').fetchone()[0]
    def unchanged_files(self):
        return {str(p.relative_to(self.root)):hashlib.sha256(p.read_bytes()).hexdigest()
                for p in (self.root/'original').iterdir() if p.is_file()}
    def test_renamed_alias_cannot_bypass_unresolved_original_journal(self):
        self.uncertain_original();before=self.unchanged_files()
        result=self.execute([replace(self.original,id='renamed')],fixture.payload(revision=2))
        self.assertFalse(result['success']);self.assertFalse(result['retriable'])
        self.assertFalse((self.root/'renamed').exists());self.assertEqual(self.original_phase(),'dispatching')
        self.assertEqual(self.unchanged_files(),before)
    def test_completed_account_assignment_is_not_silently_recreated_under_new_alias(self):
        self.assertTrue(self.execute([self.original],fixture.payload())['success'])
        before=self.unchanged_files()
        result=self.execute([replace(self.original,id='renamed')],fixture.payload(revision=2))
        self.assertFalse(result['success']);self.assertFalse((self.root/'renamed').exists())
        self.assertEqual(self.unchanged_files(),before)
    def test_unbound_other_directory_cannot_be_treated_as_unused_account(self):
        legacy=self.root/'unknown';legacy.mkdir();(legacy/'observer-journal.sqlite3').write_bytes(b'unknown uncertain history')
        result=self.execute([self.original],fixture.payload())
        self.assertFalse(result['success']);self.assertFalse((self.root/'original').exists())
        self.assertEqual((legacy/'observer-journal.sqlite3').read_bytes(),b'unknown uncertain history')
    def test_malformed_other_assignment_fails_closed_without_repair(self):
        legacy=self.root/'unknown';legacy.mkdir();marker=legacy/'account-binding.json';marker.write_text('{')
        result=self.execute([self.original],fixture.payload())
        self.assertFalse(result['success']);self.assertFalse((self.root/'original').exists());self.assertEqual(marker.read_text(),'{')
    def test_conflicting_alias_does_not_block_different_known_account(self):
        self.uncertain_original();renamed=replace(self.original,id='renamed')
        other=replace(self.original,id='independent',login=2)
        pool=fixture.AccountWorkers([renamed,other],self.root,timeout=3)
        try:
            self.assertFalse(pool.dispatch(fixture.payload(revision=2))['success'])
            self.assertTrue(pool.dispatch(fixture.payload(login=2))['success'])
        finally:pool.close()
        self.assertEqual(self.original_phase(),'dispatching');self.assertFalse((self.root/'renamed').exists())
