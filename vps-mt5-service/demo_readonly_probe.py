"""Credential-bound, read-only demo acceptance. No trading endpoint or order calls."""
import json,ntpath,os,time,sys
from pathlib import Path

def probe(mt5, config, password, timeout=15000):
    report={'read_only':True,'financial_trades':0,'initialized':False,'identity_verified':False,'market_data_verified':False,'execution_enabled':False}
    if config.get('account_mode')!='demo' or int(config.get('login',0))<=0 or not config.get('server') or not password:
        return {**report,'error':'Invalid demo binding'}
    started=time.monotonic()
    try:
        report['sdk_version']=mt5.__version__
        report['initialized']=bool(mt5.initialize(config['terminal_path'],login=config['login'],password=password,server=config['server'],portable=True,timeout=timeout))
        report['initialize_ms']=round((time.monotonic()-started)*1000,2)
        if not report['initialized']:
            report['sdk_error_code']=int(mt5.last_error()[0]);return report
        account=mt5.account_info();terminal=mt5.terminal_info()
        normalize=lambda value:ntpath.normcase(ntpath.normpath(value))
        expected=normalize(ntpath.dirname(config['terminal_path']))
        identity=bool(account and account.login==config['login'] and account.server==config['server'] and account.trade_mode==mt5.ACCOUNT_TRADE_MODE_DEMO)
        paths=bool(terminal and all(normalize(getattr(terminal,field,''))==expected for field in ('path','data_path')))
        report.update(identity_verified=identity,portable_paths_verified=paths,connected=bool(terminal and terminal.connected),automated_trading_enabled=bool(terminal and terminal.trade_allowed))
        if not identity or not paths or not report['connected']:
            report['error']='Demo identity, path or connection verification failed';return report
        if report['automated_trading_enabled']:
            report['error']='Read-only acceptance requires automated trading disabled';return report
        report['account']={'login':account.login,'server':account.server,'mode':'demo','currency':account.currency,'balance':account.balance,'equity':account.equity}
        positions=mt5.positions_get();orders=mt5.orders_get()
        report.update(positions_read_verified=positions is not None,orders_read_verified=orders is not None,
                      open_positions=None if positions is None else len(positions),pending_orders=None if orders is None else len(orders))
        if positions is None or orders is None:
            report['error']='Position/order snapshot unavailable';return report
        symbols=mt5.symbols_get() or ()
        candidates=sorted((s.name for s in symbols if s.name.upper().startswith('EURUSD')),key=len)
        report['symbol_count']=len(symbols)
        if not candidates:report['error']='No EURUSD symbol available';return report
        symbol=candidates[0]
        if not mt5.symbol_select(symbol,True):report['error']='Market data selection failed';return report
        info=mt5.symbol_info(symbol)
        if info is None:report['error']='Contract metadata unavailable';return report
        report['contract']={'symbol':symbol,**{field:getattr(info,field,None) for field in ('currency_base','currency_profit','trade_contract_size','trade_tick_size','trade_calc_mode','trade_mode','volume_min','volume_step','volume_max','digits','point','trade_exemode','filling_mode','trade_stops_level','trade_freeze_level')}}
        report['account']['margin_mode']=getattr(account,'margin_mode',None)
        tick=mt5.symbol_info_tick(symbol)
        if tick:
            report['quote']={'symbol':symbol,'bid':tick.bid,'ask':tick.ask,'time_msc':tick.time_msc}
            report['market_data_verified']=tick.bid>0 and tick.ask>=tick.bid
        return report
    except Exception:
        report['error']='Read-only probe failed; sensitive exception details suppressed';return report
    finally:
        try:mt5.shutdown();report['sdk_shutdown_returned']=True
        except Exception:report['sdk_shutdown_returned']=False

def account_free_control(mt5,path):
    result={'initialized':False,'credential_arguments_supplied':False}
    started=time.monotonic()
    try:
        result['initialized']=bool(mt5.initialize(path,portable=True,timeout=3000))
        result['initialize_ms']=round((time.monotonic()-started)*1000,2)
        result['sdk_error_code']=int(mt5.last_error()[0])
        if result['initialized']:
            account=mt5.account_info();result['account_configured']=bool(account and account.login)
    except Exception:result['error']='Control failed; sensitive details suppressed'
    finally:mt5.shutdown()
    return result

def main():
    try:
        import MetaTrader5 as mt5
        if sys.argv[1:]==['--private-stdin']:
            binding=json.loads(sys.stdin.read())
            config=binding['config'];password=binding['password']
        else:
            from demo_worker import _credential_path
            config=json.loads(_credential_path('account.json').read_text())
            password=_credential_path('broker-password').read_text().rstrip('\r\n')
        cycles=int(binding.get('cycles',1)) if sys.argv[1:]==['--private-stdin'] else 1
        if not 1<=cycles<=3:raise ValueError('Invalid diagnostic cycle count')
        control=account_free_control(mt5,binding['control_path']) if sys.argv[1:]==['--private-stdin'] and binding.get('control_path') else None
        results=[probe(mt5,config,password) for _ in range(cycles)]
        result=results[0] if cycles==1 else {'read_only':True,'cycles':results,'financial_trades':0}
        if control is not None:result={'account_free_control':control,'authenticated':result,'same_process_runtime_and_wine_prefix':True,'read_only':True,'financial_trades':0}
    except Exception:
        result={'read_only':True,'initialized':False,'financial_trades':0,'error':'Credential/runtime setup failed; sensitive details suppressed'}
    print(json.dumps(result,allow_nan=False),flush=True)
if __name__=='__main__':main()
