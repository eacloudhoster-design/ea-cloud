"""Offline host/link/authority simulation, not distributed or native OS acceptance."""
import json
import multiprocessing as mp
from pathlib import Path
import secrets
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from shared_lease_simulation import (SharedAuthority,SimulatedHost,SimulatedLink,prepare_authority,
                                    SharedEnvelope,AuthorityError,TTL_MS,MAX_ROWS,touch_private,FencedEngine)
from private_ipc import Binding,canonical,sign,verify
from sdk_ipc_candidate import wall_ms


def binding(**changes):
    return Binding.model_validate(dict(dict(simulation=True,tenant='tenant',account='client',
        broker='justmarkets',login=1,server='SimulationOnly'),**changes))


def target(**changes):
    return dict(dict(login=1,server='SimulationOnly',sourceKey='a'*64,revision=1,symbol='EURUSD',
                     target=.1,sl=0.,tp=0.,maxVolume=1.),**changes)


class Clock:
    def __init__(self):self.now=1000000
    def __call__(self):return self.now
    def monotonic(self):return self.now/1000
    def advance(self,ms):self.now+=ms


def crashed_authority(root,profile,key):
    authority=SharedAuthority(root,worker_faults=dict(crash_after_fill=True))
    b=Binding.model_validate(profile);authority.register(b,key)
    client=SimulatedHost(SimulatedLink(authority),b,key,'crash-host')
    assert client.call('acquire')['success']
    client.call('sync',target())  # Existing mock exits 70 after the durable synthetic fill.
    raise RuntimeError('Expected process crash')


class SharedLeaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'authority';prepare_authority(self.root)
        self.clock=Clock();self.b=binding();self.key=secrets.token_bytes(32)
        self.authority=SharedAuthority(self.root,clock=self.clock,monotonic=self.clock.monotonic)
        self.addCleanup(lambda:self.authority.close())
        self.authority.register(self.b,self.key)
        self.a=self.host('host-one');self.bhost=self.host('host-two')

    def host(self,name,profile=None,key=None):
        return SimulatedHost(SimulatedLink(self.authority),profile or self.b,key or self.key,name,clock=self.clock)

    def mirror(self,stopped=False,profile=None):
        b=profile or self.b;p=self.authority.account_root(b)/'mock-stop.json'
        if not p.exists():touch_private(p)
        now=wall_ms();p.write_bytes(canonical(dict(simulation=True,binding=b.digest(),stopped=stopped,
                                                  observed_ms=now,expires_ms=now+3000)))

    def claim(self,host):
        reply=host.call('acquire');self.assertEqual(reply['code'],'LEASED',reply);return reply

    def fills(self,profile=None):
        p=self.authority.account_root(profile or self.b)/'simulated-broker.sqlite3'
        with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as db:
            if not db.execute("SELECT 1 FROM sqlite_master WHERE name='fills'").fetchone():return 0
            return db.execute('SELECT count(*) FROM fills').fetchone()[0]

    def restart(self):
        self.authority.close()
        self.authority=SharedAuthority(self.root,clock=self.clock,monotonic=self.clock.monotonic)
        self.authority.register(self.b,self.key)
        self.a.link.authority=self.authority;self.bhost.link.authority=self.authority

    def test_simultaneous_claims_have_exactly_one_winner(self):
        hosts=[self.host('host-'+str(n)) for n in range(8)];barrier=threading.Barrier(8)
        def claim(host):barrier.wait();return host.call('acquire')
        with ThreadPoolExecutor(max_workers=8) as pool:replies=list(pool.map(claim,hosts))
        self.assertEqual(sum(r['success'] for r in replies),1)
        self.assertTrue(all(r['code'] in ('LEASED','OWNER_CONFLICT') for r in replies))

    def test_same_host_other_controller_cannot_steal_live_lease(self):
        self.claim(self.a);other=self.host('host-one')
        self.assertEqual(other.call('acquire')['code'],'OWNER_CONFLICT')

    def test_expired_owner_and_stale_fence_rejected(self):
        self.claim(self.a);old=self.a.epoch;self.clock.advance(TTL_MS)
        self.assertEqual(self.a.call('status')['code'],'LEASE_INVALID')
        self.claim(self.bhost);self.assertGreater(self.bhost.epoch,old)
        self.mirror();self.assertEqual(self.a.call('sync',target())['code'],'LEASE_INVALID')
        self.assertEqual(self.fills(),0)

    def test_renewal_keeps_epoch_and_extends_only_current_grant(self):
        self.claim(self.a);epoch=self.a.epoch;self.clock.advance(1000)
        self.assertEqual(self.a.call('renew')['code'],'RENEWED');self.assertEqual(self.a.epoch,epoch)
        self.clock.advance(1500);self.assertTrue(self.a.call('status')['success'])
        self.assertEqual(self.bhost.call('acquire')['code'],'OWNER_CONFLICT')
        self.clock.advance(501);self.assertEqual(self.a.call('renew')['code'],'LEASE_INVALID')

    def test_wrong_token_controller_host_or_generation_is_denied(self):
        self.claim(self.a)
        original=(self.a.token,self.a.controller,self.a.host,self.a.epoch)
        for field,value in (('token','0'*64),('controller','0'*32),('host','other-host'),('epoch',0)):
            setattr(self.a,field,value)
            self.assertEqual(self.a.call('sync',target())['code'],'LEASE_INVALID')
            self.a.token,self.a.controller,self.a.host,self.a.epoch=original
        self.assertEqual(self.fills(),0)

    def test_host_handoff_uses_same_account_positions_and_reconciliation(self):
        self.claim(self.a);self.mirror()
        self.assertTrue(self.a.call('sync',target())['success']);self.assertEqual(self.fills(),1)
        self.clock.advance(TTL_MS+1);self.claim(self.bhost);self.mirror()
        self.assertTrue(self.bhost.call('sync',target(revision=2))['success'])
        self.assertEqual(self.fills(),1)  # No cloned per-host SDK state or duplicate opening.
        self.assertTrue(self.bhost.call('sync',target(revision=3,target=0.))['success'])
        self.assertEqual(self.fills(),2)

    def test_same_request_receipt_survives_host_handoff(self):
        self.claim(self.a);self.mirror();rid='a'*32
        first=self.a.call('sync',target(),request_id=rid);self.assertTrue(first['success'])
        self.clock.advance(TTL_MS+1);self.claim(self.bhost);self.mirror()
        cached=self.bhost.call('sync',target(),request_id=rid)
        self.assertEqual(cached,first);self.assertEqual(self.fills(),1)

    def test_same_id_different_payload_is_rejected_across_hosts(self):
        self.claim(self.a);self.mirror();rid='a'*32
        self.assertTrue(self.a.call('sync',target(),request_id=rid)['success'])
        self.clock.advance(TTL_MS+1);self.claim(self.bhost);self.mirror()
        self.assertEqual(self.bhost.call('sync',target(target=.2),request_id=rid)['code'],'IDEMPOTENCY_CONFLICT')
        self.assertEqual(self.fills(),1)

    def test_exact_signed_request_replay_rejected(self):
        self.claim(self.a);self.mirror();request,frame=self.a.frame('sync',target())
        self.assertTrue(verify(self.authority.handle(frame),self.key,'response')['result']['success'])
        self.assertEqual(verify(self.authority.handle(frame),self.key,'response')['result']['code'],'REPLAY')
        self.assertEqual(self.fills(),1)

    def test_replay_nonce_remains_rejected_after_authority_restart(self):
        self.claim(self.a);request,frame=self.a.frame('status')
        self.authority.handle(frame);self.restart()
        self.assertEqual(verify(self.authority.handle(frame),self.key,'response')['result']['code'],'REPLAY')

    def test_restart_invalidates_old_grants_and_never_reuses_fence(self):
        self.claim(self.a);epoch=self.a.epoch;self.restart()
        self.assertEqual(self.a.call('sync',target())['code'],'LEASE_INVALID')
        self.claim(self.bhost);self.assertGreater(self.bhost.epoch,epoch)

    def test_partition_before_dispatch_never_executes(self):
        self.claim(self.a);self.mirror();self.a.link.partitioned=True
        reply=self.a.call('sync',target());self.assertFalse(reply['success']);self.assertTrue(reply['uncertain'])
        self.assertEqual(self.fills(),0)
        self.assertFalse(self.authority.db.execute('SELECT 1 FROM commands').fetchone())

    def test_partitioned_old_host_cannot_execute_after_new_owner_claims(self):
        self.claim(self.a);self.a.link.partitioned=True;self.clock.advance(TTL_MS+1)
        self.claim(self.bhost);self.mirror();self.a.link.partitioned=False
        self.assertEqual(self.a.call('sync',target())['code'],'LEASE_INVALID')
        self.assertTrue(self.bhost.call('sync',target())['success']);self.assertEqual(self.fills(),1)

    def test_lost_reply_is_uncertain_but_explicit_duplicate_does_not_fill_again(self):
        self.claim(self.a);self.mirror();self.a.link.drop_reply=True;rid='a'*32
        reply=self.a.call('sync',target(),request_id=rid);self.assertTrue(reply['uncertain'])
        self.assertEqual(self.fills(),1);self.a.link.drop_reply=False
        self.assertTrue(self.a.call('sync',target(),request_id=rid)['success']);self.assertEqual(self.fills(),1)

    def test_forged_reply_is_not_treated_as_permission_or_success(self):
        self.a.link.corrupt_reply=True
        self.assertFalse(self.a.call('acquire')['success']);self.assertEqual(self.a.epoch,0)
        self.assertEqual(self.fills(),0)

    def test_authority_outage_denies_claim_renew_status_and_execute(self):
        self.claim(self.a);self.mirror();self.authority.available=False
        for operation in ('acquire','renew','status','sync'):
            reply=self.a.call(operation,target() if operation=='sync' else None)
            self.assertEqual(reply['code'],'AUTHORITY_UNAVAILABLE');self.assertTrue(reply['uncertain'])
        self.assertEqual(self.fills(),0)

    def test_outage_during_mock_send_delay_blocks_fill_and_latches_hold(self):
        self.authority.worker_faults=self.authority.worker_faults.model_copy(update=dict(before_send_ms=200))
        self.claim(self.a);self.mirror();timer=threading.Timer(.05,lambda:setattr(self.authority,'available',False));timer.start()
        try:reply=self.a.call('sync',target())
        finally:timer.join(1)
        self.assertFalse(reply['success']);self.assertEqual(self.fills(),0)
        self.authority.available=True
        self.assertEqual(self.authority._row(self.b.digest())['held'],1)

    def test_expiry_during_execution_prevents_mock_fill(self):
        self.authority.worker_faults=self.authority.worker_faults.model_copy(update=dict(before_send_ms=200))
        self.claim(self.a);self.mirror();timer=threading.Timer(.05,lambda:self.clock.advance(TTL_MS+1));timer.start()
        try:reply=self.a.call('sync',target())
        finally:timer.join(1)
        self.assertFalse(reply['success']);self.assertEqual(self.fills(),0)
        self.claim(self.bhost);self.assertEqual(self.bhost.call('sync',target())['code'],'HELD')

    def test_new_owner_cannot_claim_while_old_sink_operation_is_inflight(self):
        self.claim(self.a);self.mirror();entered=threading.Event();release=threading.Event()
        original=FencedEngine._sync
        def paused(engine,*args):
            entered.set()
            if not release.wait(2):raise RuntimeError('Barrier timeout')
            return original(engine,*args)
        with patch.object(FencedEngine,'_sync',paused),ThreadPoolExecutor(max_workers=1) as pool:
            task=pool.submit(self.a.call,'sync',target())
            try:
                self.assertTrue(entered.wait(2));self.clock.advance(TTL_MS+1)
                reply=self.bhost.call('acquire')
                self.assertFalse(reply['success']);self.assertEqual(reply['code'],'AUTHORITY_UNAVAILABLE')
            finally:release.set()
            self.assertFalse(task.result(timeout=3)['success'])
        self.assertEqual(self.fills(),0)

    def test_emergency_stop_overrides_valid_and_newly_changed_owner(self):
        self.claim(self.a);self.mirror(True)
        self.assertEqual(self.a.call('sync',target())['code'],'STOPPED')
        self.clock.advance(TTL_MS+1);self.claim(self.bhost)
        self.assertEqual(self.bhost.call('sync',target())['code'],'STOPPED');self.assertEqual(self.fills(),0)

    def test_missing_stale_wrong_binding_and_unreadable_stop_are_closed(self):
        self.claim(self.a)
        self.assertEqual(self.a.call('sync',target())['code'],'STOPPED')
        self.mirror();p=self.authority.account_root(self.b)/'mock-stop.json'
        p.write_text('{}');self.assertEqual(self.a.call('sync',target())['code'],'STOPPED')
        self.assertEqual(self.fills(),0)

    def test_stop_during_owner_execution_holds_even_after_clear_and_handoff(self):
        self.authority.worker_faults=self.authority.worker_faults.model_copy(update=dict(before_send_ms=200))
        self.claim(self.a);self.mirror();timer=threading.Timer(.05,lambda:self.mirror(True));timer.start()
        try:self.assertFalse(self.a.call('sync',target())['success'])
        finally:timer.join(1)
        self.clock.advance(TTL_MS+1);self.claim(self.bhost);self.mirror(False)
        self.assertEqual(self.bhost.call('sync',target())['code'],'HELD');self.assertEqual(self.fills(),0)

    def test_two_tenants_independent_account_states_and_fence_counters(self):
        other=binding(tenant='other',account='second',login=2);key=secrets.token_bytes(32)
        self.authority.register(other,key);client=self.host('host-three',other,key)
        self.claim(self.a);self.claim(client);self.mirror();self.mirror(profile=other)
        self.assertTrue(self.a.call('sync',target())['success'])
        self.assertTrue(client.call('sync',target(login=2))['success'])
        self.assertEqual(self.fills(),1);self.assertEqual(self.fills(other),1)
        self.assertNotEqual(self.authority.account_root(self.b),self.authority.account_root(other))

    def test_same_physical_account_cannot_be_registered_under_other_tenant(self):
        with self.assertRaises(AuthorityError):self.authority.register(binding(tenant='other'),secrets.token_bytes(32))

    def test_wrong_key_or_cross_account_binding_cannot_claim(self):
        bad=self.host('host-three',key=secrets.token_bytes(32))
        self.assertFalse(bad.call('acquire')['success'])
        self.assertFalse(self.authority.db.execute('SELECT 1 FROM nonces').fetchone())

    def test_wrong_login_in_authenticated_body_cannot_execute(self):
        self.claim(self.a);self.mirror()
        self.assertEqual(self.a.call('sync',target(login=2))['code'],'IDENTITY_MISMATCH')
        self.assertEqual(self.fills(),0)

    def test_clock_reversal_latches_hold_and_never_reauthorizes_execution(self):
        self.claim(self.a);self.clock.advance(-1)
        self.assertEqual(self.a.call('status')['code'],'AUTHORITY_CLOCK_REVERSED')
        self.clock.advance(TTL_MS+2);self.claim(self.bhost);self.mirror()
        self.assertEqual(self.bhost.call('sync',target())['code'],'HELD')

    def test_client_clock_skew_cannot_expire_server_lease_early(self):
        self.claim(self.a);bad=self.host('host-three');bad.clock=lambda:self.clock()+10000
        self.assertFalse(bad.call('acquire')['success'])
        self.assertEqual(self.bhost.call('acquire')['code'],'OWNER_CONFLICT')

    def test_audit_failure_rolls_back_claim(self):
        before=self.authority._row(self.b.digest())['epoch']
        with patch.object(self.authority,'_audit',side_effect=OSError):self.assertFalse(self.a.call('acquire')['success'])
        self.assertEqual(self.authority._row(self.b.digest())['epoch'],before)
        self.claim(self.bhost)

    def test_audit_failure_after_fill_leaves_processing_command_and_hold(self):
        self.claim(self.a);self.mirror();original=self.authority._audit
        def failure(event,*args):
            if event=='COMPLETED':raise OSError('fixture audit outage')
            return original(event,*args)
        with patch.object(self.authority,'_audit',side_effect=failure):reply=self.a.call('sync',target())
        self.assertTrue(reply['uncertain']);self.assertEqual(self.fills(),1)
        self.assertEqual(self.authority.db.execute('SELECT phase FROM commands').fetchone()[0],'processing')
        self.restart();self.claim(self.bhost)
        self.assertEqual(self.bhost.call('sync',target())['code'],'HELD');self.assertEqual(self.fills(),1)

    def test_audit_redacts_keys_tokens_and_raw_controller_host_names(self):
        self.claim(self.a);self.a.call('renew')
        rows=self.authority.db.execute('SELECT event,binding,host_ref,controller_ref,epoch FROM audit').fetchall()
        text=json.dumps([tuple(r) for r in rows])
        self.assertNotIn(self.key.hex(),text);self.assertNotIn(self.a.token,text)
        self.assertNotIn(self.a.controller,text);self.assertNotIn(self.a.host,text)
        self.assertIn('CLAIMED',text);self.assertIn('RENEWED',text)

    def test_second_authority_instance_is_refused(self):
        with self.assertRaises(ValueError):SharedAuthority(self.root)

    def test_closed_old_authority_cannot_close_new_owner(self):
        old=self.authority;self.restart();old.close();self.claim(self.bhost)
        self.assertTrue(self.bhost.call('status')['success'])

    def test_missing_authority_database_never_recreated(self):
        self.authority.close();(self.root/'authority.sqlite3').unlink()
        with self.assertRaises(FileNotFoundError):SharedAuthority(self.root)
        self.assertFalse((self.root/'authority.sqlite3').exists())

    def test_missing_fence_witness_never_recreated(self):
        p=self.authority.account_root(self.b)/'shared-fence.sqlite3';p.unlink()
        self.assertFalse(self.a.call('acquire')['success']);self.assertFalse(p.exists())

    def test_missing_sdk_account_file_never_recreated_during_execution(self):
        self.claim(self.a);self.mirror();p=self.authority.account_root(self.b)/'simulated-broker.sqlite3';p.unlink()
        self.assertFalse(self.a.call('sync',target())['success']);self.assertFalse(p.exists())

    def test_stale_central_counter_snapshot_rejected_by_independent_fence_witness(self):
        backup=Path(self.tmp.name)/'snapshot.sqlite3'
        with sqlite3.connect(backup) as copy:self.authority.db.backup(copy)
        self.claim(self.a);self.mirror();self.assertTrue(self.a.call('sync',target())['success'])
        self.clock.advance(TTL_MS+1);self.claim(self.bhost);self.mirror()
        self.assertTrue(self.bhost.call('sync',target(revision=2))['success'])
        self.authority.close();shutil.copyfile(backup,self.root/'authority.sqlite3')
        self.authority=SharedAuthority(self.root,clock=self.clock,monotonic=self.clock.monotonic)
        self.authority.register(self.b,self.key);client=self.host('host-four')
        self.assertEqual(client.call('acquire')['code'],'STALE_AUTHORITY_FENCE');self.assertEqual(self.fills(),1)

    def test_fence_integer_exhaustion_refuses_instead_of_wrapping(self):
        with self.authority.db:self.authority.db.execute('UPDATE accounts SET epoch=?',[2**63-2])
        self.assertFalse(self.a.call('acquire')['success'])

    def test_worker_process_crash_after_fill_never_duplicates_on_restart(self):
        self.mirror();self.authority.close()
        child=mp.get_context('spawn').Process(target=crashed_authority,args=(str(self.root),self.b.model_dump(),self.key))
        child.start();child.join(10)
        if child.is_alive():child.kill();child.join(2);self.fail('Crash fixture did not terminate')
        self.assertEqual(child.exitcode,70);self.assertEqual(self.fills(),1)
        self.authority=SharedAuthority(self.root);self.authority.register(self.b,self.key)
        client=SimulatedHost(SimulatedLink(self.authority),self.b,self.key,'recovered-host')
        self.claim(client);self.assertEqual(client.call('sync',target())['code'],'HELD')
        self.assertEqual(self.fills(),1)

    def test_malformed_persistent_fence_is_refused_without_repair(self):
        with self.authority.db:self.authority.db.execute('UPDATE accounts SET epoch=-1')
        self.assertEqual(self.a.call('acquire')['code'],'LEASE_STATE_INVALID')
        self.assertEqual(self.authority.db.execute('SELECT epoch FROM accounts').fetchone()[0],-1)

    def test_tenant_nonce_capacity_does_not_exhaust_other_account(self):
        other=binding(tenant='other',account='second',login=2);key=secrets.token_bytes(32)
        self.authority.register(other,key);client=self.host('host-three',other,key)
        with self.authority.db:
            self.authority.db.executemany('INSERT INTO nonces VALUES(?,?)',[(self.b.digest(),str(i)) for i in range(MAX_ROWS)])
        self.assertEqual(self.a.call('acquire')['code'],'REPLAY_STORAGE_FULL')
        self.claim(client)

    def test_audit_capacity_failure_never_issues_a_lease(self):
        with self.authority.db:
            self.authority.db.executemany('INSERT INTO audit(event,binding,epoch,observed_ms) VALUES(?,?,0,0)',
                [('REGISTERED',self.b.digest())]*MAX_ROWS)
        self.assertFalse(self.a.call('acquire')['success'])
        self.assertEqual(self.authority._row(self.b.digest())['epoch'],0)

    def test_cached_receipt_is_not_an_emergency_stop_bypass(self):
        self.claim(self.a);self.mirror();rid='f'*32
        self.assertTrue(self.a.call('sync',target(),request_id=rid)['success'])
        self.mirror(True)
        self.assertEqual(self.a.call('sync',target(),request_id=rid)['code'],'STOPPED')
        self.assertEqual(self.fills(),1)

    def test_unknown_service_identity_cannot_operate_existing_account(self):
        self.a.service='0'*32
        self.assertFalse(self.a.call('acquire')['success'])
        self.assertEqual(self.authority._row(self.b.digest())['epoch'],0)

    def test_expired_or_other_account_stop_mirror_never_authorizes(self):
        self.claim(self.a);self.mirror();p=self.authority.account_root(self.b)/'mock-stop.json'
        data=json.loads(p.read_bytes());data['expires_ms']=0;p.write_bytes(canonical(data))
        self.assertEqual(self.a.call('sync',target())['code'],'STOPPED')
        self.mirror();data=json.loads(p.read_bytes());data['binding']='0'*64;p.write_bytes(canonical(data))
        self.assertEqual(self.a.call('sync',target())['code'],'STOPPED');self.assertEqual(self.fills(),0)

    def test_missing_completed_receipt_is_held_on_restart(self):
        self.claim(self.a);self.mirror();self.assertTrue(self.a.call('sync',target())['success'])
        with self.authority.db:self.authority.db.execute('UPDATE commands SET response=NULL')
        self.restart();self.claim(self.bhost)
        self.assertEqual(self.bhost.call('sync',target())['code'],'HELD');self.assertEqual(self.fills(),1)

    def test_malformed_cached_safety_flags_latch_hold(self):
        self.claim(self.a);self.mirror();rid='a'*32
        reply=self.a.call('sync',target(),request_id=rid);self.assertTrue(reply['success'])
        reply['financial_execution']=True
        with self.authority.db:self.authority.db.execute('UPDATE commands SET response=?',[json.dumps(reply)])
        self.assertEqual(self.a.call('sync',target(),request_id=rid)['code'],'HELD');self.assertEqual(self.fills(),1)

    def test_credential_or_backend_fields_never_reach_mock_execution(self):
        self.claim(self.a);self.mirror()
        for name in ('password','backend','root'):
            self.assertFalse(self.a.call('sync',target(**{name:'forbidden'}))['success'])
        self.assertEqual(self.fills(),0)

    def test_corrupt_registry_descriptor_cannot_redirect_another_tenant_account(self):
        other=binding(tenant='other',account='second',login=2);key=secrets.token_bytes(32)
        self.authority.register(other,key);client=self.host('host-three',other,key)
        with self.authority.db:
            self.authority.db.execute('UPDATE accounts SET descriptor=? WHERE binding=?',
                [canonical(other.model_dump()).decode(),self.b.digest()])
        self.assertEqual(self.a.call('acquire')['code'],'ACCOUNT_REGISTRY_INVALID')
        self.claim(client);self.assertEqual(self.fills(),0);self.assertEqual(self.fills(other),0)

    def test_command_expiry_before_lease_expiry_blocks_mock_fill(self):
        self.authority.worker_faults=self.authority.worker_faults.model_copy(update=dict(before_send_ms=200))
        self.claim(self.a);self.mirror();request,_=self.a.frame('sync',target())
        request=request.model_copy(update=dict(deadline_ms=self.clock()+50))
        timer=threading.Timer(.05,lambda:self.clock.advance(100));timer.start()
        try:reply=verify(self.authority.handle(sign(request.model_dump(),self.key)),self.key,'response')['result']
        finally:timer.join(1)
        self.assertFalse(reply['success']);self.assertEqual(self.fills(),0)

    def test_account_capability_cannot_be_reused_for_another_tenant(self):
        other=binding(tenant='other',account='second',login=2)
        with self.assertRaises(AuthorityError):self.authority.register(other,self.key)
        self.assertFalse(self.authority.account_root(other).exists())


if __name__=='__main__':unittest.main(verbosity=2)
