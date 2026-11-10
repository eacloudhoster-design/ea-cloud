"""Wine-only mapped fixture validation, not native NTFS/Windows certification.

Linux owns permissions and the complete root lock. Windows checks containment,
reparse points and the immutable account marker. No permission is changed here.
"""
from contextlib import contextmanager
import ntpath
from pathlib import Path
import sys

from private_ipc import canonical
from shared_lease_simulation import _wine_private
from windows_simulation_security import windows_path


def mapped_path(value,root):
    for text in (value,root):
        windows_path(text)
        if not text.lower().startswith('z:\\'):raise ValueError('Wine Z path required')
    path=ntpath.normcase(value);anchor=ntpath.normcase(root)
    if path!=anchor and not path.startswith(anchor+'\\'):raise ValueError('Path outside fixture')
    return path


class WineMappedInspector:
    def __init__(self,root,binding):
        if sys.platform!='win32':raise ValueError('Wine Windows Python required')
        # Runtime identity is attested by the trusted Linux bridge's validated
        # Wine executable and private bootstrap. Native worker entry points do
        # not select this scope. This is not a native ACL inspector.
        self.root=Path(root);self.binding=binding
        mapped_path(str(self.root),str(self.root));self.check(self.root)
        self.marker=self.root/'wine-history-fixture.json'
        self.check(self.marker)
        if self.marker.read_bytes()!=canonical(dict(simulation=True,binding=binding.digest(),kind='wine-history')):
            raise ValueError('Wine fixture identity mismatch')

    def check(self,path):
        path=Path(path);mapped_path(str(path),str(self.root))
        if path.resolve()!=path:raise ValueError('Redirected fixture path')
        current=path
        while True:
            info=current.lstat()
            if info.st_file_attributes & 0x400:raise ValueError('Reparse point refused')
            if current==self.root:break
            current=current.parent
        return path


@contextmanager
def history_scope(root,binding):
    if sys.platform=='linux':
        # Explicit bridge reference tests retain all ordinary Unix checks.
        from shared_lease_simulation import private
        private(Path(root));marker=Path(root)/'wine-history-fixture.json';private(marker)
        if marker.read_bytes()!=canonical(dict(simulation=True,binding=binding.digest(),kind='wine-history')):
            raise ValueError('Wine fixture identity mismatch')
        yield
    else:
        inspector=WineMappedInspector(root,binding)
        token=_wine_private.set(inspector)
        try:yield
        finally:_wine_private.reset(token)
