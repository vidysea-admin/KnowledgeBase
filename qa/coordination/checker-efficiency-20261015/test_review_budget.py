"""Focused canonical helper checks; no provider, database or transcript access."""
import argparse
import copy
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

HELPER = Path('C:/Users/product/.agents/skills/checker/scripts/review_budget.py')
EXPECTED_SHA = 'fcc545eba99bff2da3ea7c88dcd0c2ffb7f0f7ce3470f7221fc5e2e6e297f8db'
if hashlib.sha256(HELPER.read_bytes()).hexdigest() != EXPECTED_SHA:
    raise RuntimeError('Canonical helper changed: freeze a new candidate before checking')
spec = importlib.util.spec_from_file_location('canonical_review_budget', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def known():
    return {'maker': {'active_s': 1000, 'tokens': 100000, 'cost': 10},
            'reviewers': [{'id': 'independent', 'active_s': 20, 'tokens': 1000, 'cost': .1}],
            'next_phase': {'active_s': 10, 'tokens': 2000, 'cost': .2}}


class BudgetTests(unittest.TestCase):
    def test_ten_percent_all_dimensions(self):
        result = helper.assess(known())
        self.assertEqual(result['limits'], {'active_s': 100, 'tokens': 10000, 'cost': 1})
        self.assertEqual(result['status'], 'WITHIN_ALLOCATION')
        self.assertTrue(result['ratio_verified'])

    def test_children_retries_aggregate(self):
        data = known()
        data['reviewers'].append({'id': 'retry-2', 'active_s': 80, 'tokens': 0, 'cost': 0})
        self.assertIn('active_s', helper.assess(data)['exceeded'])

    def test_next_phase_allocation_before_execution(self):
        for key, value in [('active_s', 81), ('tokens', 9001), ('cost', .91)]:
            data = known(); data['next_phase'][key] = value
            self.assertIn(key, helper.assess(data)['exceeded'])

    def test_bootstrap_unknown_not_ratio_success(self):
        data = known(); data['maker'] = dict.fromkeys(helper.METRICS)
        data['bootstrap_scope'] = 'Named delta with independent boundary probe'
        result = helper.assess(data)
        self.assertEqual(result['status'], 'BOOTSTRAP_REVIEW')
        self.assertFalse(result['ratio_verified'])
        self.assertEqual(result['limits']['active_s'], 180)
        self.assertEqual(result['limits']['tokens'], 6000)

    def test_zero_maker_requires_bootstrap_scope(self):
        data = known(); data['maker']['active_s'] = 0
        self.assertIn('missing_bootstrap_scope', helper.assess(data)['exceeded'])

    def test_bootstrap_exhaustion_is_needs_extra_review(self):
        data = known(); data['maker'] = dict.fromkeys(helper.METRICS)
        data['bootstrap_scope'] = 'one delta'; data['next_phase']['tokens'] = 6001
        self.assertEqual(helper.assess(data)['status'], 'NEEDS_EXTRA_REVIEW')

    def test_unknown_checker_active_is_not_admitted(self):
        data = known(); data['reviewers'][0]['active_s'] = None
        self.assertIn('unknown_active_time', helper.assess(data)['exceeded'])

    def test_unknown_tokens_remain_unknown(self):
        data = known(); data['reviewers'][0]['tokens'] = None
        result = helper.assess(data)
        self.assertIsNone(result['totals']['tokens']['value'])
        self.assertFalse(result['ratio_verified'])

    def test_duplicate_reviewers_rejected(self):
        data = known(); data['reviewers'].append(data['reviewers'][0])
        with self.assertRaises(ValueError): helper.assess(data)

    def test_invalid_numbers_rejected(self):
        for bad in [True, -1, float('inf'), float('nan'), '10']:
            data = known(); data['maker']['tokens'] = bad
            with self.assertRaises(ValueError): helper.assess(data)

    def test_missing_phase_time_rejected(self):
        data = known(); del data['next_phase']['active_s']
        with self.assertRaises(ValueError): helper.assess(data)

    def test_escalation_keeps_ratio_miss(self):
        data = known(); data['reviewers'][0]['active_s'] = 110
        data['escalation'] = {'authority': 'explicit unit approval', 'reason': 'mandatory boundary',
                              'limits': {'active_s': 180, 'tokens': 10000, 'cost': 1}}
        result = helper.assess(data)
        self.assertTrue(result['escalated']); self.assertIn('active_s', result['target_missed'])

    def test_incomplete_escalation_rejected(self):
        data = known(); data['escalation'] = {'reason': 'needed'}
        with self.assertRaises(ValueError): helper.assess(data)

    def test_receipt_exact_identity_and_success_required(self):
        row = {key: key + '-pinned' for key in helper.IDENTITY}; row['exit_code'] = 0
        pair = {'existing': row, 'requested': copy.deepcopy(row)}
        self.assertEqual(helper.reuse(pair)['status'], 'REUSABLE_IDENTITY')
        for key in helper.IDENTITY:
            changed = copy.deepcopy(pair); changed['requested'][key] = 'different'
            self.assertEqual(helper.reuse(changed)['status'], 'DO_NOT_REUSE')
        for bad in [1, None, False]:
            changed = copy.deepcopy(pair); changed['existing']['exit_code'] = bad
            self.assertEqual(helper.reuse(changed)['status'], 'DO_NOT_REUSE')

    def test_preflight_checks_import_and_temp_then_cleans_probe(self):
        with tempfile.TemporaryDirectory(prefix='checker-canonical-test-') as folder:
            root = Path(folder); (root / 'budget_fixture_module.py').write_text('value = 1\n')
            sys.path.insert(0, folder)
            try:
                args = argparse.Namespace(root=folder, import_root=folder,
                                          import_name='budget_fixture_module', temp_parent=folder)
                result = helper.preflight(args)
                self.assertEqual(result['status'], 'PREFLIGHT_OK')
                self.assertEqual(list(root.iterdir()), [root / 'budget_fixture_module.py'])
                args.import_name = 'json'
                with self.assertRaises(ValueError): helper.preflight(args)
            finally:
                sys.path.remove(folder)


if __name__ == '__main__':
    unittest.main(verbosity=2)
