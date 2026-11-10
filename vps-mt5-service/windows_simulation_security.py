"""Strict, read-only Windows fixture inspection. No ACL/policy provisioning here."""
import ctypes
import ntpath
import os
import re
import stat
from pathlib import Path

FULL = 0x1f01ff
WRITE = 0x40000000 | 0x10000000 | 0x000d0156  # generic write/all, delete, owner/DACL, file writes
SYSTEM = 'S-1-5-18'
SOURCES = ('private_ipc.py', 'sdk_ipc_candidate.py', 'simulation_sdk.py', 'observer_sync.py',
           'worker_state.py', 'demo_worker.py', 'execution_gates.py', 'broker_profiles.py',
           'framed_stdio.py', 'wine_worker_entry.py', 'windows_simulation_security.py',
           'native_windows_worker.py', 'native_windows_candidate.py', 'sdk_adapter_candidate.py',
           'shared_lease_simulation.py', 'synthetic_trade_history.py',
           'history_authority_simulation.py', 'native_history_pipeline.py')


def windows_path(value):
    if type(value) is not str or not 3 <= len(value) <= 200:
        raise ValueError('Bounded Windows path required')
    if not re.match(r'^[A-Za-z]:\\', value) or '/' in value:
        raise ValueError('Local absolute drive path required')
    parts = value[3:].split('\\')
    reserved = {'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$', 'CLOCK$',
                *(f'{p}{n}' for p in ('COM', 'LPT') for n in '123456789¹²³')}
    if not parts or any(not p or p in ('.', '..') or p.endswith((' ', '.'))
                        or any(ord(c) < 32 or c in '<>:"|?*~' for c in p)
                        or p.split('.')[0].upper() in reserved for p in parts):
        raise ValueError('Ambiguous Windows path')
    if ntpath.normpath(value) != value:
        raise ValueError('Canonical Windows path required')
    return value


def validate_acl(info, *, private):
    """Validate decoded ACL facts. Unknown/object/conditional ACEs are refused."""
    if not info['owner'] or info['owner'] not in (info['user'], SYSTEM):
        raise ValueError('Untrusted owner')
    if not info['dacl_present'] or not info['aces']:
        raise ValueError('Explicit nonempty DACL required')
    owner_full = False
    for ace in info['aces']:
        if ace['type'] != 0 or ace['flags'] & ~0x13:  # allow OI/CI/inherited only
            raise ValueError('Unsupported ACE')
        trusted = ace['sid'] in (info['user'], SYSTEM)
        if not trusted and (private or ace['mask'] & WRITE):
            raise ValueError('Untrusted account access')
        if ace['sid'] == info['user'] and ace['mask'] & FULL == FULL:
            owner_full = True
    if private and not owner_full:
        raise ValueError('Fixture owner full control required')


class Win32Inspector:
    """Actual APIs are deferred to Windows; decoded facts are tested offline."""
    def __init__(self):
        if os.name != 'nt':
            raise ValueError('Native Microsoft Windows required')
        from ctypes import wintypes as w
        self.w = w
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.advapi = ctypes.WinDLL('advapi32', use_last_error=True)
        P = ctypes.c_void_p
        self.kernel.GetCurrentProcess.restype = w.HANDLE
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.kernel.LocalFree.argtypes = [P]
        self.kernel.GetFileAttributesW.argtypes = [w.LPCWSTR]
        self.kernel.GetFileAttributesW.restype = w.DWORD
        self.kernel.GetDriveTypeW.argtypes = [w.LPCWSTR]
        self.kernel.GetDriveTypeW.restype = w.UINT
        self.kernel.GetWindowsDirectoryW.argtypes = [w.LPWSTR, w.UINT]
        self.kernel.GetWindowsDirectoryW.restype = w.UINT
        self.kernel.GetVolumeInformationW.argtypes = [w.LPCWSTR, w.LPWSTR, w.DWORD,
            ctypes.POINTER(w.DWORD), ctypes.POINTER(w.DWORD), ctypes.POINTER(w.DWORD), w.LPWSTR, w.DWORD]
        self.advapi.OpenProcessToken.argtypes = [w.HANDLE, w.DWORD, ctypes.POINTER(w.HANDLE)]
        self.advapi.GetTokenInformation.argtypes = [w.HANDLE, ctypes.c_int, P, w.DWORD, ctypes.POINTER(w.DWORD)]
        self.advapi.ConvertSidToStringSidW.argtypes = [P, ctypes.POINTER(w.LPWSTR)]
        self.advapi.GetNamedSecurityInfoW.argtypes = [w.LPWSTR, ctypes.c_int, w.DWORD,
            ctypes.POINTER(P), ctypes.POINTER(P), ctypes.POINTER(P), ctypes.POINTER(P), ctypes.POINTER(P)]
        self.advapi.GetNamedSecurityInfoW.restype = w.DWORD
        self.advapi.GetSecurityDescriptorControl.argtypes = [P, ctypes.POINTER(w.WORD), ctypes.POINTER(w.DWORD)]
        self.advapi.GetAclInformation.argtypes = [P, P, w.DWORD, ctypes.c_int]
        self.advapi.GetAce.argtypes = [P, w.DWORD, ctypes.POINTER(P)]
        token = w.HANDLE()
        if not self.advapi.OpenProcessToken(self.kernel.GetCurrentProcess(), 8, ctypes.byref(token)):
            raise OSError('Token inspection unavailable')
        try:
            size = w.DWORD()
            self.advapi.GetTokenInformation(token, 1, None, 0, ctypes.byref(size))
            if not 0 < size.value < 65536:
                raise OSError('Invalid token metadata')
            buffer = ctypes.create_string_buffer(size.value)
            if not self.advapi.GetTokenInformation(token, 1, buffer, size, ctypes.byref(size)):
                raise OSError('Token inspection unavailable')
            self.user = self.sid(ctypes.cast(buffer, ctypes.POINTER(P))[0])
        finally:
            self.kernel.CloseHandle(token)

    def system_root(self):
        buffer = ctypes.create_unicode_buffer(260)
        size = self.kernel.GetWindowsDirectoryW(buffer, len(buffer))
        if not 0 < size < len(buffer):
            raise OSError('OS loader path unavailable')
        return windows_path(buffer.value)

    def sid(self, pointer):
        text = self.w.LPWSTR()
        if not self.advapi.ConvertSidToStringSidW(pointer, ctypes.byref(text)):
            raise OSError('SID unavailable')
        try:
            return text.value
        finally:
            self.kernel.LocalFree(ctypes.cast(text, ctypes.c_void_p))

    def inspect(self, path):
        w, P = self.w, ctypes.c_void_p
        owner, dacl, descriptor = P(), P(), P()
        code = self.advapi.GetNamedSecurityInfoW(str(path), 1, 5, ctypes.byref(owner), None,
                                               ctypes.byref(dacl), None, ctypes.byref(descriptor))
        if code:
            raise OSError('Security inspection unavailable')
        try:
            control, revision = w.WORD(), w.DWORD()
            if not self.advapi.GetSecurityDescriptorControl(descriptor, ctypes.byref(control), ctypes.byref(revision)):
                raise OSError('Security control unavailable')
            class ACLSize(ctypes.Structure):
                _fields_ = [('count', w.DWORD), ('used', w.DWORD), ('free', w.DWORD)]
            size = ACLSize()
            if not dacl or not self.advapi.GetAclInformation(dacl, ctypes.byref(size), ctypes.sizeof(size), 2):
                raise OSError('DACL unavailable')
            if size.count > 64:
                raise ValueError('DACL too complex')
            aces = []
            for i in range(size.count):
                ace = P()
                if not self.advapi.GetAce(dacl, i, ctypes.byref(ace)):
                    raise OSError('ACE unavailable')
                header = ctypes.string_at(ace, 8)
                if header[0] != 0 or int.from_bytes(header[2:4], 'little') < 12:
                    raise ValueError('Unsupported ACE')
                aces.append(dict(type=header[0], flags=header[1], mask=int.from_bytes(header[4:8], 'little'),
                                 sid=self.sid(ace.value + 8)))
            return dict(user=self.user, owner=self.sid(owner), dacl_present=bool(control.value & 4),
                        protected=bool(control.value & 0x1000), aces=aces)
        finally:
            self.kernel.LocalFree(descriptor)

    def check(self, path, *, private=True, anchor=False):
        value = windows_path(str(path))
        p = Path(value)
        if ntpath.normcase(str(p.resolve(strict=True))) != ntpath.normcase(value):
            raise ValueError('Redirected path')
        for component in (p, *p.parents):
            attrs = self.kernel.GetFileAttributesW(str(component))
            if attrs == 0xffffffff or attrs & 0x400:
                raise ValueError('Unavailable/reparse path')
        fs, serial, maximum, flags = ctypes.create_unicode_buffer(32), self.w.DWORD(), self.w.DWORD(), self.w.DWORD()
        if not self.kernel.GetVolumeInformationW(p.anchor, None, 0, ctypes.byref(serial),
                ctypes.byref(maximum), ctypes.byref(flags), fs, len(fs)) or fs.value != 'NTFS':
            raise ValueError('Local NTFS required')
        if self.kernel.GetDriveTypeW(p.anchor) != 3:
            raise ValueError('Fixed local disk required')
        # All non-volume ancestors must also resist replacement by other users.
        # Deliberately strict: provision a dedicated C:\\EA-SIM tree, not a shared profile.
        for parent in p.parents:
            if parent.parent == parent:
                break
            validate_acl(self.inspect(parent), private=False)
        info = self.inspect(p)
        validate_acl(info, private=private)
        if anchor and not info['protected']:
            raise ValueError('Protected fixture DACL required')
        return p


class LinuxReferenceInspector:
    """Explicit offline test fixture. Never evidence of native Windows permissions."""
    def check(self, path, *, private=True, anchor=False):
        if os.name == 'nt':
            raise ValueError('Linux reference only')
        path = Path(path)
        if not path.is_absolute() or path.resolve(strict=True) != path:
            raise ValueError('Canonical reference path required')
        for p in (path, *path.parents):
            if p.is_symlink():
                raise ValueError('Redirected reference path')
        meta = path.stat()
        if meta.st_uid != os.getuid() or meta.st_mode & (0o077 if private else 0o022):
            raise ValueError('Unsafe reference permissions')
        return path


class WindowsJob:
    """Unnamed, non-inheritable kill-on-close job; fail if containment is unavailable."""
    def __init__(self):
        if os.name != 'nt':
            raise ValueError('Native Windows job required')
        from ctypes import wintypes as w
        P = ctypes.c_void_p
        self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        self.k.CreateJobObjectW.argtypes = [P, w.LPCWSTR]
        self.k.CreateJobObjectW.restype = w.HANDLE
        self.k.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, P, w.DWORD]
        self.k.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.k.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
        self.k.QueryInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, P, w.DWORD, P]
        self.k.CloseHandle.argtypes = [w.HANDLE]
        class BasicLimits(ctypes.Structure):
            _fields_ = [('process_time', ctypes.c_longlong), ('job_time', ctypes.c_longlong),
                        ('flags', w.DWORD), ('minimum', ctypes.c_size_t), ('maximum', ctypes.c_size_t),
                        ('active_limit', w.DWORD), ('affinity', ctypes.c_size_t),
                        ('priority', w.DWORD), ('scheduling', w.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in
                        ('read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes')]
        class Limits(ctypes.Structure):
            _fields_ = [('basic', BasicLimits), ('io', IO), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t),
                        ('peak_job', ctypes.c_size_t)]
        class Accounting(ctypes.Structure):
            _fields_ = [(name, ctypes.c_longlong) for name in ('user', 'kernel', 'period_user', 'period_kernel')] + [
                (name, w.DWORD) for name in ('faults', 'total', 'active', 'terminated')]
        self.accounting = Accounting
        self.handle = self.k.CreateJobObjectW(None, None)
        if not self.handle:
            raise OSError('Job unavailable')
        limits = Limits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway
        if not self.k.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            self.close()
            raise OSError('Job limits unavailable')

    def attach(self, child):
        if not self.k.AssignProcessToJobObject(self.handle, int(child._handle)):
            raise OSError('Worker job assignment failed')

    def terminate(self):
        if not self.k.TerminateJobObject(self.handle, 70):
            raise OSError('Job termination unconfirmed')

    def empty(self):
        info = self.accounting()
        if not self.k.QueryInformationJobObject(self.handle, 1, ctypes.byref(info), ctypes.sizeof(info), None):
            return False
        return info.active == 0

    def close(self):
        if self.handle:
            self.k.CloseHandle(self.handle)
            self.handle = None
