import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
import shutil
import stat

spec = importlib.util.spec_from_file_location('runner', Path(__file__).with_name('scoped-check-runner.py'))
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)


class ScopedRunnerTests(unittest.TestCase):
    def setUp(self):
        parent = Path(__file__).resolve().parents[2] / 'qa/coordination/checker-hard-budget-20261015/runner-maker'
        # Python 3.12 tempfile uses mode 0700: Windows applies a restrictive ACL
        # incompatible with this sandbox's subprocess token. Inherit parent ACL.
        self.root = parent / ('fixture-' + uuid.uuid4().hex)
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True, timeout=5)
        (self.root / 'sample.py').write_text('import unittest\nclass Test(unittest.TestCase):\n def test_ok(self): self.assertTrue(True)\n')
        subprocess.run(['git', '-C', str(self.root), 'add', 'sample.py'], check=True, timeout=5)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture'], check=True, timeout=5)
        sha = subprocess.check_output(['git', '-C', str(self.root), 'rev-parse', 'HEAD'], timeout=5).decode().strip()
        self.plan = dict(route='deterministic', root=str(self.root), candidate_sha=sha, base_sha=sha,
            files={'sample.py': runner.digest(self.root / 'sample.py')}, framework='unittest',
            selected={'sample.Test.test_ok': 'selected relevant boundary'}, mandatory=['sample.Test.test_ok'], security=[],
            allocation_s=3, finalization_s=.5, maker_active_s=None, bootstrap_limit_s=6)

    def tearDown(self):
        # Retain candidate bytes, reservations and own-exit/output receipts for
        # independent inspection; Windows indexers can also hold directory handles.
        (self.root / 'test-identity.txt').write_text(self.id())

    def execute(self): return runner.run(self.plan, self.root/'ledger.jsonl', self.root/'receipts')

    def test_success_and_unknown_denominator(self):
        result = self.execute()
        self.assertEqual(result['status'], 'CHECKS_GREEN')
        self.assertFalse(result['time_ratio_verified'])
        self.assertIsNone(result['semantic_verdict'])
        self.assertEqual(result['exit_code'], 0)
        self.assertTrue(list((self.root/'receipts').glob('*/output.bin')))

    def test_missing_required_refused(self):
        self.plan['security'] = ['sample.Test.test_security']
        with self.assertRaises(runner.Refused): self.execute()
        self.assertFalse((self.root/'ledger.jsonl').exists())

    def test_aggregate_reservations_and_immutable_plan(self):
        runner.reserve(self.plan, self.root/'ledger.jsonl')
        runner.reserve(self.plan, self.root/'ledger.jsonl')
        with self.assertRaises(runner.Refused): runner.reserve(self.plan, self.root/'ledger.jsonl')
        self.plan['allocation_s'] = .5
        self.plan['finalization_s'] = .1
        with self.assertRaises(runner.Refused): runner.reserve(self.plan, self.root/'ledger.jsonl')

    def test_llm_zero_execution(self):
        self.plan['route'] = 'native_llm'
        with self.assertRaisesRegex(runner.Refused, 'zero LLM'): self.execute()
        self.assertFalse((self.root/'receipts').exists())

    def test_changed_bytes_refused(self):
        (self.root/'sample.py').write_text('changed')
        with self.assertRaises(runner.Refused): self.execute()

    def test_timeout_descendant_cleanup(self):
        source = '''import unittest,subprocess,sys,time
class Test(unittest.TestCase):
 def test_ok(self):
  subprocess.Popen([sys.executable,'-c',"import time;time.sleep(1.5);open('escaped','w').write('bad')"])
  time.sleep(20)
'''
        (self.root/'sample.py').write_text(source)
        self.plan['files']['sample.py'] = runner.digest(self.root/'sample.py')
        self.plan['allocation_s'] = 1
        self.plan['finalization_s'] = .3
        result = self.execute()
        self.assertEqual(result['status'], 'TIMEOUT')
        time.sleep(1.7)
        self.assertFalse((self.root/'escaped').exists(), 'descendant survived process tree termination')


if __name__ == '__main__': unittest.main()
