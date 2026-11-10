"""Linux validation of native runner controls; never native Windows acceptance."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[2] / 'tools/windows-simulation/acceptance.py'
spec = importlib.util.spec_from_file_location('windows_acceptance_runner', PATH)
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def test_linux_cli_records_blocked_without_launch_or_state_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent=Path(tmp); state=parent/'state'; evidence=parent/'evidence'
            state.mkdir(); evidence.mkdir()
            with patch.object(runner,'load_components') as load, contextlib.redirect_stdout(io.StringIO()):
                code=runner.main(['--state-parent',str(state),'--evidence',str(evidence),'--confirm-isolated-no-egress-vm'])
            self.assertEqual(code,1); load.assert_not_called()
            report=json.loads((evidence/'results.json').read_text())
            self.assertEqual(report['native_acceptance'],'blocked'); self.assertEqual(report['passed'],0)
            self.assertEqual(report['blocked'],runner.EXPECTED); self.assertFalse(report['sdk_called'])
            self.assertEqual(list(state.iterdir()),[])

    def test_nonempty_evidence_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'results.json').write_text('preserve')
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                runner.main(['--state-parent',str(root),'--evidence',str(root),'--confirm-isolated-no-egress-vm'])
            self.assertEqual((root/'results.json').read_text(),'preserve')

    def test_wine_win32_claim_is_refused(self):
        import ctypes
        class Wine:
            wine_get_version = object()
        with patch.object(sys,'platform','win32'), patch.object(runner.os,'name','nt'), patch.object(ctypes,'WinDLL',return_value=Wine(),create=True):
            with self.assertRaisesRegex(RuntimeError,'Wine'):
                runner.native_host()

    def test_dependency_mismatch_and_vendor_distribution_are_refused(self):
        from importlib.metadata import PackageNotFoundError
        lock=json.loads((runner.REPO/'tools/wine-simulation/runtime.lock.json').read_text())
        versions={Path(e['path']).name.split('-')[0]:Path(e['path']).name.split('-')[1] for e in lock['artifacts'] if e['kind']=='windows-wheel'}
        def installed(name):
            if name=='MetaTrader5':raise PackageNotFoundError(name)
            return versions[name]
        with patch('importlib.metadata.version',side_effect=installed):self.assertEqual(runner.dependency_versions(),versions)
        with patch('importlib.metadata.version',return_value='wrong'),self.assertRaises(ValueError):runner.dependency_versions()
        with patch('importlib.metadata.version',side_effect=lambda name:'5.0.45' if name=='MetaTrader5' else versions[name]),self.assertRaises(ValueError):runner.dependency_versions()

    def test_parent_guard_blocks_vendor_tcp_and_udp(self):
        code="""
import importlib.util,socket
s=importlib.util.spec_from_file_location('runner',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.install_guard()
for action in (lambda:__import__('MetaTrader5'),lambda:socket.socket().connect(('192.0.2.1',443)),lambda:socket.socket(type=socket.SOCK_DGRAM).sendto(b'x',('192.0.2.1',1))):
 try:action()
 except (ImportError,PermissionError):pass
 else:raise AssertionError('Guard bypass')
"""
        result=subprocess.run([sys.executable,'-c','import sys\n'+code,str(PATH)],capture_output=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr.decode())

    def test_fixture_layout_requires_empty_individually_checked_roots(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state'; evidence=Path(tmp)/'evidence';state.mkdir();evidence.mkdir()
            inspector=Mock()
            with self.assertRaises(ValueError):runner.validate_fixture_paths(state,evidence,inspector)
            names=unittest.defaultTestLoader.getTestCaseNames(runner.NativeAcceptance)
            for name in names:(state/name).mkdir()
            runner.validate_fixture_paths(state,evidence,inspector)
            self.assertEqual(inspector.check.call_count,6)
            self.assertTrue(all(call.kwargs=={'anchor':True} for call in inspector.check.call_args_list))
            (state/names[0]/'existing-journal').write_text('preserve')
            with self.assertRaises(ValueError):runner.validate_fixture_paths(state,evidence,inspector)
            with self.assertRaises(ValueError):runner.validate_fixture_paths(state,state/'nested',inspector)

    def test_six_scenarios_on_explicit_linux_reference_only(self):
        sys.path.insert(0,str(runner.SERVICE)); runner.load_components()
        with tempfile.TemporaryDirectory() as tmp:
            class Reference(runner.NativeAcceptance):
                parent=Path(tmp)
                launcher_factory=staticmethod(runner.NativeWindowsSimulation.linux_reference)
            suite=unittest.defaultTestLoader.loadTestsFromTestCase(Reference)
            self.assertEqual(suite.countTestCases(),runner.EXPECTED)
            log=io.StringIO();result=unittest.TextTestRunner(stream=log).run(suite)
            self.assertTrue(result.wasSuccessful(),log.getvalue());self.assertEqual(result.testsRun,6)
