"""New tests only. All system/process/network ports are injected fakes."""
import json,sys,time,unittest
from pathlib import Path
def guard(event,args):
 if event in ('subprocess.Popen','os.system','socket.connect','socket.bind','socket.getaddrinfo'):raise RuntimeError('OFFLINE_DRIVER_CHECK')
 if event=='import' and str(args[0]).lower().startswith('metatrader5'):raise RuntimeError('SDK_IMPORT_DISABLED')
sys.addaudithook(guard)
start=time.monotonic();result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(Path(__file__).parent),pattern='test_worker_creation.py'))
out={'tests':result.testsRun,'passed':result.wasSuccessful(),'failures':len(result.failures),'errors':len(result.errors),'seconds':round(time.monotonic()-start,3),'network_process_sdk_guard':True,'production_operations':0}
Path(__file__).with_name('DRIVER_TEST_RESULTS.json').write_text(json.dumps(out,indent=2)+'\n')
raise SystemExit(0 if result.wasSuccessful() else 1)
