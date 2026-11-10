"""Length-prefixed private byte stream shared by Linux and Windows Python."""
import hashlib
import json
import struct
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from private_ipc import Binding, StrictModel, MAX_FRAME, canonical, _unique
from sdk_ipc_candidate import SimulationFaults, wall_ms

SOURCE_FILES = ('private_ipc.py', 'sdk_ipc_candidate.py', 'simulation_sdk.py',
                'observer_sync.py', 'worker_state.py', 'demo_worker.py',
                'execution_gates.py', 'broker_profiles.py', 'framed_stdio.py', 'wine_worker_entry.py',
                'sdk_adapter_candidate.py', 'windows_simulation_security.py', 'native_windows_candidate.py',
                'native_windows_worker.py', 'native_history_pipeline.py', 'shared_lease_simulation.py',
                'synthetic_trade_history.py', 'history_authority_simulation.py',
                'wine_history_paths.py', 'wine_history_candidate.py', 'wine_bridge.py')


class EntryFaults(SimulationFaults):
    startup_delay_ms: int = Field(default=0, ge=0, le=1000)
    exit_before_ready: bool = False
    exit_after_ready: bool = False
    bad_challenge: bool = False
    reply_delay_ms: int = Field(default=0, ge=0, le=1000)
    disconnect_after_sync: bool = False


class Bootstrap(StrictModel):
    protocol: Literal['absolute-target','trade-history-wine'] = 'absolute-target'
    version: Literal[1]
    binding: Binding
    root: str = Field(min_length=1, max_length=2048)
    key: str = Field(pattern=r'^[a-f0-9]{64}$')
    challenge: str = Field(pattern=r'^[a-f0-9]{64}$')
    source_hashes: dict[str, str]
    mock_stop: bool = False
    faults: EntryFaults

    @field_validator('version', mode='before')
    @classmethod
    def integer_version(cls, value):
        if type(value) is not int:
            raise ValueError('Integer version required')
        return value


class Ready(StrictModel):
    version: Literal[1]
    kind: Literal['simulation-ready']
    binding: str = Field(pattern=r'^[a-f0-9]{64}$')
    challenge: str = Field(pattern=r'^[a-f0-9]{64}$')
    platform: str
    python_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    python_version: str = Field(min_length=1, max_length=100)
    held: bool
    stopped: bool
    financial_execution: Literal[False]

    @field_validator('version', mode='before')
    @classmethod
    def integer_version(cls, value):
        if type(value) is not int:
            raise ValueError('Integer version required')
        return value

    @field_validator('financial_execution', mode='before')
    @classmethod
    def no_execution(cls, value):
        if value is not False:
            raise ValueError('Financial execution forbidden')
        return value


def source_hashes(directory):
    directory = Path(directory)
    return {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in SOURCE_FILES}


def decode_bootstrap(frame):
    value = json.loads(frame, object_pairs_hook=_unique,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    return Bootstrap.model_validate(value)


class FramedPipe:
    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer

    @staticmethod
    def _read_exact(stream, count):
        chunks = []
        while count:
            chunk = stream.read(count)
            if not chunk:
                raise EOFError('Private stream closed')
            chunks.append(chunk)
            count -= len(chunk)
        return b''.join(chunks)

    def recv_bytes(self, maxlength=MAX_FRAME):
        count = struct.unpack('!I', self._read_exact(self.reader, 4))[0]
        if not 0 < count <= min(maxlength, MAX_FRAME):
            raise ValueError('Invalid frame size')
        return self._read_exact(self.reader, count)

    def send_bytes(self, frame):
        if type(frame) is not bytes or not 0 < len(frame) <= MAX_FRAME:
            raise ValueError('Invalid frame size')
        pending = memoryview(struct.pack('!I', len(frame)) + frame)
        while pending:
            sent = self.writer.write(pending)
            if not sent:
                raise EOFError('Private stream closed')
            pending = pending[sent:]
        self.writer.flush()

    def close(self):
        for stream in (self.writer, self.reader):
            try:
                stream.close()
            except OSError:
                pass


def fixture_stop_active(root, binding):
    """Explicit mock-only metadata. Absence, ambiguity and expiry stay stopped."""
    try:
        path = Path(root) / 'mock-stop.json'
        if path.is_symlink() or path.stat().st_size > 1024:
            return True
        state = json.loads(path.read_bytes(), object_pairs_hook=_unique)
        if set(state) != {'simulation', 'binding', 'stopped', 'observed_ms', 'expires_ms'}:
            return True
        if state['simulation'] is not True or state['binding'] != binding.digest():
            return True
        now = wall_ms()
        if type(state['observed_ms']) is not int or type(state['expires_ms']) is not int:
            return True
        if not 0 <= now - state['observed_ms'] <= 3000 or not now < state['expires_ms'] <= state['observed_ms'] + 3000:
            return True
        return state['stopped'] is not False
    except (OSError, ValueError, TypeError, KeyError):
        return True
