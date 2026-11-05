"""Read-only broker history assessment. Verified results can only create a hold.
No order submission, blind replay, or automatic unblock exists in this module.
"""
import hashlib,json,math,ntpath,sqlite3,time
from contextlib import closing
from datetime import datetime,timezone
from decimal import Decimal
from pathlib import Path
from worker_state import StateLease

ORDER_FIELDS=('ticket','state','type','magic','position_id','volume_initial','volume_current','symbol','comment')
DEAL_FIELDS=('ticket','order','type','entry','magic','position_id','volume','symbol')
POSITION_FIELDS=('ticket','identifier','magic','type','volume','sl','tp','symbol')
def _row(value,fields):return {k:getattr(value,k) for k in fields if hasattr(value,k)}
def _decimal(value):
 result=Decimal(str(value))
 if not result.is_finite():raise ValueError('Invalid quantity')
 return result

def load_mapping(journal,mapping_id):
    if not Path(journal.path).is_file():raise ValueError('Journal unavailable')
    with closing(sqlite3.connect(journal.path)) as db:
        db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON')
        row=db.execute('SELECT m.*,a.account,a.magic,a.phase AS allocation_phase FROM order_mappings m JOIN allocations a ON a.scope=m.scope WHERE m.id=?',[mapping_id]).fetchone()
        if row is None:raise ValueError('Unknown mapping')
        return dict(row)

def _identity(mt5,config):
    account=mt5.account_info();terminal=mt5.terminal_info()
    norm=lambda s:ntpath.normcase(ntpath.normpath(s))
    path=norm(ntpath.dirname(config['terminal_path']))
    if not account or account.login!=config['login'] or account.server!=config['server'] or account.trade_mode!=getattr(mt5,'ACCOUNT_TRADE_MODE_DEMO',0):raise ValueError('Demo identity mismatch')
    if not terminal or not terminal.connected or any(norm(getattr(terminal,k,''))!=path for k in ('path','data_path')):raise ValueError('Terminal identity unavailable')

def collect(mt5,config,mapping):
    _identity(mt5,config)
    if json.loads(mapping['account'])!=[config['login'],config['server']]:raise ValueError('Journal account mismatch')
    created=mapping.get('created_at')
    if not created or not math.isfinite(created) or created<time.time()-7*86400 or created>time.time()+300:raise ValueError('Intent needs an explicitly reviewed bounded history window')
    # Observed broker timestamps differ from host epoch; widen the search window.
    # An empty result NEVER proves no submission, irrespective of this window.
    start=datetime.fromtimestamp(created-4*3600,timezone.utc)
    end=datetime.fromtimestamp(time.time()+4*3600,timezone.utc)
    orders=mt5.history_orders_get(start,end);deals=mt5.history_deals_get(start,end)
    active=mt5.orders_get();positions=mt5.positions_get()
    if any(value is None for value in (orders,deals,active,positions)):raise ValueError('Incomplete broker history')
    _identity(mt5,config)
    return dict(orders=[_row(v,ORDER_FIELDS) for v in orders],deals=[_row(v,DEAL_FIELDS) for v in deals],active_orders=[_row(v,ORDER_FIELDS) for v in active],positions=[_row(v,POSITION_FIELDS) for v in positions])

def assess(mapping,snapshot):
    result=dict(mapping_id=mapping['id'],classification='inconclusive',hold_required=True,automatic_retry_allowed=False,broker_orders_submitted=0)
    try:
        request=json.loads(mapping['request']);operation=mapping.get('operation_id')
        if not operation or request.get('comment')!='EC:'+operation or not mapping.get('pre_positions'):
            return {**result,'reason':'Legacy or uncorrelated intent; no automatic inference'}
        if request['action']!=1:return {**result,'reason':'SL/TP changes require separate manual evidence'}
        matches=[o for o in snapshot['orders'] if o.get('comment')==request['comment']]
        if len(matches)!=1:return {**result,'reason':'Unique exact operation reference absent or ambiguous'}
        order=matches[0];ticket=int(order['ticket']);volume=_decimal(request['volume'])
        if ticket<=0 or order['symbol']!=request['symbol'] or order['magic']!=request['magic'] or order['type']!=request['type'] or _decimal(order['volume_initial'])!=volume:
            return {**result,'reason':'History order does not match immutable request'}
        if any(o.get('ticket')==ticket or o.get('comment')==request['comment'] for o in snapshot['active_orders']):
            return {**result,'reason':'Order still active; outcome not final'}
        deals=[d for d in snapshot['deals'] if d.get('order')==ticket]
        if len({d['ticket'] for d in deals})!=len(deals):return {**result,'reason':'Duplicate deal identifiers'}
        pre=json.loads(mapping['pre_positions']);expected_position=order.get('position_id')
        if 'position' in request:
            prior=[p for p in pre if p['ticket']==request['position']]
            if len(prior)!=1 or prior[0]['identifier']!=expected_position:return {**result,'reason':'Closing position identifier mismatch'}
        for d in deals:
            if d.get('entry')!=(1 if 'position' in request else 0):return {**result,'reason':'Deal entry does not match intended open/close'}
            if d['ticket']<=0 or d['symbol']!=request['symbol'] or d['magic']!=request['magic'] or d['type']!=request['type'] or d.get('position_id')!=expected_position or _decimal(d['volume'])<=0:
                return {**result,'reason':'Deal identity or direction mismatch'}
        total=sum((_decimal(d['volume']) for d in deals),Decimal(0))
        remaining=_decimal(order['volume_current'])
        if remaining<0 or remaining>volume or total>volume or abs(volume-remaining-total)>Decimal('0.00000001'):
            return {**result,'reason':'Order/deal volume accounting does not balance'}
        if order['state']==4 and total==volume:classification='confirmed_execution'
        elif order['state'] in (2,5,6) and total==0 and remaining==volume:classification='confirmed_no_fill'
        elif order['state'] in (2,4,6) and 0<total<volume:classification='confirmed_partial_execution'
        else:return {**result,'reason':'History state is not conclusively terminal'}
        signed=lambda p:_decimal(p['volume'])*(1 if p['type']==0 else -1)
        before=sum((signed(p) for p in pre),Decimal(0))
        expected=before+total*(1 if request['type']==0 else -1)
        owned=[p for p in snapshot['positions'] if p.get('magic')==request['magic'] and p.get('symbol')==request['symbol']]
        actual=sum((signed(p) for p in owned),Decimal(0))
        return {**result,'classification':classification,'order_ticket':ticket,'deal_tickets':sorted(d['ticket'] for d in deals),'filled_volume':float(total),'expected_exposure':float(expected),'current_exposure':float(actual),'exposure_consistent':abs(expected-actual)<=Decimal('0.00000001'),'reason':'History verified; execution remains held pending review'}
    except (KeyError,ValueError,TypeError,ArithmeticError):return {**result,'reason':'Malformed or incomplete evidence'}

def reconcile(mt5,journal,config,mapping_id,record=False):
    lease=StateLease(journal.path) if record else None
    if lease:lease.acquire() # Recording is offline-only: a running worker owns this lock.
    try:
        mapping=load_mapping(journal,mapping_id)
        snapshot=collect(mt5,config,mapping)
        result=assess(mapping,snapshot)
        request=json.loads(mapping['request'])
        matches=[o for o in snapshot['orders'] if o.get('comment')==request.get('comment')];tickets={o.get('ticket') for o in matches}
        relevant=dict(orders=matches,deals=[d for d in snapshot['deals'] if d.get('order') in tickets],active_orders=[o for o in snapshot['active_orders'] if o.get('ticket') in tickets or o.get('comment')==request.get('comment')],positions=[p for p in snapshot['positions'] if p.get('magic')==request.get('magic') and p.get('symbol')==request.get('symbol')])
        for values in relevant.values():values.sort(key=lambda row:json.dumps(row,sort_keys=True))
        immutable={key:mapping.get(key) for key in ('id','scope','revision','request','operation_id','created_at','pre_positions','target')}
        evidence=hashlib.sha256(json.dumps(dict(intent=immutable,account_sha256=hashlib.sha256(mapping['account'].encode()).hexdigest(),magic=mapping['magic'],snapshot=relevant),sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
        result['evidence_sha256']=evidence
        if record:
            with closing(sqlite3.connect(journal.path)) as db:
                db.execute('PRAGMA synchronous=FULL');db.execute('BEGIN IMMEDIATE')
                db.row_factory=sqlite3.Row
                current=db.execute('SELECT * FROM order_mappings WHERE id=?',[mapping_id]).fetchone()
                allocation=db.execute('SELECT phase,account,magic FROM allocations WHERE scope=?',[mapping['scope']]).fetchone()
                if not current or any(current[key]!=value for key,value in immutable.items()) or current['phase']!=mapping['phase'] or not allocation or allocation[0] not in ('dispatching','reconciled_hold') or allocation[1]!=mapping['account'] or allocation[2]!=mapping['magic']:
                    raise ValueError('Journal changed or not held; fresh assessment required')
                db.execute('CREATE TABLE IF NOT EXISTS history_reconciliations(id INTEGER PRIMARY KEY,mapping_id INTEGER NOT NULL,evidence_sha256 TEXT NOT NULL,result TEXT NOT NULL,observed_at REAL NOT NULL,UNIQUE(mapping_id,evidence_sha256))')
                db.execute('INSERT OR IGNORE INTO history_reconciliations(mapping_id,evidence_sha256,result,observed_at) VALUES(?,?,?,?)',[mapping_id,evidence,json.dumps(result,sort_keys=True),time.time()])
                if result['classification'].startswith('confirmed_'):
                    db.execute("UPDATE order_mappings SET phase='history_confirmed' WHERE id=?",[mapping_id])
                    db.execute("UPDATE allocations SET phase='dispatching' WHERE scope=?",[mapping['scope']]) # Older workers also recognize this blocked phase.
                db.commit()
        return result
    finally:
        if lease:lease.close()
