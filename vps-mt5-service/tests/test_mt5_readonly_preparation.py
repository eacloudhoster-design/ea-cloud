"""Offline contracts only; never a vendor SDK, terminal or native Windows test."""
import importlib
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from mt5_readonly_preparation import (PrivateMt5Configuration,PrivateSessionPreparation,
    SdkAccessDisabled,project_read_evidence,validate_identity,READ_MAPPINGS)
from private_ipc import Binding,Envelope
from sdk_ipc_candidate import CandidateEngine,prepare_simulation
from sdk_adapter_candidate import AdapterEngine,SyntheticSdkAdapter
from worker_state import StateLease


def config(**changes):
    return dict(dict(protocol='mt5-readonly-preparation-v1',tenant='tenant',account='client',
        broker='xm',login=1,server='FixtureDemo',terminal_path=r'C:\EA-SIM\terminal\terminal64.exe',
        journal_path=r'C:\EA-SIM\state\observer.sqlite3',credential_ref='broker-password'),**changes)


def account(**changes):
    return dict(dict(login=1,server='FixtureDemo',trade_mode=0,margin_mode=2,equity=1000.),**changes)


def terminal(**changes):
    return dict(dict(connected=True,path=r'C:\EA-SIM\terminal',data_path=r'C:\EA-SIM\terminal',build=1),**changes)


class ReadOnlyPreparationTests(unittest.TestCase):
    def test_config_is_immutable_private_metadata_not_execution_permission(self):
        cfg=PrivateMt5Configuration.model_validate(config())
        self.assertEqual(len(cfg.digest()),64)
        with self.assertRaises(ValueError):cfg.server='Other'
        for field,value in [('password','secret'),('enabled',True),('execution_approved',True),('sdk_module','MetaTrader5')]:
            with self.subTest(field=field),self.assertRaises(ValueError):PrivateMt5Configuration.model_validate(config(**{field:value}))

    def test_missing_or_coerced_config_is_refused(self):
        for field in config():
            data=config();del data[field]
            with self.subTest(missing=field),self.assertRaises(ValueError):PrivateMt5Configuration.model_validate(data)
        for changes in [dict(login=True),dict(login='1'),dict(server=' FixtureDemo'),dict(server='x\n'),dict(account_mode='live'),dict(credential_ref='../password')]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):PrivateMt5Configuration.model_validate(config(**changes))

    def test_unsafe_and_colliding_paths_are_refused_without_filesystem_access(self):
        with patch('pathlib.Path.open',side_effect=AssertionError('No filesystem')):
            for field in ('terminal_path','journal_path'):
                for path in ('relative.exe',r'C:relative.exe',r'\\host\share\file',r'C:\x\..\y',r'C:\x\file:stream'):
                    with self.subTest(field=field,path=path),self.assertRaises(ValueError):PrivateMt5Configuration.model_validate(config(**{field:path}))
            for journal in (r'c:\ea-sim\TERMINAL\terminal64.exe',r'C:\EA-SIM\terminal'):
                with self.assertRaises(ValueError):PrivateMt5Configuration.model_validate(config(journal_path=journal))

    def test_identity_matches_exact_account_and_portable_terminal(self):
        self.assertEqual(validate_identity(config(),account(),terminal()),PrivateMt5Configuration.model_validate(config()).digest())
        for changes in [dict(login=2),dict(server='Other'),dict(trade_mode=2),dict(trade_mode=False),dict(margin_mode=0),dict(margin_mode=2.),dict(equity=float('nan'))]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):validate_identity(config(),account(**changes),terminal())
        for changes in [dict(connected=False),dict(path=r'C:\other'),dict(data_path=r'C:\other')]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):validate_identity(config(),account(),terminal(**changes))

    def test_actual_read_field_projection_never_returns_extra_private_fields(self):
        row=project_read_evidence('account_info',{**account(),'password':'private-fixture','name':'private-name'})
        self.assertEqual(row.login,1);self.assertNotIn('private',str(row.model_dump()))
        self.assertEqual(project_read_evidence('terminal_info',terminal()).build,1)
        symbol=dict(name='EURUSD.broker',visible=True,digits=5,point=.00001,volume_min=.01,volume_max=10.,volume_step=.01,filling_mode=1,trade_exemode=2)
        self.assertEqual(project_read_evidence('symbol_info',symbol).name,'EURUSD.broker')
        self.assertEqual(project_read_evidence('symbol_info_tick',dict(bid=1.,ask=1.1,time_msc=1000)).time_msc,1000)
        with self.assertRaises(ValueError):project_read_evidence('symbol_info_tick',dict(bid=2.,ask=1.,time_msc=1000))

    def test_empty_history_is_not_an_error_or_proof_of_no_execution(self):
        for operation in ('positions_get','orders_get','history_orders_get','history_deals_get'):
            self.assertEqual(project_read_evidence(operation,()),())
            with self.assertRaises(ValueError):project_read_evidence(operation,None)
        # No classification, retry permission or authorization is produced.
        self.assertIsInstance(project_read_evidence('history_deals_get',[]),tuple)

    def test_positions_orders_and_deals_keep_real_identifiers_and_reject_duplicates(self):
        position=dict(ticket=42,identifier=40,magic=0,type=0,symbol='EURUSD',volume=.03,sl=0.,tp=0.)
        order=dict(ticket=43,position_id=40,state=4,type=0,magic=7,symbol='EURUSD',comment='EC:fixture',volume_initial=.03,volume_current=0.)
        deal=dict(ticket=44,order=43,position_id=40,type=0,entry=0,magic=7,symbol='EURUSD',volume=.01)
        for operation,row in [('positions_get',position),('orders_get',order),('history_orders_get',order),('history_deals_get',deal)]:
            self.assertEqual(project_read_evidence(operation,[row])[0].ticket,row['ticket'])
            with self.assertRaises(ValueError):project_read_evidence(operation,[row,row])
        with self.assertRaises(ValueError):project_read_evidence('positions_get',[{**position,'volume':float('inf')}])

    def test_no_sdk_loading_connection_or_send_even_with_environment_flags(self):
        session=PrivateSessionPreparation(config())
        with patch.dict(os.environ,{'EA_MT5_ALLOW_REAL':'1','EA_WORKER_MODE':'real'}),patch.object(importlib,'import_module',side_effect=AssertionError('No loader')):
            for call in (session.connect,lambda:session.read('account_info'),lambda:session.read('initialize'),lambda:session.send({'action':1})):
                with self.assertRaises(SdkAccessDisabled):call()
        self.assertFalse(session.status['connected']);self.assertFalse(session.status['execution_authorized'])
        session.close();session.close();self.assertEqual(session.status['state'],'closed')
        with self.assertRaises(SdkAccessDisabled):session.connect()
        with self.assertRaises(AttributeError):session.configuration=PrivateMt5Configuration.model_validate(config(login=2))
        self.assertNotIn('MetaTrader5',sys.modules)

    def test_session_evidence_review_stays_bound_and_never_authorizes_access(self):
        session=PrivateSessionPreparation(config())
        review=session.review_evidence(account(),terminal())
        self.assertTrue(review['evidence_consistent']);self.assertFalse(review['sdk_runtime_verified'])
        self.assertFalse(review['execution_authorized']);self.assertFalse(session.status['connected'])
        with self.assertRaises(ValueError):session.review_evidence(account(login=2),terminal())
        session.close()
        with self.assertRaises(SdkAccessDisabled):session.review_evidence(account(),terminal())

    def test_read_contract_has_no_mutation_or_session_switching_operation(self):
        for operation in ('initialize','login','shutdown','symbol_select','order_send','send','order_check'):
            self.assertNotIn(operation,READ_MAPPINGS)
            with self.assertRaises(ValueError):project_read_evidence(operation,{})

    def test_preparation_binding_cannot_enter_the_execution_worker_or_protocol(self):
        with patch.object(CandidateEngine,'_construct_sdk',side_effect=AssertionError('No SDK construction')):
            with self.assertRaises(ValueError):AdapterEngine(Path('/unused'),config(),secrets.token_bytes(32))
        with self.assertRaises(ValueError):Binding.model_validate(dict(simulation=False,tenant='tenant',account='client',broker='xm',login=1,server='FixtureDemo'))
        with self.assertRaises(ValueError):Envelope.model_validate(dict(version=1,binding='a'*64,controller='b'*32,request_id='c'*32,nonce='d'*64,issued_ms=1,deadline_ms=2,epoch=0,lease_token='',operation='initialize',body=config()))


class ConstructionSeamTests(unittest.TestCase):
    def test_adapter_is_constructed_once_after_ownership_and_before_ready_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'state';binding=Binding(simulation=True,tenant='tenant',account='client',broker='xm',login=1,server='SimulationOnly')
            prepare_simulation(root,binding)
            events=[];original=CandidateEngine._audit
            class Observed(AdapterEngine):
                def _construct_sdk(self):
                    events.append('construction');self.assert_owned()
                    return super()._construct_sdk()
                def assert_owned(self):
                    if self.owner.stream is None:raise AssertionError('No journal ownership')
                def _audit(self,event,request=None):
                    if event=='WORKER_STARTED':
                        if not isinstance(self.sdk,SyntheticSdkAdapter):raise AssertionError('Missing adapter')
                        events.append(event)
                    return original(self,event,request)
            engine=Observed(root,binding,secrets.token_bytes(32))
            try:self.assertEqual(events,['construction','WORKER_STARTED']);self.assertEqual(engine.sdk.account_info().login,1)
            finally:engine.close()

    def test_failed_construction_releases_owner_and_closes_backend(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'state';binding=Binding(simulation=True,tenant='tenant',account='client',broker='xm',login=1,server='SimulationOnly')
            prepare_simulation(root,binding);seen=[]
            def refused(backend,*args,**kwargs):
                seen.append(backend.db);raise ValueError('Synthetic adapter refusal')
            with patch('sdk_adapter_candidate.SyntheticSdkAdapter',side_effect=refused):
                with self.assertRaises(ValueError):AdapterEngine(root,binding,secrets.token_bytes(32))
            with self.assertRaises(sqlite3.ProgrammingError):seen[0].execute('SELECT 1')
            lease=StateLease(root/'observer.sqlite3');lease.acquire();lease.close()
