"""Offline event book. No vendor SDK, sockets, credentials or market execution.

Integer centilot accounting, append-only history and a checked projection share
one SQLite transaction. Recovery proves effects; it never re-executes them.
"""
from contextlib import closing
from decimal import Decimal
import hashlib
import json
import sqlite3
from typing import Annotated, Literal, Union

from pydantic import Field, TypeAdapter, field_validator, model_validator
from private_ipc import StrictModel, canonical
from sdk_adapter_candidate import SYMBOLS
from shared_lease_simulation import private, touch_private

LIMIT = 2000  # Bounded replay and storage for this development fixture.


class HistoryError(ValueError):
    pass


def units(value):
    number = Decimal(str(value)) * 100
    if not number.is_finite() or number != number.to_integral_value() or not 1 <= number <= 1000:
        raise ValueError('VOLUME_GRID')
    return int(number)


class Identity(StrictModel):
    login: int = Field(gt=0, le=2147483647)
    server: Literal['SimulationOnly']


class Event(Identity):
    event_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    sequence: int = Field(gt=0, le=LIMIT)
    order_id: str = Field(pattern=r'^[a-f0-9]{28}$')


class Create(Event):
    action: Literal['create']
    sourceKey: str = Field(pattern=r'^[a-f0-9]{64}$')
    symbol: Literal['EURUSD', 'XAUUSD']
    side: int = Field(ge=0, le=1)
    volume: float = Field(gt=0, le=10)
    kind: Literal['open', 'close'] = 'open'
    position: str | None = Field(default=None, pattern=r'^[a-f0-9]{28}$')
    sl: float = Field(default=0., ge=0, le=1000000)
    tp: float = Field(default=0., ge=0, le=1000000)

    @field_validator('volume')
    @classmethod
    def grid(cls, value):
        units(value)
        return value

    @model_validator(mode='after')
    def closing(self):
        if (self.kind == 'close') != (self.position is not None):
            raise ValueError('EXPLICIT_CLOSE_POSITION_REQUIRED')
        return self


class Fill(Event):
    action: Literal['fill']
    volume: float = Field(gt=0, le=10)
    price: float = Field(gt=0, le=1000000)
    _grid = field_validator('volume')(Create.grid.__func__)


class Modify(Event):
    action: Literal['modify']
    volume: float = Field(gt=0, le=10)
    sl: float = Field(ge=0, le=1000000)
    tp: float = Field(ge=0, le=1000000)
    _grid = field_validator('volume')(Create.grid.__func__)


class Cancel(Event):
    action: Literal['cancel']


class Reconcile(Identity):
    action: Literal['reconcile']


COMMAND = TypeAdapter(Annotated[Union[Create, Fill, Modify, Cancel, Reconcile], Field(discriminator='action')])


def empty():
    return dict(orders={}, positions={}, deals={}, sources={})


def capacity(state):
    # Pending open quantities reserve exposure; close reservations cannot overbook.
    gross = sum(p['units'] for p in state['positions'].values())
    gross += sum(o['requested']-o['executed'] for o in state['orders'].values()
                 if o['state'] == 'active' and o['kind'] == 'open')
    if gross > 1000:raise HistoryError('EXPOSURE_LIMIT')
    if len(state['positions']) + sum(o['kind']=='open' and o['state']=='active' and not o['executed']
                                     for o in state['orders'].values()) > 10:
        raise HistoryError('POSITION_LIMIT')
    for ticket, position in state['positions'].items():
        reserved = sum(o['requested']-o['executed'] for o in state['orders'].values()
                       if o['state']=='active' and o['kind']=='close' and o['position']==ticket)
        if reserved > position['units']:raise HistoryError('CLOSE_OVERBOOKED')


def apply(state, command):
    """Pure deterministic event reducer; never accesses an SDK or transport."""
    c = command.model_dump();oid = command.order_id
    if command.action == 'create':
        if oid in state['orders']:raise HistoryError('ORDER_EXISTS')
        if c['symbol'] not in SYMBOLS:raise HistoryError('SYMBOL_NOT_APPROVED')
        magic = (int(hashlib.sha256(c['sourceKey'].encode()).hexdigest()[:8],16)&0x3fffffff)|0x40000000
        allocation = dict(symbol=c['symbol'], magic=magic)
        previous = state['sources'].get(c['sourceKey'])
        if previous is not None and previous != allocation:raise HistoryError('SOURCE_SYMBOL_CONFLICT')
        if any(k!=c['sourceKey'] and v['magic']==magic for k,v in state['sources'].items()):
            raise HistoryError('MAGIC_COLLISION')
        if any(o['sourceKey']==c['sourceKey'] and o['state']=='active' for o in state['orders'].values()):
            raise HistoryError('ACTIVE_SOURCE_ORDER')
        if c['kind']=='close':
            p=state['positions'].get(c['position'])
            if not p or p['sourceKey']!=c['sourceKey'] or p['symbol']!=c['symbol'] or p['side']==c['side']:
                raise HistoryError('POSITION_OWNERSHIP_CONFLICT')
        state['sources'][c['sourceKey']]=allocation
        state['orders'][oid]=dict(order_id=oid,sourceKey=c['sourceKey'],symbol=c['symbol'],magic=magic,
            side=c['side'],kind=c['kind'],position=c['position'] if c['kind']=='close' else oid,
            initial_requested=units(c['volume']),requested=units(c['volume']),executed=0,state='active',sl=c['sl'],tp=c['tp'])
    else:
        order=state['orders'].get(oid)
        if not order or order['state']!='active':raise HistoryError('ORDER_NOT_ACTIVE')
        if command.action=='fill':
            amount=units(c['volume'])
            if amount>order['requested']-order['executed']:raise HistoryError('OVERFILL')
            ticket=order['position'];p=state['positions'].get(ticket)
            if order['kind']=='open':
                if p is None:
                    p=dict(ticket=ticket,sourceKey=order['sourceKey'],symbol=order['symbol'],side=order['side'],
                           magic=order['magic'],units=0,sl=order['sl'],tp=order['tp'])
                    state['positions'][ticket]=p
                p['units']+=amount
            else:
                if not p or amount>p['units']:raise HistoryError('CLOSE_EXCEEDS_POSITION')
                p['units']-=amount
                if not p['units']:del state['positions'][ticket]
            order['executed']+=amount
            state['deals'][c['event_id']]=dict(order_id=oid,position=ticket,units=amount,price=c['price'],
                side=order['side'],entry=order['kind'],sequence=c['sequence'])
            if order['executed']==order['requested']:order['state']='filled'
        elif command.action=='modify':
            amount=units(c['volume'])
            if amount<=order['executed']:raise HistoryError('MODIFICATION_BELOW_EXECUTION')
            order.update(requested=amount,sl=c['sl'],tp=c['tp'])
        elif command.action=='cancel':order['state']='cancelled'
    capacity(state)
    order=state['orders'][oid];remaining=order['requested']-order['executed']
    return dict(order_id=oid,state=order['state'],requested_volume=order['requested']/100,
                executed_volume=order['executed']/100,remaining_volume=remaining/100,
                active_remaining_volume=remaining/100 if order['state']=='active' else 0.,
                cancelled_volume=remaining/100 if order['state']=='cancelled' else 0.)


class HistoryBook:
    """Account-root-owned mock backend; new fixtures only, never adopts a ledger."""
    @staticmethod
    def provision(path, binding):
        touch_private(path)
        with closing(sqlite3.connect(path)) as db:
            db.execute('PRAGMA synchronous=FULL')
            db.executescript('''CREATE TABLE meta(binding TEXT PRIMARY KEY,version INTEGER,sequence INTEGER,head TEXT,projection TEXT);
                CREATE TABLE events(sequence INTEGER PRIMARY KEY,event_id TEXT UNIQUE,command_id TEXT UNIQUE,
                    payload TEXT NOT NULL,previous TEXT NOT NULL,hash TEXT NOT NULL,receipt TEXT NOT NULL);
                CREATE TABLE audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,command_id TEXT,sequence INTEGER,digest TEXT);''')
            with db:db.execute('INSERT INTO meta VALUES(?,1,0,?,?)',[binding,'0'*64,canonical(empty()).decode()])

    def __init__(self,path,binding,permit):
        private(path)
        self.db=sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=.1)
        self.db.row_factory=sqlite3.Row;self.db.execute('PRAGMA synchronous=FULL')
        self.binding=binding;self.permit=permit

    def gate(self):
        if self.permit() is not True:raise HistoryError('HISTORY_PERMISSION_LOST')

    def verify(self):
        self.gate();state=empty();head='0'*64;sequence=0
        rows=self.db.execute('SELECT * FROM events ORDER BY sequence LIMIT ?',[LIMIT+1]).fetchall()
        if len(rows)>LIMIT:raise HistoryError('HISTORY_CAPACITY')
        commands=set()
        for row in rows:
            self.gate();sequence+=1
            if row['sequence']!=sequence or row['previous']!=head or row['command_id'] in commands:
                raise HistoryError('INCOMPLETE_HISTORY')
            commands.add(row['command_id'])
            command=COMMAND.validate_json(row['payload'])
            if isinstance(command,Reconcile) or command.sequence!=sequence or command.event_id!=row['event_id']:
                raise HistoryError('HISTORY_IDENTITY_CONFLICT')
            head=hashlib.sha256(canonical(dict(binding=self.binding,command_id=row['command_id'],
                previous=head,payload=command.model_dump()))).hexdigest()
            if head!=row['hash']:raise HistoryError('HISTORY_HASH_CONFLICT')
            receipt=apply(state,command)
            if canonical(receipt).decode()!=row['receipt']:raise HistoryError('HISTORY_RECEIPT_CONFLICT')
        meta=self.db.execute('SELECT * FROM meta').fetchall()
        if len(meta)!=1 or (meta[0]['binding'],meta[0]['version'],meta[0]['sequence'],meta[0]['head'],meta[0]['projection'])!=(
            self.binding,1,sequence,head,canonical(state).decode()):raise HistoryError('HISTORY_PROJECTION_CONFLICT')
        return state,sequence,head,commands

    def execute(self,command,command_id):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            state,sequence,head,_=self.verify()
            old=self.db.execute('SELECT * FROM events WHERE event_id=?',[command.event_id]).fetchone()
            payload=canonical(command.model_dump()).decode()
            if old:
                if old['payload']!=payload:raise HistoryError('DUPLICATE_EVENT_CONFLICT')
                self.gate();self.db.rollback()
                return json.loads(old['receipt'])
            if sequence>=LIMIT:raise HistoryError('HISTORY_CAPACITY')
            if command.sequence!=sequence+1:raise HistoryError('HISTORY_SEQUENCE_GAP')
            receipt=apply(state,command)
            digest=hashlib.sha256(canonical(dict(binding=self.binding,command_id=command_id,
                previous=head,payload=command.model_dump()))).hexdigest()
            self.db.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?)',
                [command.sequence,command.event_id,command_id,payload,head,digest,canonical(receipt).decode()])
            self.db.execute('UPDATE meta SET sequence=?,head=?,projection=?',
                [command.sequence,digest,canonical(state).decode()])
            self.db.execute('INSERT INTO audit(event,command_id,sequence,digest) VALUES(?,?,?,?)',
                [command.action.upper(),command_id,command.sequence,digest])
            self.gate();self.db.commit()
            return receipt
        except BaseException:
            self.db.rollback();raise

    def certificate(self,unresolved):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            state,sequence,head,commands=self.verify()
            if not set(unresolved)<=commands:raise HistoryError('INCOMPLETE_COMMAND_HISTORY')
            self.gate()
            self.db.execute("INSERT INTO audit(event,sequence,digest) VALUES('RECONCILED',?,?)",[sequence,head])
            self.db.commit()
            return dict(sequence=sequence,history_digest=head,orders=len(state['orders']),deals=len(state['deals']),
                        positions=len(state['positions']),automatic_retry_allowed=False)
        except BaseException:
            self.db.rollback();raise

    def close(self):self.db.close()
