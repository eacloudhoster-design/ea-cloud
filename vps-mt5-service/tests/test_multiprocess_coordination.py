"""Spawned Linux clients and one existing serialized gateway over private pipes.

This is a test fixture, not a new service or distributed deployment. Execution
frames use the existing HMAC protocol unchanged. Control pipes are test-only.
"""
from contextlib import closing
import json
import multiprocessing as mp
from multiprocessing.connection import wait
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from private_ipc import Binding,canonical,verify
from shared_lease_simulation import SharedAuthority,SimulatedHost,prepare_authority
from history_authority_simulation import HistoryAuthority,prepare_history_authority
from synthetic_trade_history import HistoryBook
from sdk_ipc_candidate import wall_ms
from wine_worker_entry import install_offline_guard


def gateway(root,profiles,keys,history,channels,admin,hit,fault):
    install_offline_guard();authority=None
    try:
        authority=(HistoryAuthority if history else SharedAuthority)(root)
        for b,key in zip(profiles,keys):authority.register(Binding.model_validate(b),key)
        original=HistoryBook.execute
        def execute(book,command,command_id):
            if command.action!='fill' or not fault:return original(book,command,command_id)
            if fault=='after-commit':
                receipt=original(book,command,command_id);hit.set();os._exit(70)
            before=book.gate
            def gate():
                before()
                if book.db.in_transaction and book.db.execute('SELECT 1 FROM events WHERE command_id=?',[command_id]).fetchone():
                    hit.set()
                    # Bounded pause at the actual uncommitted final gate.
                    if not admin.poll(5):raise TimeoutError('Synthetic commit barrier')
                    raise RuntimeError('Unexpected commit barrier release')
            with patch.object(book,'gate',gate):return original(book,command,command_id)
        admin.send(dict(ready=True,pid=os.getpid(),service=authority.service))
        active=list(channels)
        with patch.object(HistoryBook,'execute',execute):
            while True:
                for channel in wait([admin,*active],timeout=5):
                    if channel is admin:
                        if admin.recv()=='close':return
                    else:
                        try:channel.send_bytes(authority.handle(channel.recv_bytes()))
                        except (EOFError,BrokenPipeError,OSError):
                            active.remove(channel);channel.close()
    except Exception as error:
        try:admin.send(dict(ready=False,error=type(error).__name__))
        except (EOFError,BrokenPipeError,OSError):pass
    finally:
        if authority:authority.close()


class PipeLink:
    def __init__(self,channel,service):self.channel=channel;self.authority=SimpleNamespace(service=service)
    def transmit(self,frame):
        self.channel.send_bytes(frame)
        if not self.channel.poll(2):raise TimeoutError('Bounded synthetic pipe')
        return self.channel.recv_bytes()


def client(channel,control,binding,key,service,host,barrier):
    install_offline_guard()
    peer=SimulatedHost(PipeLink(channel,service),Binding.model_validate(binding),key,host)
    control.send(dict(pid=os.getpid()))
    try:
        while True:
            command=control.recv();kind=command[0]
            if kind=='quit':return
            if kind=='race':barrier.wait(4);reply=peer.call('acquire')
            elif kind=='call':reply=peer.call(command[1],command[2],**command[3])
            elif kind=='state':reply=dict(controller=peer.controller,epoch=peer.epoch,token=peer.token)
            elif kind=='restore':
                peer.controller=command[1]['controller'];peer.epoch=command[1]['epoch'];peer.token=command[1]['token'];reply=True
            elif kind=='frame':reply=peer.frame(command[1],command[2],**command[3])[1]
            elif kind=='raw':reply=verify(peer.link.transmit(command[1]),key,'response')['result']
            else:raise ValueError('Unknown fixture control')
            control.send(reply)
    except (EOFError,BrokenPipeError,OSError):return


def probe_owner(root,history,control):
    try:
        authority=(HistoryAuthority if history else SharedAuthority)(root)
        authority.close();control.send(False)
    except ValueError:control.send(True)


class Peer:
    def __init__(self,process,control):self.process=process;self.control=control
    def submit(self,*command):self.control.send(command)
    def receive(self):
        if not self.control.poll(5):raise TimeoutError('Bounded worker response')
        return self.control.recv()
    def rpc(self,*command):self.submit(*command);return self.receive()
    def call(self,operation,body=None,**kwargs):return self.rpc('call',operation,body,kwargs)


class ProcessCoordinationTests(unittest.TestCase):
    def setUp(self):
        self.ctx=mp.get_context('spawn');self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'authority';self.processes=[];self.addCleanup(self.stop)
        self.b=Binding.model_validate(dict(simulation=True,tenant='tenant',account='client',broker='justmarkets',login=1,server='SimulationOnly'))
        self.profiles=[self.b];self.keys=[secrets.token_bytes(32)];self.sequence=0
    def stop(self):
        for p in self.processes:
            if p.is_alive():p.terminate()
        for p in self.processes:
            p.join(3)
            if p.is_alive():p.kill();p.join(2)
        self.processes=[]
    def mirror(self,stopped=False,binding=None):
        b=binding or self.b;path=self.root/'accounts'/b.digest()/'mock-stop.json'
        if not path.exists():path.touch(mode=0o600)
        now=wall_ms();temporary=path.with_name('mirror.tmp');temporary.write_bytes(canonical(dict(simulation=True,
            binding=b.digest(),stopped=stopped,observed_ms=now,expires_ms=now+3000)))
        temporary.chmod(0o600);temporary.replace(path)
    def start(self,history=False,fault='',different_accounts=False):
        self.history=history
        if not self.root.exists():
            (prepare_history_authority if history else prepare_authority)(self.root)
            authority=(HistoryAuthority if history else SharedAuthority)(self.root)
            try:
                for b,key in zip(self.profiles,self.keys):authority.register(b,key)
            finally:authority.close()
            for b in self.profiles:self.mirror(binding=b)
        self.hit=self.ctx.Event();admin,child_admin=self.ctx.Pipe();pairs=[self.ctx.Pipe() for _ in range(2)]
        self.server=self.ctx.Process(target=gateway,args=(str(self.root),[b.model_dump() for b in self.profiles],
            self.keys,history,[pair[0] for pair in pairs],child_admin,self.hit,fault))
        self.server.start();self.processes.append(self.server);self.admin=admin
        self.assertTrue(admin.poll(5));ready=admin.recv();self.assertTrue(ready['ready'],ready)
        barrier=self.ctx.Barrier(2);self.peers=[]
        for index,pair in enumerate(pairs):
            control,child_control=self.ctx.Pipe();profile_index=index if different_accounts else 0
            p=self.ctx.Process(target=client,args=(pair[1],child_control,self.profiles[profile_index].model_dump(),
                self.keys[profile_index],ready['service'],'worker-'+str(index),barrier))
            p.start();self.processes.append(p);peer=Peer(p,control);self.assertNotEqual(peer.receive()['pid'],os.getpid());self.peers.append(peer)
        self.assertEqual(len({self.server.pid,*(peer.process.pid for peer in self.peers),os.getpid()}),4)
        self.refresh_mirrors()
    def target(self):return dict(login=1,server='SimulationOnly',sourceKey='a'*64,revision=1,symbol='EURUSD',target=.1,sl=0.,tp=0.,maxVolume=1.)
    def event(self,action,**kw):
        self.sequence+=1
        data=dict(login=1,server='SimulationOnly',action=action,sequence=self.sequence,event_id=secrets.token_hex(16),order_id='a'*28)
        if action=='create':data.update(sourceKey='a'*64,symbol='EURUSD',side=0,volume=.1)
        elif action=='fill':data.update(volume=.04,price=1.2)
        data.update(kw);return data
    def db(self,name,b=None):return self.root/'accounts'/(b or self.b).digest()/name
    def fills(self):
        with closing(sqlite3.connect(self.db('simulated-broker.sqlite3'))) as db:return db.execute('SELECT count(*) FROM fills').fetchone()[0]
    def events(self,b=None):
        with closing(sqlite3.connect(self.db('history.sqlite3',b))) as db:return db.execute('SELECT count(*) FROM events').fetchone()[0]
    def restart(self):
        self.stop();self.start(history=self.history)
    def refresh_mirrors(self):
        for b in self.profiles:
            path=self.root/'accounts'/b.digest()/'mock-stop.json'
            self.mirror(json.loads(path.read_bytes())['stopped'],binding=b)
    def claim(self,p):
        self.refresh_mirrors();reply=p.call('acquire');self.assertTrue(reply['success'],reply)
    def sync(self,p,body,**kwargs):
        reply=p.call('sync',body,**kwargs);self.assertTrue(reply['success'],reply);return reply
    def reconcile(self,p):return p.call('sync',dict(login=1,server='SimulationOnly',action='reconcile'))

    def test_independent_workers_compete_and_only_one_executes(self):
        self.start();a,b=self.peers;a.submit('race');b.submit('race');ra,rb=a.receive(),b.receive()
        self.assertEqual(sorted([ra['code'],rb['code']]),['LEASED','OWNER_CONFLICT'])
        winner,loser=(a,b) if ra['success'] else (b,a);self.mirror()
        self.sync(winner,self.target())
        self.assertEqual(loser.call('sync',self.target())['code'],'LEASE_INVALID');self.assertEqual(self.fills(),1)

    def test_takeover_rejects_stale_tokens_and_deduplicates_previous_effect(self):
        self.start();a,b=self.peers;self.claim(a);rid=secrets.token_hex(16);self.mirror()
        first=a.call('sync',self.target(),request_id=rid);self.assertTrue(first['success'])
        time.sleep(2.05);self.mirror();self.claim(b)
        self.assertEqual(a.call('sync',self.target())['code'],'LEASE_INVALID')
        self.assertEqual(b.call('sync',self.target(),request_id=rid),first);self.assertEqual(self.fills(),1)

    def test_second_independent_gateway_cannot_open_same_authority(self):
        self.start(history=True);parent,child=self.ctx.Pipe();p=self.ctx.Process(target=probe_owner,args=(str(self.root),True,child))
        p.start();self.processes.append(p);self.assertTrue(parent.poll(5));self.assertTrue(parent.recv());p.join(3)
        self.assertEqual(p.exitcode,0);self.claim(self.peers[0])
        self.sync(self.peers[0],self.event('create'))

    def test_kill_at_uncommitted_fill_rolls_back_and_incomplete_history_holds(self):
        self.start(history=True,fault='before-commit');a=self.peers[0];self.claim(a)
        self.sync(a,self.event('create'));a.submit('call','sync',self.event('fill'),{})
        self.assertTrue(self.hit.wait(5));self.server.terminate();self.server.join(3)
        self.assertFalse(a.receive()['success']);self.assertEqual(self.events(),1)
        self.restart();b=self.peers[1];self.claim(b);self.mirror()
        self.assertEqual(b.call('sync',self.event('fill'))['code'],'HELD')
        self.assertFalse(self.reconcile(b)['success']);self.assertEqual(self.events(),1)

    def test_committed_partial_fill_crash_is_proved_but_never_reexecuted(self):
        self.start(history=True,fault='after-commit');a=self.peers[0];self.claim(a)
        self.sync(a,self.event('create'));self.assertFalse(a.call('sync',self.event('fill'))['success'])
        self.server.join(3);self.assertEqual(self.server.exitcode,70);self.assertEqual(self.events(),2)
        self.restart();b=self.peers[1];self.claim(b);self.mirror()
        proof=self.reconcile(b);self.assertTrue(proof['success'],proof);self.assertTrue(proof['data']['hold_required'])
        self.assertEqual(proof['data']['deals'],1);self.assertEqual(b.call('sync',self.event('fill'))['code'],'HELD')
        self.assertEqual(self.events(),2)

    def test_emergency_stop_persists_across_crash_and_failover(self):
        self.start(history=True,fault='after-commit');a=self.peers[0];self.claim(a)
        self.sync(a,self.event('create'));self.assertFalse(a.call('sync',self.event('fill'))['success'])
        self.mirror(True);self.restart();b=self.peers[1];self.claim(b)
        self.assertEqual(self.reconcile(b)['code'],'STOPPED');self.assertFalse(b.call('sync',self.event('fill'))['success'])
        self.assertEqual(self.events(),2)

    def test_duplicate_replay_and_out_of_order_frames_never_add_fills(self):
        self.start(history=True);a=self.peers[0];self.claim(a);self.sync(a,self.event('create'))
        body=self.event('fill');frame=a.rpc('frame','sync',body,{})
        self.assertTrue(a.rpc('raw',frame)['success']);self.assertEqual(a.rpc('raw',frame)['code'],'REPLAY')
        self.assertTrue(a.call('sync',body)['success']);self.assertEqual(self.events(),2)
        self.assertFalse(a.call('sync',self.event('fill',sequence=4))['success']);self.assertEqual(self.events(),2)

    def test_separate_accounts_in_one_gateway_remain_isolated(self):
        self.profiles.append(self.b.model_copy(update=dict(tenant='other',account='second',login=2)));self.keys.append(secrets.token_bytes(32))
        self.start(history=True,different_accounts=True);a,b=self.peers;self.claim(a);self.claim(b)
        create=self.event('create');self.sync(a,create)
        self.assertEqual(b.call('sync',create)['code'],'IDENTITY_MISMATCH')
        other=dict(create,login=2);self.sync(b,other)
        self.assertEqual(self.events(),1);self.assertEqual(self.events(self.profiles[1]),1)

if __name__=='__main__':unittest.main()
