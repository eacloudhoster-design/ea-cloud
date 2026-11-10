"""Run the unchanged native acceptance cases and emit exact structured counts."""
import importlib.util
import json
from pathlib import Path
import unittest

import sys
history=sys.argv[1:]==['--history']
if sys.argv[1:] not in ([],['--history']):raise ValueError('Unknown acceptance mode')
expected=17 if history else 6
path = Path('/input/vps-mt5-service/runtime_tests')/('wine_history_acceptance.py' if history else 'wine_bridge_acceptance.py')
spec = importlib.util.spec_from_file_location('native_acceptance', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
suite = unittest.defaultTestLoader.loadTestsFromModule(module)
if suite.countTestCases() != expected:
    raise RuntimeError('Unexpected acceptance scenario count')
result = unittest.TextTestRunner(verbosity=2).run(suite)
counts = dict(passed=result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
              failed=len(result.failures), errors=len(result.errors), skipped=len(result.skipped))
# A class-setup error is an error and blocks all cases, never six passing tests.
counts['passed'] = max(0, counts['passed'])
counts.update(expected=expected,run=result.testsRun,blocked=max(0,expected-result.testsRun))
(Path('/evidence')/('history-counts.json' if history else 'native-counts.json')).write_text(json.dumps(counts, indent=2) + '\n')
raise SystemExit(0 if result.wasSuccessful() and result.testsRun == expected and not result.skipped else 1)
