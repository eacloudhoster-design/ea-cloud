"""Exclusive worker ownership and immutable account identity for an existing journal."""
import json,os,sqlite3
from contextlib import closing
from pathlib import Path
class StateLease:
    def __init__(self,path):self.path=Path(str(path)+'.owner');self.stream=None
    def acquire(self):
        if self.path.is_symlink():raise ValueError('Invalid worker ownership file')
        fd=os.open(self.path,os.O_RDWR|os.O_CREAT,0o600);self.stream=os.fdopen(fd,'r+b')
        if os.fstat(fd).st_size==0:self.stream.write(b'0');self.stream.flush()
        self.stream.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(fd,msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:self.close();raise ValueError('Account journal already owned')
    def close(self):
        if self.stream:self.stream.close();self.stream=None

def bind_identity(journal,identity):
    expected=json.dumps(identity,sort_keys=True,separators=(',',':'))
    with closing(sqlite3.connect(journal.path)) as db:
        db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS worker_identity(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL)')
        row=db.execute('SELECT identity FROM worker_identity WHERE id=1').fetchone()
        if row:
            if row[0]!=expected:raise ValueError('Account journal identity mismatch')
            return
        for name in ('allocations','daily_risk','order_mappings'):
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",[name]).fetchone() and db.execute('SELECT 1 FROM '+name+' LIMIT 1').fetchone():
                raise ValueError('Legacy account journal needs offline identity verification')
        db.execute('INSERT INTO worker_identity VALUES(1,?)',[expected]);db.commit()
