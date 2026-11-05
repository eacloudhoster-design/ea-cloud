"""Root-published emergency-stop mirror. Contains no credentials or execution grant."""
import json,os,stat,time,sys,ntpath
from pathlib import Path

MIRROR=Path('/run/ea-cloud-execution-gate/state.json')

def mirrored_stop_active(path=MIRROR,now=None):
    now=time.time() if now is None else now
    try:
        parent=path.parent.stat()
        windows=sys.platform=='win32'
        if windows:
            # Windows stat has no meaningful Unix ownership. The required root
            # systemd publisher owns this fixed Linux path; no configurable path.
            expected='Z:'+str(MIRROR).replace('/','\\')
            if ntpath.normcase(str(path))!=ntpath.normcase(expected):return True
        elif parent.st_uid!=0 or parent.st_mode&0o022:return True
        if path.parent.is_symlink() or path.is_symlink():return True
        fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        try:
            meta=os.fstat(fd)
            if not stat.S_ISREG(meta.st_mode) or meta.st_size>2048:return True
            if not windows and (meta.st_uid!=0 or meta.st_mode&0o022):return True
            data=json.loads(os.read(fd,2049))
        finally:os.close(fd)
        observed=data['observed_at'];expires=data['expires_at']
        if type(observed) not in (int,float) or type(expires) not in (int,float):return True
        # Clock jumps, stale publishers and malformed fields close the gate.
        if not 0<=now-observed<=3 or not now<expires<=observed+3:return True
        return data.get('stops_active') is not False
    except (OSError,ValueError,KeyError,TypeError):return True

def publish_stop_mirror(directory,stops,now=None):
    if os.geteuid()!=0:raise PermissionError('Root publisher required')
    directory=Path(directory);meta=directory.stat()
    if directory.is_symlink() or meta.st_uid!=0 or meta.st_mode&0o022:raise PermissionError('Protected root runtime directory required')
    now=time.time() if now is None else now
    # Unknown private latch state never becomes a clear observation.
    try:
        active=False
        for value in stops:
            path=Path(value);parent=path.parent.stat()
            if path.parent.is_symlink() or parent.st_uid!=0 or parent.st_mode&0o022:
                active=True;break
            # A directory or dangling link at the latch path is still a stop.
            # Missing/untrusted parent metadata must not imply a clear latch.
            try:path.lstat();active=True;break
            except FileNotFoundError:pass
    except OSError:active=True
    data={'observed_at':now,'expires_at':now+3,'stops_active':active}
    temporary=directory/('state-'+os.urandom(8).hex()+'.tmp')
    try:
        fd=os.open(temporary,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644)
        with os.fdopen(fd,'w') as f:json.dump(data,f);f.flush();os.fsync(f.fileno())
        temporary.chmod(0o644);os.replace(temporary,directory/'state.json')
    finally:
        if temporary.exists():temporary.unlink()
    return data
