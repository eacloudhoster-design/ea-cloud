"""Bounded, authenticated byte frames. No pickle, sockets or credential payloads."""
import hashlib
import hmac
import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from observer_sync import ObserverSync

MAX_FRAME = 16384
MAX_LIFETIME_MS = 5000


class ProtocolError(ValueError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid', allow_inf_nan=False, frozen=True,
                              revalidate_instances='always')


class Binding(StrictModel):
    simulation: Literal[True]
    tenant: str = Field(pattern=r'^[a-z][a-z0-9-]{0,47}$')
    account: str = Field(pattern=r'^[a-z][a-z0-9-]{0,47}$')
    broker: Literal['deriv', 'exness', 'justmarkets', 'xm', 'rcg']
    login: int = Field(gt=0, le=2147483647)
    server: Literal['SimulationOnly']
    role: Literal['client'] = 'client'

    @field_validator('simulation', mode='before')
    @classmethod
    def explicit_simulation(cls, value):
        if value is not True:
            raise ValueError('Explicit simulation required')
        return value

    def digest(self):
        return hashlib.sha256(canonical(self.model_dump())).hexdigest()


class SyncTarget(ObserverSync):
    model_config = ConfigDict(strict=True, extra='forbid', allow_inf_nan=False)
    # The observer engine requires a password object. No password crosses IPC.
    password: SecretStr = SecretStr('simulation-only')
    login: int = Field(gt=0, le=2147483647)
    revision: int = Field(gt=0, le=9007199254740991)

    @field_validator('server', 'symbol')
    @classmethod
    def exact_text(cls, value):
        if value != value.strip() or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('Invalid exact identity')
        return value


class Envelope(StrictModel):
    version: Literal[1]
    binding: str = Field(pattern=r'^[a-f0-9]{64}$')
    controller: str = Field(pattern=r'^[a-f0-9]{32}$')
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    nonce: str = Field(pattern=r'^[a-f0-9]{64}$')
    issued_ms: int = Field(gt=0)
    deadline_ms: int = Field(gt=0)
    epoch: int = Field(ge=0)
    lease_token: str = Field(pattern=r'^(?:[a-f0-9]{64})?$')
    operation: Literal['acquire', 'renew', 'status', 'sync']
    body: dict

    @field_validator('version', mode='before')
    @classmethod
    def integer_version(cls, value):
        if type(value) is not int:
            raise ValueError('Integer version required')
        return value

    def validate_time(self, now):
        if not 0 < self.deadline_ms - self.issued_ms <= MAX_LIFETIME_MS:
            raise ProtocolError('DEADLINE')
        if now < self.issued_ms - 250 or now >= self.deadline_ms:
            raise ProtocolError('DEADLINE')


class Result(StrictModel):
    success: bool
    code: str = Field(pattern=r'^[A-Z_]{1,40}$')
    uncertain: bool = False
    retriable: Literal[False] = False
    simulation: Literal[True] = True
    financial_execution: Literal[False] = False
    data: dict | None = None

    @field_validator('simulation', 'financial_execution', 'retriable', mode='before')
    @classmethod
    def literal_boolean(cls, value):
        if type(value) is not bool:
            raise ValueError('Boolean required')
        return value


class LeaseGrant(StrictModel):
    epoch: int = Field(gt=0)
    lease_token: str = Field(pattern=r'^[a-f0-9]{64}$')
    expires_ms: int = Field(gt=0)


class Renewal(StrictModel):
    expires_ms: int = Field(gt=0)


class Status(StrictModel):
    held: bool
    stopped: bool


class SyncReceipt(StrictModel):
    allocation: str = Field(pattern=r'^[a-f0-9]{64}$')
    sourceKey: str = Field(pattern=r'^[a-f0-9]{64}$')
    symbol: str = Field(min_length=1, max_length=64)
    magic: int = Field(gt=0)
    ticket: str | None
    tickets: list[str] = Field(max_length=10000)
    volume: float
    target: float
    retcode: int


class Response(StrictModel):
    binding: str
    controller: str
    request_id: str
    nonce: str
    result: Result


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def _unique(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ProtocolError('INVALID_FRAME')
        obj[key] = value
    return obj


def sign(message, key, direction='request'):
    if type(key) is not bytes or len(key) < 32 or direction not in ('request', 'response'):
        raise ProtocolError('INVALID_KEY')
    raw = canonical(message)
    mac = hmac.new(key, direction.encode() + b'\0' + raw, hashlib.sha256).hexdigest()
    frame = canonical(dict(message=message, mac=mac))
    if len(frame) > MAX_FRAME:
        raise ProtocolError('FRAME_TOO_LARGE')
    return frame


def verify(frame, key, direction='request'):
    if type(frame) is not bytes or len(frame) > MAX_FRAME:
        raise ProtocolError('INVALID_FRAME')
    try:
        wire = json.loads(frame, object_pairs_hook=_unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if type(wire) is not dict or set(wire) != {'message', 'mac'} or type(wire['message']) is not dict:
            raise ValueError()
        if type(wire['mac']) is not str or not re.fullmatch(r'[a-f0-9]{64}', wire['mac']):
            raise ValueError()
        # sign validates key/direction and bounds the canonical representation too.
        expected = json.loads(sign(wire['message'], key, direction))['mac']
        if not hmac.compare_digest(expected, wire['mac']):
            raise ProtocolError('UNAUTHORIZED')
        return wire['message']
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise ProtocolError('INVALID_FRAME') from None


def result(code, success=False, uncertain=False, data=None):
    return Result(code=code, success=success, uncertain=uncertain, data=data).model_dump()
