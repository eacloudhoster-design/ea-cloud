"""Private configuration/read-evidence contracts. NO SDK loader or working session.

These pure projections do not establish freshness, provenance, ACLs, account
ownership or execution permission. Nothing in the existing IPC imports this module.
"""
import hashlib
import ntpath
from types import MappingProxyType
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from private_ipc import StrictModel, canonical
from windows_simulation_security import windows_path


class PrivateMt5Configuration(StrictModel):
    protocol: Literal['mt5-readonly-preparation-v1']
    tenant: str = Field(pattern=r'^[a-z][a-z0-9-]{0,47}$')
    account: str = Field(pattern=r'^[a-z][a-z0-9-]{0,47}$')
    broker: Literal['deriv', 'exness', 'justmarkets', 'xm', 'rcg']
    login: int = Field(gt=0, le=2147483647)
    server: str = Field(min_length=1, max_length=100)
    terminal_path: str
    journal_path: str
    credential_ref: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    account_mode: Literal['demo'] = 'demo'

    @field_validator('server')
    @classmethod
    def exact_server(cls, value):
        if value != value.strip() or any(ord(c)<32 or ord(c)==127 for c in value):
            raise ValueError('Exact server required')
        return value

    @field_validator('terminal_path', 'journal_path')
    @classmethod
    def local_path(cls, value):
        return windows_path(value)

    @model_validator(mode='after')
    def distinct_paths(self):
        terminal, journal = map(ntpath.normcase, (self.terminal_path, self.journal_path))
        if not terminal.endswith('.exe') or journal in (terminal, ntpath.dirname(terminal)):
            raise ValueError('Distinct terminal and journal paths required')
        return self

    def digest(self):
        return hashlib.sha256(canonical(self.model_dump())).hexdigest()


class ReadEvidence(BaseModel):
    # Project selected official SDK field names; additional SDK fields are ignored.
    model_config = ConfigDict(strict=True, frozen=True, extra='ignore', allow_inf_nan=False)


class AccountEvidence(ReadEvidence):
    login: int = Field(gt=0)
    server: str
    trade_mode: Literal[0]  # Demo only; no inference from server naming.
    margin_mode: Literal[2]  # Initial hedging-only scope.
    equity: float = Field(gt=0)

    @field_validator('trade_mode', 'margin_mode', mode='before')
    @classmethod
    def integer_mode(cls, value):
        if type(value) is not int:raise ValueError('Exact SDK mode integer required')
        return value


class TerminalEvidence(ReadEvidence):
    connected: bool
    path: str
    data_path: str
    build: int = Field(gt=0)

    @field_validator('path', 'data_path')
    @classmethod
    def local_path(cls, value):
        return windows_path(value)


class SymbolEvidence(ReadEvidence):
    name: str = Field(min_length=1,max_length=64)
    visible: bool
    digits: int = Field(ge=0,le=15)
    point: float = Field(gt=0)
    volume_min: float = Field(gt=0)
    volume_max: float = Field(gt=0)
    volume_step: float = Field(gt=0)
    filling_mode: int = Field(ge=0)
    trade_exemode: int = Field(ge=0)

    @model_validator(mode='after')
    def volume_bounds(self):
        if self.volume_min > self.volume_max or self.volume_step > self.volume_max:
            raise ValueError('Invalid volume bounds')
        return self


class TickEvidence(ReadEvidence):
    bid: float = Field(gt=0)
    ask: float = Field(gt=0)
    time_msc: int = Field(gt=0)

    @model_validator(mode='after')
    def spread(self):
        if self.ask < self.bid:raise ValueError('Invalid spread')
        return self


class PositionEvidence(ReadEvidence):
    ticket: int = Field(gt=0)
    identifier: int = Field(gt=0)
    magic: int = Field(ge=0)  # Manual positions must remain visible as evidence.
    type: int = Field(ge=0,le=1)
    symbol: str = Field(min_length=1,max_length=64)
    volume: float = Field(gt=0)
    sl: float = Field(ge=0)
    tp: float = Field(ge=0)


class OrderEvidence(ReadEvidence):
    ticket: int = Field(gt=0)
    position_id: int = Field(ge=0)
    state: int = Field(ge=0)
    type: int = Field(ge=0)
    magic: int = Field(ge=0)
    symbol: str = Field(max_length=64)
    comment: str = Field(max_length=256)
    volume_initial: float = Field(ge=0)
    volume_current: float = Field(ge=0)


class DealEvidence(ReadEvidence):
    ticket: int = Field(gt=0)
    order: int = Field(ge=0)
    position_id: int = Field(ge=0)
    type: int = Field(ge=0)
    entry: int = Field(ge=0)
    magic: int = Field(ge=0)
    symbol: str = Field(max_length=64)
    volume: float = Field(ge=0)


READ_MAPPINGS = MappingProxyType({
    'account_info': AccountEvidence, 'terminal_info': TerminalEvidence,
    'symbol_info': SymbolEvidence, 'symbol_info_tick': TickEvidence,
    'positions_get': PositionEvidence, 'orders_get': OrderEvidence,
    'history_orders_get': OrderEvidence, 'history_deals_get': DealEvidence,
})
ROWS = frozenset(('positions_get','orders_get','history_orders_get','history_deals_get'))


def project_read_evidence(operation, value):
    """Validate already-collected dictionaries; never calls a module or object method.

    SDK namedtuples must be explicitly serialized by a future approved worker.
    None is failure, while an empty collection is a valid empty observation only.
    """
    if operation not in READ_MAPPINGS:raise ValueError('Unsupported read operation')
    model = READ_MAPPINGS[operation]
    if operation in ROWS:
        if type(value) not in (list,tuple) or len(value)>10000:raise ValueError('Incomplete read evidence')
        rows = tuple(project_read_evidence_row(model, row) for row in value)
        if len({row.ticket for row in rows}) != len(rows):raise ValueError('Duplicate evidence tickets')
        return rows
    return project_read_evidence_row(model,value)


def project_read_evidence_row(model, value):
    if type(value) is not dict:raise ValueError('Explicit SDK field dictionary required')
    return model.model_validate(value)


def validate_identity(configuration, account, terminal):
    """Pure comparison, not proof that the terminal was contacted or authenticated."""
    config = PrivateMt5Configuration.model_validate(configuration)
    account = project_read_evidence('account_info',account)
    terminal = project_read_evidence('terminal_info',terminal)
    expected = ntpath.normcase(ntpath.dirname(config.terminal_path))
    if (account.login,account.server)!=(config.login,config.server) or not terminal.connected or any(
            ntpath.normcase(path)!=expected for path in (terminal.path,terminal.data_path)):
        raise ValueError('Account or terminal evidence mismatch')
    return config.digest()


class ReadOnlySdkShape(Protocol):
    """Future read mapping only; intentionally no initialize/login/send operations."""
    def account_info(self): ...
    def terminal_info(self): ...
    def symbol_info(self,symbol): ...
    def symbol_info_tick(self,symbol): ...
    def positions_get(self,**filters): ...
    def orders_get(self,**filters): ...
    def history_orders_get(self,*args,**filters): ...
    def history_deals_get(self,*args,**filters): ...


class SdkAccessDisabled(PermissionError):
    pass


class PrivateSessionPreparation:
    """Prepared -> closed only. Authorization/session I/O are NOT implemented.

    No SDK injection, loading, environment flag or request can activate this object.
    Future lifecycle: approved immutable binding -> initialize -> identity proof
    -> reads -> shutdown. It must live inside existing ownership/stop gates.
    """
    def __init__(self,configuration):
        self.__configuration = PrivateMt5Configuration.model_validate(configuration)
        self.__closed = False

    @property
    def configuration(self):return self.__configuration

    @property
    def status(self):
        return dict(state='closed' if self.__closed else 'prepared', sdk_available=False,
                    connected=False, execution_authorized=False)

    def review_evidence(self,account,terminal):
        if self.__closed:raise SdkAccessDisabled('Preparation closed')
        digest = validate_identity(self.__configuration,account,terminal)
        return dict(configuration_digest=digest,evidence_consistent=True,
                    sdk_runtime_verified=False,execution_authorized=False)

    def connect(self):
        raise SdkAccessDisabled('Approved runtime and private authorization protocol not implemented')

    def read(self,operation):
        raise SdkAccessDisabled('Real SDK reads unavailable')

    def send(self,*args,**kwargs):
        raise SdkAccessDisabled('Financial execution unavailable')

    def close(self):
        # No initialized runtime exists, so no shutdown SDK call is made.
        self.__closed = True
