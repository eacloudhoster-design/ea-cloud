"""Broker identities are provisioned, never inferred from a server substring.

All profiles reuse MT5 contract queries; none supplies guessed server names,
symbol suffixes, filling policies or credentials.
"""
PROFILES={
    'deriv':{'name':'Deriv','official_origin':'https://deriv.com'},
    'exness':{'name':'Exness','official_origin':'https://www.exness.com'},
    'justmarkets':{'name':'JustMarkets','official_origin':'https://justmarkets.com'},
    'xm':{'name':'XM Global','official_origin':'https://www.xm.com'},
    'rcg':{'name':'RCG Markets','official_origin':'https://rcgmarkets.com'},
}

def filling_policy(mt5,info):
    if info is None:raise ValueError('Broker symbol metadata unavailable')
    mask=int(getattr(info,'filling_mode',0))
    if mask&1:return getattr(mt5,'ORDER_FILLING_FOK',0)
    if mask&2:return getattr(mt5,'ORDER_FILLING_IOC',1)
    mode=getattr(info,'trade_exemode',None)
    if mode is not None and mode!=getattr(mt5,'SYMBOL_TRADE_EXECUTION_MARKET',2):
        return getattr(mt5,'ORDER_FILLING_RETURN',2)
    raise ValueError('No advertised supported filling policy')
