"""Hash-locked inputs shared by the downloader and offline fixture builder."""
import hashlib
import json
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
SOURCE_FILES = (
    'private_ipc.py',
    'sdk_ipc_candidate.py',
    'simulation_sdk.py',
    'observer_sync.py',
    'worker_state.py',
    'demo_worker.py',
    'execution_gates.py',
    'broker_profiles.py',
    'framed_stdio.py',
    'wine_worker_entry.py',
    'sdk_adapter_candidate.py',
    'windows_simulation_security.py',
    'native_windows_candidate.py',
    'native_windows_worker.py',
    'native_history_pipeline.py',
    'shared_lease_simulation.py',
    'synthetic_trade_history.py',
    'history_authority_simulation.py',
    'wine_history_paths.py',
    'wine_history_candidate.py',
    'wine_bridge.py',
    'runtime_tests/wine_bridge_acceptance.py',
    'runtime_tests/wine_history_acceptance.py',
)

HOSTS = {'deb.debian.org', 'www.python.org', 'files.pythonhosted.org'}


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def load_lock(path=HERE / 'runtime.lock.json'):
    lock = json.loads(Path(path).read_text())
    if lock['schema'] != 1 or lock['platform'] != 'linux/amd64':
        raise ValueError('Unsupported runtime lock')
    seen = set()
    for entry in lock['artifacts']:
        name = PurePosixPath(entry['path'])
        if (name.is_absolute() or '..' in name.parts or str(name) != entry['path']
                or entry['path'] in seen):
            raise ValueError('Unsafe or duplicate artifact path')
        seen.add(entry['path'])
        if len(entry['sha256']) != 64 or any(c not in '0123456789abcdef' for c in entry['sha256']):
            raise ValueError('Invalid artifact digest')
        if entry['kind'] not in {'deb', 'windows-python', 'windows-wheel', 'linux-wheel', 'patch-tool'}:
            raise ValueError('Unknown artifact kind')
        for url in entry['urls']:
            parsed = urlsplit(url)
            if parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username or parsed.password:
                raise ValueError('Official HTTPS artifact URL required')
    return lock


def verify(cache, entry):
    cache = Path(cache).resolve(strict=True)
    path = cache / entry['path']
    if path.resolve(strict=True) != path or not path.is_file() or digest(path) != entry['sha256']:
        raise ValueError('Artifact missing, redirected or hash mismatch: ' + entry['path'])
    return path
