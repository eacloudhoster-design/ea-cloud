"""Internal non-root, networkless fixture builder; use run.py, not this directly."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

# -I isolates startup. Drop proxy/default/runtime variables before importing code.
os.environ.clear()
os.environ.update(PATH='/usr/local/bin:/usr/bin:/bin', LANG='C.UTF-8',
                  HOME='/tmp/ea-wine-home', PYTHONDONTWRITEBYTECODE='1')
sys.path.insert(0, str(Path(__file__).resolve().parent))
from artifacts import digest, load_lock, verify

ROOT = Path('/wine/install')
EVIDENCE = Path('/evidence')
TMP = Path('/tmp')


def unpack_zip(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if (destination / member.filename).resolve().is_relative_to(destination.resolve()) is False:
                raise ValueError('Archive path escapes private fixture')
        bundle.extractall(destination)


def logged(name, args, env, timeout=60):
    with (EVIDENCE / (name + '.log')).open('xb') as log:
        result = subprocess.run(args, env=env, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError(name + ' failed, exit=' + str(result.returncode))
    print(name + ': passed', flush=True)


def environment(prefix, linux):
    return dict(PATH='/usr/local/bin:/usr/bin:/bin', LANG='C.UTF-8', HOME=str(prefix),
                WINEPREFIX=str(prefix), WINEARCH='win64', WINEDEBUG='-all',
                WINEDLLOVERRIDES='mscoree,mshtml=d', PYTHONDONTWRITEBYTECODE='1',
                PYTHONPATH=str(linux))


def main():
    if os.getuid() == 0 or sys.platform != 'linux' or os.uname().machine != 'x86_64':
        raise RuntimeError('Non-root Linux x86_64 fixture required')
    if {p.name for p in Path('/sys/class/net').iterdir()} != {'lo'}:
        raise RuntimeError('Refusing runtime with a network interface; use --network=none')
    if Path('/etc/ea-cloud').exists() or Path('/run/ea-cloud-execution-gate').exists():
        raise RuntimeError('Host safety/configuration paths must not be mounted')
    if ROOT.exists():
        raise RuntimeError('Fresh runtime tmpfs required')
    lock = load_lock()
    artifacts = {entry['path']: verify('/artifacts', entry) for entry in lock['artifacts']}
    ROOT.mkdir(mode=0o755)
    linux, windows, tool = TMP / 'linux-python', ROOT / 'windows-python', TMP / 'patch-tool'
    for path in (linux, windows, tool):
        path.mkdir(mode=0o700)
    for entry in lock['artifacts']:
        archive = artifacts[entry['path']]
        if entry['kind'] == 'deb':
            subprocess.run(['dpkg-deb', '--extract', str(archive), str(ROOT)], check=True, timeout=30)
        elif entry['kind'] == 'windows-python':
            unpack_zip(archive, windows)
        elif entry['kind'] == 'windows-wheel':
            unpack_zip(archive, windows / 'Lib/site-packages')
            if '-win_amd64.whl' not in archive.name:
                unpack_zip(archive, linux)
        elif entry['kind'] == 'linux-wheel':
            unpack_zip(archive, linux)
        elif entry['kind'] == 'patch-tool':
            unpack_zip(archive, tool)
    # Preserve all corrections inside this private extraction, never /usr or $HOME/.wine.
    libs = ROOT / 'usr/lib/x86_64-linux-gnu'
    dispatcher = ROOT / 'usr/lib/wine/wineserver'
    dispatcher.rename(dispatcher.with_name('wineserver.debian'))
    dispatcher.symlink_to('wineserver64')
    (ROOT / 'usr/share/wine/wine').symlink_to('.')
    (libs / 'wine/x86_64-windows/zlib1.dll').symlink_to(ROOT / 'usr/x86_64-w64-mingw32/lib/zlib1.dll')
    patch = next(tool.glob('*.data/scripts/patchelf'))
    patch.chmod(0o755)
    patched = 0
    for path in sorted(ROOT.rglob('*')):
        if path.is_symlink() or not path.is_file():
            continue
        with path.open('rb') as stream:
            elf = stream.read(4) == b'\x7fELF'
        if elf:
            subprocess.run([str(patch), '--force-rpath', '--set-rpath', str(libs), str(path)],
                           check=True, timeout=10, stdout=subprocess.DEVNULL)
            patched += 1
    print('Private ELF RPATH corrections:', patched, flush=True)
    (windows / 'python312._pth').write_text('python312.zip\n.\nLib/site-packages\nimport site\n')
    guard = Path(__file__).with_name('sitecustomize.py')
    shutil.copyfile(guard, linux / guard.name)
    shutil.copyfile(guard, windows / 'Lib/site-packages' / guard.name)
    wine = ROOT / 'usr/lib/wine/wine64'
    server = ROOT / 'usr/lib/wine/wineserver64'
    python = windows / 'python.exe'
    prefix = TMP / 'startup-prefix'
    prefix.mkdir(mode=0o700)
    env = environment(prefix, linux)
    version = subprocess.check_output([str(wine), '--version'], env=env, text=True, timeout=10).strip()
    if version != lock['wine_version']:
        raise RuntimeError('Wine version does not match the pinned runtime')
    # Child checks run in both Python platforms before any acceptance cases.
    startup = '''import sys,json,sqlite3,msvcrt,pydantic,fastapi,importlib,socket
assert sys.platform == 'win32' and sys.version.split()[0] == '3.12.10'
try: importlib.import_module('MetaTrader5')
except ImportError: pass
else: raise RuntimeError('Vendor SDK guard missing')
for family,address in [(socket.AF_INET,('127.0.0.1',9)),(socket.AF_INET6,('::1',9))]:
 with socket.socket(family) as sock:
  try: sock.connect(address)
  except PermissionError: pass
  else: raise RuntimeError('Network guard missing')
try:
 import ctypes
 ctypes_status='available'
except ImportError as error:
 ctypes_status=type(error).__name__+': '+str(error)
print(json.dumps(dict(ctypes_status=ctypes_status,platform=sys.platform,python=sys.version,pydantic=pydantic.__version__,fastapi=fastapi.__version__,sqlite=sqlite3.sqlite_version,guard=True)))
'''
    def wine_path(path):
        return 'Z:' + str(path).replace('/', '\\')
    try:
        logged('windows-python-startup', [str(wine), wine_path(python), '-c', startup], env)
        logged('windows-minimal-executable', [str(wine), wine_path(libs / 'wine/x86_64-windows/cmd.exe'),
                                            '/c', 'echo', 'WINE_READY'], env)
        logged('linux-python-startup', [sys.executable, '-c',
               "import sitecustomize,pydantic,fastapi;print(pydantic.__version__,fastapi.__version__)"], env)
    finally:
        # Always await this exact disposable prefix, even if -k reports no server.
        subprocess.run([str(server), '-k'], env=env, timeout=5, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([str(server), '-w'], env=env, timeout=5, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(prefix)
    env.update(EA_WINE_EXE=str(wine), EA_WINESERVER=str(server), EA_WINDOWS_PYTHON=str(python))
    logged('native-acceptance', [sys.executable, str(Path(__file__).with_name('suite.py'))], env, timeout=600)
    counts = json.loads((EVIDENCE / 'native-counts.json').read_text())
    logged('history-acceptance', [sys.executable, str(Path(__file__).with_name('suite.py')), '--history'], env, timeout=600)
    history = json.loads((EVIDENCE / 'history-counts.json').read_text())
    startup_lines = (EVIDENCE / 'windows-python-startup.log').read_text(errors='replace').splitlines()
    windows_versions = next(json.loads(line) for line in startup_lines if line.startswith('{'))
    result = dict(simulation_only=True, network='none', wine=version, windows=windows_versions,
                  native=counts, history=history, artifacts_verified=len(artifacts), private_elf_patches=patched,
                  runtime_lock_sha256=digest(Path(__file__).with_name('runtime.lock.json')))
    (EVIDENCE / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
