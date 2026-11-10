"""Offline checks of artifact integrity and container safety boundaries."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from artifacts import SOURCE_FILES, load_lock, verify
from run import acquire, container_command, docker_environment, run, validate_acceptance


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.lock = load_lock()
        self.entry = dict(path='wheels/input.whl', sha256=hashlib.sha256(b'expected').hexdigest(),
                          urls=['https://files.pythonhosted.org/input.whl'])

    def write_lock(self, mutate):
        lock = json.loads(json.dumps(self.lock))
        mutate(lock)
        path = self.root / 'lock.json'
        path.write_text(json.dumps(lock))
        return path

    def acceptance(self):
        return {kind:dict(passed=count,failed=0,errors=0,skipped=0,expected=count,run=count,blocked=0)
                for kind,count in [('native',6),('history',17)]}

    def test_acceptance_requires_both_complete_separate_suites(self):
        validate_acceptance(self.acceptance())

    def test_missing_history_suite_cannot_be_accepted(self):
        data=self.acceptance();del data['history']
        with self.assertRaises(RuntimeError):validate_acceptance(data)

    def test_blocked_skipped_failed_or_missing_cases_cannot_be_accepted(self):
        for field,value in [('blocked',17),('run',16),('skipped',1),('failed',1),('errors',1),('passed',16)]:
            with self.subTest(field=field):
                data=self.acceptance();data['history'][field]=value
                with self.assertRaises(RuntimeError):validate_acceptance(data)

    def test_malformed_boolean_counts_or_unexpected_fields_are_rejected(self):
        for field,value in [('errors',False),('extra',0)]:
            data=self.acceptance();data['native'][field]=value
            with self.assertRaises(RuntimeError):validate_acceptance(data)

    def test_corrupt_cached_input_stops_without_network_or_docker(self):
        path = self.root / self.entry['path']
        path.parent.mkdir()
        path.write_bytes(b'tampered')
        with patch('run.urllib.request.urlopen') as network, patch('run.subprocess.run') as docker:
            with self.assertRaises(ValueError):
                acquire(self.root, self.entry)
            network.assert_not_called()
            docker.assert_not_called()

    def test_hash_mismatch_is_not_published_and_partial_file_is_removed(self):
        with patch('run.urllib.request.urlopen', return_value=io.BytesIO(b'tampered')):
            with self.assertRaises(ValueError):
                acquire(self.root, self.entry)
        self.assertEqual(list(self.root.rglob('*.partial')), [])
        self.assertFalse((self.root / self.entry['path']).exists())

    def test_redirected_cache_directory_is_rejected_before_download(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (self.root / 'wheels').symlink_to(outside)
        with patch('run.urllib.request.urlopen') as network:
            with self.assertRaises(ValueError):
                acquire(self.root, self.entry)
            network.assert_not_called()
        self.assertEqual(list(outside.iterdir()), [])

    def test_lock_rejects_traversal_and_duplicate_inputs(self):
        for mutate in (lambda x: x['artifacts'][0].update(path='../escape'),
                       lambda x: x['artifacts'].append(x['artifacts'][0])):
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                load_lock(self.write_lock(mutate))

    def test_lock_rejects_untrusted_or_plaintext_download_endpoint(self):
        for url in ('http://deb.debian.org/file', 'https://example.com/file',
                    'https://credential@deb.debian.org/file'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                load_lock(self.write_lock(lambda x: x['artifacts'][0].update(urls=[url])))

    def test_container_has_fixed_isolation_no_credentials_or_production_mounts(self):
        args = container_command(self.lock, '/cache', '/results', '/snapshot', 'fixture', 1000, 1000)
        for flag in ('--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pull=never'):
            self.assertIn(flag, args)
        mounts = [args[i + 1] for i, value in enumerate(args) if value == '--mount']
        self.assertEqual(mounts, ['type=bind,src=/cache,dst=/artifacts,readonly',
                                 'type=bind,src=/snapshot,dst=/input,readonly',
                                 'type=bind,src=/results,dst=/evidence'])
        self.assertNotIn('--env-file', args)
        self.assertNotIn('--privileged', args)
        self.assertNotIn('/var/run/docker.sock', ' '.join(mounts))
        self.assertNotIn('requirements.txt', SOURCE_FILES)
        self.assertNotIn('account_workers.py', SOURCE_FILES)
        self.assertEqual(args[-5:], [self.lock['base_image'], 'python', '-I', '-u', '/input/harness/fixture.py'])

    def test_root_controller_is_refused(self):
        with self.assertRaises(ValueError):
            container_command(self.lock, '/cache', '/results', '/snapshot', 'fixture', 0, 0)

    def test_remote_docker_endpoint_cannot_redirect_cleanup_or_launch(self):
        with patch.dict('os.environ', {'DOCKER_HOST': 'tcp://remote', 'DOCKER_CONTEXT': 'production',
                                      'DOCKER_TLS_VERIFY': '1', 'DOCKER_CONFIG': '/local/config'}):
            env = docker_environment()
        for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY'):
            self.assertNotIn(key, env)
        self.assertEqual(env['DOCKER_CONFIG'], '/local/config')

    def test_missing_artifact_prevents_container_launch(self):
        lock = {'artifacts': [self.entry]}
        with patch('run.subprocess.run') as docker:
            with self.assertRaises(FileNotFoundError):
                run(lock, self.root, self.root / 'results')
            docker.assert_not_called()
        self.assertFalse((self.root / 'results').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
