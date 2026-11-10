"""Offline signed preparation grants. No actual issuer, SDK or credential loader."""
import hashlib
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_mt5_readonly_preparation import config
from mt5_readonly_preparation import PrivateMt5Configuration,SdkAccessDisabled
from mt5_bootstrap_preparation import (BootstrapPreparationVerifier,BootstrapRejected,
    PreparationGrant,provision_preparation)
from private_ipc import sign,canonical,Envelope,verify


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'bootstrap';self.key=secrets.token_bytes(32)
        self.assignment=dict(gateway_id='a'*32,configuration=config())
        self.cfg=PrivateMt5Configuration.model_validate(config());self.challenge='b'*64;self.now=100000
        self.boundary=dict(configuration_digest=self.cfg.digest(),credential_ref=self.cfg.credential_ref)
        self.blocked=False;self.verifiers=[];self.addCleanup(self.cleanup)
        provision_preparation(self.root,self.assignment,self.key)

    def cleanup(self):
        for verifier in self.verifiers:verifier.close()

    def verifier(self,**changes):
        options=dict(root=self.root,assignment=self.assignment,verification_key=self.key,
            credential_boundary=self.boundary,clock=lambda:self.now,safety_gate=lambda:self.blocked)
        options.update(changes);verifier=BootstrapPreparationVerifier(**options);self.verifiers.append(verifier);self.challenge=verifier.challenge;return verifier

    def grant(self,**changes):
        data=dict(protocol='mt5-bootstrap-preparation-v1',purpose='prepare-readonly-metadata',
            authorization_id=secrets.token_hex(16),configuration_digest=self.cfg.digest(),gateway_id='a'*32,
            challenge=self.challenge,issued_ms=self.now,expires_ms=self.now+10000)
        data.update(changes);return data

    def frame(self,**changes):return sign(self.grant(**changes),self.key)

    def test_valid_bound_bootstrap_prepares_existing_session_without_real_access(self):
        verifier=self.verifier()
        session,receipt=verifier.consume(self.frame())
        self.assertTrue(receipt['preparation_authorized']);self.assertFalse(receipt['sdk_access_authorized'])
        self.assertFalse(receipt['credential_delivery_verified']);self.assertFalse(receipt['financial_execution'])
        self.assertEqual(session.configuration,self.cfg);self.assertFalse(session.status['connected'])
        with self.assertRaises(SdkAccessDisabled):session.connect()
        with self.assertRaises(SdkAccessDisabled):session.send({})
        self.assertNotIn('MetaTrader5',sys.modules)
        with self.assertRaises(AttributeError):verifier.assignment={'gateway_id':'c'*32}
        with self.assertRaises(AttributeError):verifier.binding='c'*64
        with self.assertRaises(ValueError):verifier.assignment.configuration.login=2


    def test_missing_unsigned_wrong_key_and_execution_grants_are_refused(self):
        verifier=self.verifier()
        for frame in (None,b'',canonical(self.grant()),sign(self.grant(),secrets.token_bytes(32)),self.frame(purpose='connect'),self.frame(purpose='trade')):
            with self.subTest(frame_type=type(frame).__name__),self.assertRaises(BootstrapRejected):verifier.consume(frame)
        self.assertEqual(verifier.db.execute('SELECT count(*) FROM consumed').fetchone()[0],0)

    def test_expired_future_and_overlong_grants_refused(self):
        verifier=self.verifier()
        for changes in (dict(issued_ms=self.now-10000,expires_ms=self.now),dict(issued_ms=self.now+1),dict(expires_ms=self.now+60001),dict(issued_ms=True)):
            with self.subTest(changes=changes),self.assertRaises(BootstrapRejected):verifier.consume(self.frame(**changes))

    def test_account_gateway_configuration_and_challenge_cannot_be_switched(self):
        verifier=self.verifier()
        for changes in (dict(configuration_digest='c'*64),dict(gateway_id='d'*32),dict(challenge='e'*64),dict(password='private-leak-fixture'),dict(terminal_path=r'C:\other\terminal.exe')):
            with self.subTest(fields=list(changes)),self.assertRaises(BootstrapRejected):verifier.consume(self.frame(**changes))

    def test_replay_rejected_within_process_and_after_restart(self):
        verifier=self.verifier();frame=self.frame();verifier.consume(frame)
        with self.assertRaisesRegex(BootstrapRejected,'REPLAYED'):verifier.consume(frame)
        verifier.close();recovered=self.verifier()
        # A previous startup's grant cannot be used for the new startup challenge.
        with self.assertRaises(BootstrapRejected):recovered.consume(frame)
        replay=self.grant()
        # Reusing the authorization ID is refused even with a newly signed challenge.
        from private_ipc import verify
        replay['authorization_id']=verify(frame,self.key)['authorization_id']
        with self.assertRaisesRegex(BootstrapRejected,'REPLAYED'):recovered.consume(sign(replay,self.key))
        recovered.consume(self.frame())
        self.assertEqual(recovered.db.execute('SELECT count(*) FROM consumed').fetchone()[0],2)

    def test_restart_conflicting_assignment_or_verifier_key_cannot_adopt_ledger(self):
        for change in (dict(assignment={**self.assignment,'gateway_id':'c'*32}),dict(assignment={**self.assignment,'configuration':config(login=2)}),dict(verification_key=secrets.token_bytes(32))):
            with self.subTest(change=list(change)),self.assertRaises(BootstrapRejected):self.verifier(**change)
        self.verifier().consume(self.frame())

    def test_only_one_private_consumer_can_own_ledger(self):
        verifier=self.verifier()
        with self.assertRaises(BootstrapRejected):self.verifier()
        verifier.close();self.verifier().consume(self.frame())

    def test_missing_ledger_witness_and_schema_are_not_rebuilt(self):
        for name in ('bootstrap.sqlite3','installation.json'):
            path=self.root/name;original=path.read_bytes();path.unlink()
            with self.subTest(name=name),self.assertRaises(BootstrapRejected):self.verifier()
            self.assertFalse(path.exists());path.write_bytes(original);path.chmod(0o600)
        verifier=self.verifier();verifier.db.execute('DROP TABLE consumed');verifier.db.commit();verifier.close()
        with self.assertRaises(BootstrapRejected):self.verifier()

    def test_no_secret_in_receipt_ledger_or_rejection_message(self):
        verifier=self.verifier();frame=self.frame(password='private-leak-fixture')
        with self.assertRaises(BootstrapRejected) as error:verifier.consume(frame)
        self.assertNotIn('private-leak-fixture',str(error.exception))
        session,receipt=verifier.consume(self.frame())
        for private in ('broker-password',self.challenge,self.key.hex(),'FixtureDemo'):
            self.assertNotIn(private,str(receipt));self.assertNotIn(private,(self.root/'bootstrap.sqlite3').read_bytes().decode('latin1'))
        self.assertEqual(session.configuration.credential_ref,'broker-password')

    def test_private_credential_requirement_is_mandatory_and_never_delivers_password(self):
        for boundary in (None,{},dict(configuration_digest='c'*64,credential_ref='broker-password'),{**self.boundary,'password':'private-leak-fixture'}):
            with self.assertRaises(BootstrapRejected) as error:self.verifier(credential_boundary=boundary)
            self.assertNotIn('private-leak-fixture',str(error.exception))
        self.assertNotIn('password',PreparationGrant.model_fields)

    def test_active_unknown_exceptional_safety_state_blocks_without_clearing_it(self):
        verifier=self.verifier()
        for blocked in (True,None,0,1):
            self.blocked=blocked
            with self.assertRaises(BootstrapRejected):verifier.consume(self.frame())
            self.assertIs(self.blocked,blocked)
        def unavailable():raise OSError('private-leak-fixture')
        verifier.close();verifier=self.verifier(safety_gate=unavailable)
        with self.assertRaises(BootstrapRejected) as error:verifier.consume(self.frame())
        self.assertNotIn('private-leak-fixture',str(error.exception))
        self.assertEqual(verifier.db.execute('SELECT count(*) FROM consumed').fetchone()[0],0)

    def test_safety_change_after_commit_burns_grant_without_returning_session(self):
        checks=iter([False,False,True]);verifier=self.verifier(safety_gate=lambda:next(checks))
        frame=self.frame()
        with self.assertRaises(BootstrapRejected):verifier.consume(frame)
        verifier.close();recovered=self.verifier()
        replay=self.grant(authorization_id=verify(frame,self.key)['authorization_id'])
        with self.assertRaisesRegex(BootstrapRejected,'REPLAYED'):recovered.consume(sign(replay,self.key))

    def test_clock_rollback_and_expiry_during_validation_fail_closed(self):
        verifier=self.verifier();verifier.consume(self.frame());self.now-=1
        with self.assertRaisesRegex(BootstrapRejected,'CLOCK_ROLLBACK'):verifier.consume(self.frame())
        verifier.close();self.now=100000;times=iter([100000,110000])
        verifier=self.verifier(clock=lambda:next(times))
        with self.assertRaises(BootstrapRejected):verifier.consume(self.frame())
        self.assertEqual(verifier.db.execute('SELECT count(*) FROM consumed').fetchone()[0],1)

    def test_provisioning_never_resets_existing_state_or_holds(self):
        before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.iterdir()}
        with self.assertRaises(BootstrapRejected):provision_preparation(self.root,self.assignment,self.key)
        self.assertEqual(before,{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.iterdir()})
        verifier=self.verifier();verifier.db.execute('CREATE TABLE safety_hold(value INTEGER)');verifier.db.execute('INSERT INTO safety_hold VALUES(1)');verifier.db.commit()
        verifier.consume(self.frame())
        self.assertEqual(verifier.db.execute('SELECT value FROM safety_hold').fetchall(),[(1,)])

    def test_reference_ledger_does_not_claim_native_windows_support(self):
        root=Path(self.temp.name)/'native-not-provisioned'
        with patch.object(sys,'platform','win32'),self.assertRaises(BootstrapRejected):
            provision_preparation(root,self.assignment,self.key)
        self.assertFalse(root.exists())

    def test_bootstrap_authorization_is_not_an_execution_ipc_message(self):
        with self.assertRaises(ValueError):Envelope.model_validate(self.grant())
        verifier=self.verifier();verifier.close()
        with self.assertRaises(BootstrapRejected):verifier.consume(self.frame())
