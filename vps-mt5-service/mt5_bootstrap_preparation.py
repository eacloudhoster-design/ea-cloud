"""Offline preparation authorization contract; no SDK, issuer service or secret loader.

The HMAC verifier key is a separate private trust input, never the worker IPC key.
This candidate authorizes metadata preparation ONLY, not terminal/broker access.
It is not imported by any execution entry point and makes no cross-host claims.
"""
from contextlib import closing
import hashlib
import secrets
from pathlib import Path
import sqlite3
import sys
from typing import Literal

from pydantic import Field,model_validator
from private_ipc import StrictModel,canonical,verify
from mt5_readonly_preparation import PrivateMt5Configuration,PrivateSessionPreparation
from windows_simulation_security import LinuxReferenceInspector
from worker_state import StateLease

PROTOCOL = 'mt5-bootstrap-preparation-v1'
MAX_GRANTS = 1000


class BootstrapRejected(PermissionError):
    """Static codes only: callers must not log private inputs or underlying errors."""


class PreparationGrant(StrictModel):
    protocol: Literal['mt5-bootstrap-preparation-v1']
    purpose: Literal['prepare-readonly-metadata']
    authorization_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    configuration_digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    gateway_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    challenge: str = Field(pattern=r'^[a-f0-9]{64}$')
    issued_ms: int = Field(gt=0)
    expires_ms: int = Field(gt=0)

    @model_validator(mode='after')
    def short_lived(self):
        if not 0 < self.expires_ms-self.issued_ms <= 60000:
            raise ValueError('Bounded preparation grant required')
        return self


class CredentialBoundaryRequirement(StrictModel):
    """Private reference requirement, not proof that any secret was delivered."""
    configuration_digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    credential_ref: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')


class PrivateAssignment(StrictModel):
    gateway_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    configuration: PrivateMt5Configuration


def inspector():
    if sys.platform!='linux':raise BootstrapRejected('OFFLINE_LINUX_LEDGER_REQUIRED')
    return LinuxReferenceInspector()


def identity(assignment,key):
    if type(key) is not bytes or len(key)!=32:raise ValueError('Separate 32-byte verifier key required')
    return hashlib.sha256(canonical(dict(protocol=PROTOCOL,assignment=assignment.model_dump(),
        verifier_key_hash=hashlib.sha256(key).hexdigest()))).hexdigest()


def provision_preparation(root,assignment,verification_key):
    """Explicit new empty private fixture only. Never repairs or adopts old state."""
    try:
        assigned=PrivateAssignment.model_validate(assignment);binding=identity(assigned,verification_key)
        check=inspector()
        root=Path(root).absolute();root.mkdir(mode=0o700,parents=False,exist_ok=False)
        check.check(root,anchor=True)
        ledger=root/'bootstrap.sqlite3'
        ledger.touch(mode=0o600,exist_ok=False)
        with closing(sqlite3.connect(ledger)) as db:
            db.execute('PRAGMA synchronous=FULL')
            db.executescript('''CREATE TABLE metadata(binding TEXT PRIMARY KEY,highwater_ms INTEGER NOT NULL);
                CREATE TABLE consumed(id_hash TEXT PRIMARY KEY,grant_hash TEXT NOT NULL,observed_ms INTEGER NOT NULL);''')
            with db:db.execute('INSERT INTO metadata VALUES(?,0)',[binding])
        # Independent installation witness: a missing ledger must never be recreated.
        marker=root/'installation.json';marker.touch(mode=0o600,exist_ok=False)
        marker.write_bytes(canonical(dict(protocol=PROTOCOL,binding=binding)))
    except Exception:
        raise BootstrapRejected('PREPARATION_PROVISIONING_REFUSED') from None


class BootstrapPreparationVerifier:
    """Private local consumer. No approval issuance or public mutation API.

    Caller-supplied trust/config/storage/safety callbacks are trusted dependencies,
    not values supplied by an execution request. No real access is granted.
    """
    def __init__(self,root,assignment,verification_key,credential_boundary,*,clock,safety_gate=lambda:True):
        self.db=None;self.owner=None;self.closed=True
        try:
            self.__assignment=PrivateAssignment.model_validate(assignment)
            self.__key=verification_key
            self.__binding=identity(self.assignment,self.__key)
            self.__challenge=secrets.token_hex(32)  # Fresh consumer/worker startup, not request-controlled.
            boundary=CredentialBoundaryRequirement.model_validate(credential_boundary)
            cfg=self.assignment.configuration
            if (boundary.configuration_digest,boundary.credential_ref)!=(cfg.digest(),cfg.credential_ref):raise ValueError()
            self.__clock,self.__gate=clock,safety_gate
            self.root=Path(root).absolute();self.check=inspector();self.check.check(self.root,anchor=True)
            self.ledger=self.root/'bootstrap.sqlite3';self.marker=self.root/'installation.json'
            self._storage()
            owner_path=Path(str(self.ledger)+'.owner')
            if owner_path.exists():self.check.check(owner_path)
            self.owner=StateLease(self.ledger);self.owner.acquire()
            self.check.check(owner_path)
            self.db=sqlite3.connect(self.ledger.as_uri()+'?mode=rw',uri=True,timeout=.1)
            self.db.execute('PRAGMA synchronous=FULL')
            self._metadata()
            self.closed=False
        except Exception:
            self.close()
            raise BootstrapRejected('PRIVATE_BOOTSTRAP_UNAVAILABLE') from None

    @property
    def challenge(self):return self.__challenge

    @property
    def assignment(self):return self.__assignment

    @property
    def binding(self):return self.__binding

    def _storage(self):
        self.check.check(self.root,anchor=True)
        for path in (self.ledger,self.marker):self.check.check(path)
        if self.marker.stat().st_size>1024 or self.ledger.stat().st_size>16*1024*1024:raise ValueError()
        if self.marker.read_bytes()!=canonical(dict(protocol=PROTOCOL,binding=self.binding)):raise ValueError()

    def _metadata(self):
        self._storage()
        if self.db.execute('PRAGMA quick_check').fetchall()!=[('ok',)]:raise ValueError()
        rows=self.db.execute('SELECT binding,highwater_ms FROM metadata').fetchall()
        if len(rows)!=1 or rows[0][0]!=self.binding or type(rows[0][1]) is not int or rows[0][1]<0:raise ValueError()
        self.db.execute('SELECT id_hash,grant_hash,observed_ms FROM consumed LIMIT 1')
        return rows[0][1]

    def _safe(self):
        if self.__gate() is not False:raise BootstrapRejected('SAFETY_STATE_BLOCKED')

    def _now(self,grant,minimum):
        now=self.__clock()
        if type(now) is not int or not grant.issued_ms<=now<grant.expires_ms:
            raise BootstrapRejected('AUTHORIZATION_EXPIRED_OR_FUTURE')
        if now<minimum:raise BootstrapRejected('CLOCK_ROLLBACK')
        return now

    def consume(self,frame):
        if self.closed:raise BootstrapRejected('PRIVATE_BOOTSTRAP_UNAVAILABLE')
        try:
            grant=PreparationGrant.model_validate(verify(frame,self.__key,'request'))
            cfg=self.assignment.configuration
            if (grant.configuration_digest,grant.gateway_id,grant.challenge)!=(cfg.digest(),self.assignment.gateway_id,self.__challenge):
                raise BootstrapRejected('AUTHORIZATION_BINDING_MISMATCH')
            self._safe()
            now=self._now(grant,0)
            self.db.execute('BEGIN IMMEDIATE')
            highwater=self._metadata()
            if now<highwater:raise BootstrapRejected('CLOCK_ROLLBACK')
            identifier=hashlib.sha256(grant.authorization_id.encode()).hexdigest()
            if self.db.execute('SELECT 1 FROM consumed WHERE id_hash=?',[identifier]).fetchone():
                raise BootstrapRejected('AUTHORIZATION_REPLAYED')
            if self.db.execute('SELECT count(*) FROM consumed').fetchone()[0]>=MAX_GRANTS:
                raise BootstrapRejected('AUTHORIZATION_CAPACITY_REACHED')
            self._safe()
            now=self._now(grant,max(now,highwater))
            self.db.execute('INSERT INTO consumed VALUES(?,?,?)',[identifier,hashlib.sha256(frame).hexdigest(),now])
            self.db.execute('UPDATE metadata SET highwater_ms=?',[now])
            self.db.commit()  # Consume before returning anything: crash/lost receipt requires fresh approval.
            self._safe()
            self._now(grant,now)
            session=PrivateSessionPreparation(cfg)
            return session,dict(preparation_authorized=True,configuration_digest=cfg.digest(),
                sdk_access_authorized=False,credential_delivery_verified=False,financial_execution=False)
        except Exception as error:
            if self.db:self.db.rollback()
            if isinstance(error,BootstrapRejected):raise
            raise BootstrapRejected('AUTHORIZATION_INVALID_OR_UNAVAILABLE') from None

    def close(self):
        self.closed=True
        if self.db is not None:self.db.close();self.db=None
        if self.owner is not None:self.owner.close();self.owner=None
