"""Run the unchanged native acceptance cases and emit exact structured counts."""
import importlib.util
import json
from pathlib import Path
import unittest

path = Path('/input/vps-mt5-service/runtime_tests/wine_bridge_acceptance.py')
spec = importlib.util.spec_from_file_location('native_acceptance', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
suite = unittest.defaultTestLoader.loadTestsFromModule(module)
if suite.countTestCases() != 6:
    raise RuntimeError('Expected the six existing native acceptance scenarios')
result = unittest.TextTestRunner(verbosity=2).run(suite)
counts = dict(passed=result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
              failed=len(result.failures), errors=len(result.errors), skipped=len(result.skipped))
# A class-setup error is an error and blocks all cases, never six passing tests.
counts['passed'] = max(0, counts['passed'])
Path('/evidence/native-counts.json').write_text(json.dumps(counts, indent=2) + '\n')
raise SystemExit(0 if result.wasSuccessful() and result.testsRun == 6 and not result.skipped else 1)
