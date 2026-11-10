#!/usr/bin/env python3
"""Acquire pinned public inputs, or run the offline disposable Wine fixture.

No packages are installed on the host. The only daemon endpoint is the local
Docker socket. Source is snapshotted from an explicit simulation-only allowlist.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid

from artifacts import HERE, SOURCE_FILES, digest, load_lock, verify


def acquire(cache, entry):
    target = cache / entry['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.parent.resolve() != target.parent:
        raise ValueError('Artifact directory must not be redirected')
    if target.exists() or target.is_symlink():
        verify(cache, entry)
        return
    failures = []
    for url in entry['urls']:
        temporary = target.with_name(target.name + '.' + uuid.uuid4().hex + '.partial')
        try:
            with urllib.request.urlopen(url, timeout=60) as response, temporary.open('xb') as stream:
                shutil.copyfileobj(response, stream)
            if digest(temporary) != entry['sha256']:
                raise ValueError('Downloaded artifact hash mismatch: ' + entry['path'])
            temporary.replace(target)
            verify(cache, entry)
            return
        except (OSError, urllib.error.URLError) as error:
            failures.append(type(error).__name__)
        finally:
            temporary.unlink(missing_ok=True)
    raise RuntimeError('Could not acquire ' + entry['path'] + ': ' + ','.join(failures))


def docker_environment():
    # No inherited endpoint/TLS selectors; do not redirect operations to a remote daemon.
    return {k: v for k, v in os.environ.items()
            if k not in {'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS',
                         'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'}}


def container_command(lock, cache, output, snapshot, name, uid, gid):
    if uid == 0:
        raise ValueError('Run the fixture as an ordinary development user')
    return ['docker', '--host=unix:///var/run/docker.sock', 'run', '--rm',
            '--name', name, '--platform', lock['platform'], '--pull=never',
            '--network=none', '--read-only', '--user', f'{uid}:{gid}',
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=256',
            '--memory=7g', '--memory-swap=7g',
            '--tmpfs', '/wine:rw,exec,mode=1777,size=1342177280',
            '--tmpfs', '/tmp:rw,exec,mode=1777,size=4294967296',
            '--mount', f'type=bind,src={cache},dst=/artifacts,readonly',
            '--mount', f'type=bind,src={snapshot},dst=/input,readonly',
            '--mount', f'type=bind,src={output},dst=/evidence',
            '--env', 'PYTHONDONTWRITEBYTECODE=1',
            *[item for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
                               'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy')
              for item in ('--env', key + '=')],
            lock['base_image'], 'python', '-I', '-u', '/input/harness/fixture.py']


def run(lock, cache, output):
    for entry in lock['artifacts']:
        verify(cache, entry)
    if output.exists():
        raise ValueError('Evidence destination must be new; previous results are never overwritten')
    output.mkdir(mode=0o700, parents=True)
    name = 'ea-wine-simulation-' + uuid.uuid4().hex[:16]
    repo = HERE.parents[1]
    env = docker_environment()
    with tempfile.TemporaryDirectory(prefix='ea-wine-source-') as folder:
        snapshot = Path(folder)
        for relative in SOURCE_FILES:
            source = repo / 'vps-mt5-service' / relative
            if source.is_symlink():
                raise ValueError('Source must not be redirected')
            dest = snapshot / 'vps-mt5-service' / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
        harness = snapshot / 'harness'
        harness.mkdir()
        for filename in ('fixture.py', 'artifacts.py', 'runtime.lock.json', 'sitecustomize.py', 'suite.py'):
            shutil.copyfile(HERE / filename, harness / filename)
        sources = {str(p.relative_to(snapshot)): digest(p) for p in snapshot.rglob('*') if p.is_file()}
        (output / 'input-sha256.json').write_text(json.dumps(sources, indent=2) + '\n')
        args = container_command(lock, cache, output, snapshot, name, os.getuid(), os.getgid())
        # Docker may inject client proxy defaults. fixture.py replaces its process
        # environment before any dependency/source imports; network=none is independent.
        (output / 'isolation.json').write_text(json.dumps({
            'image': lock['base_image'], 'container': name, 'network': 'none',
            'read_only_root': True, 'uid': os.getuid(), 'source_allowlist': list(SOURCE_FILES),
            'lock_sha256': digest(HERE / 'runtime.lock.json'), 'production_credentials': False,
        }, indent=2) + '\n')
        try:
            with (output / 'container.log').open('xb') as log:
                result = subprocess.run(args, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=1200)
            if result.returncode:
                raise RuntimeError('Offline container failed; inspect ' + str(output / 'container.log'))
            summary = json.loads((output / 'results.json').read_text())
            if summary['native'] != {'passed': 6, 'failed': 0, 'errors': 0, 'skipped': 0}:
                raise RuntimeError('Native acceptance did not pass all six cases')
            print(json.dumps(summary, indent=2))
        finally:
            # Exact generated name only, including timeout/interruption cleanup.
            subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'rm', '-f', name],
                           env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
            hashes = {p.name: digest(p) for p in output.iterdir() if p.is_file()}
            (output / 'evidence-sha256.json').write_text(json.dumps(hashes, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('fetch', 'run'))
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    cache = args.cache.absolute()
    if ',' in str(cache) or (args.evidence and ',' in str(args.evidence)):
        parser.error('Docker bind paths must not contain commas')
    lock = load_lock()
    if args.action == 'fetch':
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
        if cache.resolve() != cache:
            parser.error('Cache path must be canonical')
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(lambda entry: acquire(cache, entry), lock['artifacts']))
        print(f"Verified {len(lock['artifacts'])} pinned public artifacts")
    else:
        if not args.evidence:
            parser.error('--evidence is required for run')
        output = args.evidence.absolute()
        if output.parent.resolve() != output.parent or cache.resolve() != cache:
            parser.error('Cache and evidence paths must be canonical')
        if cache == output or cache in output.parents or output in cache.parents:
            parser.error('Use separate cache and evidence directories')
        run(lock, cache, output)


if __name__ == '__main__':
    main()
