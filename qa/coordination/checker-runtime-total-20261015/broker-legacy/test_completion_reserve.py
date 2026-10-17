"""Pure focused tests for staged reserve delta; broker executes, no global writes."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name('review_budget.py')
spec = importlib.util.spec_from_file_location('reserve_candidate', path)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def metrics():
    return {'maker': {'active_s': None, 'tokens': None, 'cost': None},
            'reviewers': [{'id': 'checker', 'active_s': 0, 'tokens': 0, 'cost': None}],
            'next_phase': {'kind': 'review', 'active_s': 150, 'tokens': 5200, 'cost': None},
            'bootstrap_scope': 'one exact candidate, mandatory evidence and final verdict',
            'completion_reserve': True, 'completion_reserve_id': 'unit-cycle0-candidate-sha'}


class ReserveTests(unittest.TestCase):
    def test_review_fits_exactly_with_completion_reserve(self):
        result = helper.assess(metrics())
        self.assertEqual(result['status'], 'BOOTSTRAP_REVIEW')
        self.assertEqual(result['limits']['active_s'], 180)
        self.assertEqual(result['limits']['tokens'], 6000)
        self.assertEqual(result['completion_reserve']['allocation'], {'active_s': 30, 'tokens': 800})

    def test_review_cannot_consume_final_seconds_or_tokens(self):
        for key, value in [('active_s', 151), ('tokens', 5201)]:
            data = metrics(); data['next_phase'][key] = value
            self.assertIn('completion_reserve_' + key, helper.assess(data)['exceeded'])

    def test_previous_children_debits_are_included_before_reserve(self):
        data = metrics()
        data['reviewers'].append({'id': 'child', 'active_s': None, 'tokens': None,
                                 'budget_debit': {'active_s': 1, 'tokens': 1}})
        result = helper.assess(data)
        self.assertIn('completion_reserve_active_s', result['exceeded'])
        self.assertIn('completion_reserve_tokens', result['exceeded'])
        self.assertIsNone(result['totals']['active_s']['value'])

    def test_finalization_spends_remaining_reserve_without_adding_it(self):
        data = metrics(); data['reviewers'][0].update(active_s=150, tokens=5200)
        data['next_phase'].update(kind='finalization', active_s=30, tokens=800)
        result = helper.assess(data)
        self.assertEqual(result['status'], 'BOOTSTRAP_REVIEW')
        self.assertEqual(result['limits']['active_s'], 180)
        self.assertEqual(result['limits']['tokens'], 6000)

    def test_finalization_cannot_allocate_more_than_reserve(self):
        data = metrics(); data['next_phase'].update(kind='finalization', active_s=31, tokens=801)
        result = helper.assess(data)
        self.assertIn('finalization_allocation_active_s', result['exceeded'])
        self.assertIn('finalization_allocation_tokens', result['exceeded'])

    def test_committed_finalization_cannot_be_spent_twice(self):
        data = metrics(); data['reviewers'][0]['phase_kind'] = 'finalization'
        data['next_phase'].update(kind='finalization', active_s=1, tokens=1)
        result = helper.assess(data)
        self.assertIn('finalization_already_committed_active_s', result['exceeded'])
        self.assertIn('finalization_already_committed_tokens', result['exceeded'])

    def test_review_cannot_restart_after_finalization(self):
        data = metrics(); data['reviewers'][0]['phase_kind'] = 'finalization'
        self.assertEqual(helper.assess(data)['status'], 'NEEDS_EXTRA_REVIEW')

    def test_zero_work_accounting_after_finalization_is_allowed(self):
        data = metrics(); data['reviewers'][0]['phase_kind'] = 'finalization'
        data['next_phase'].update(kind='finalization', active_s=0, tokens=0)
        self.assertEqual(helper.assess(data)['status'], 'BOOTSTRAP_REVIEW')

    def test_actual_overrun_still_cannot_hide_under_lower_debit(self):
        data = metrics()
        data['reviewers'][0].update(active_s=160, tokens=5300,
                                  budget_debit={'active_s': 1, 'tokens': 1})
        data['next_phase'].update(kind='finalization', active_s=30, tokens=800)
        result = helper.assess(data)
        self.assertIn('active_s', result['exceeded']); self.assertIn('tokens', result['exceeded'])

    def test_legacy_callers_explicitly_unprotected_and_unchanged(self):
        data = metrics(); del data['completion_reserve']
        data['next_phase'].update(active_s=180, tokens=6000)
        result = helper.assess(data)
        self.assertEqual(result['status'], 'BOOTSTRAP_REVIEW')
        self.assertEqual(result['completion_reserve']['status'], 'legacy_unreserved')

    def test_malformed_opt_in_or_phase_rejected(self):
        for bad in [1, None, 'true', {}]:
            data = metrics(); data['completion_reserve'] = bad
            with self.assertRaises(ValueError): helper.assess(data)
        data = metrics(); data['next_phase']['kind'] = 'anything'
        with self.assertRaises(ValueError): helper.assess(data)

    def test_unknown_actuals_and_mandatory_debits_still_fail_honestly(self):
        data = metrics(); data['reviewers'][0]['active_s'] = None
        result = helper.assess(data)
        self.assertIn('unknown_active_time', result['exceeded'])
        self.assertFalse(result['ratio_verified'])
        self.assertIsNone(result['totals']['cost']['value'])

    def test_new_candidate_keeps_old_charges_but_has_own_completion(self):
        data = metrics()
        data['reviewers'][0].update(phase_kind='finalization',
                                  completion_reserve_id='older-cycle-candidate', active_s=20, tokens=500)
        data['next_phase'].update(active_s=130, tokens=4700)
        result = helper.assess(data)
        self.assertEqual(result['status'], 'BOOTSTRAP_REVIEW')
        self.assertEqual(result['budget_debits']['active_s']['value'], 20)

    def test_reserve_identity_required(self):
        data = metrics(); del data['completion_reserve_id']
        with self.assertRaises(ValueError): helper.assess(data)


if __name__ == '__main__':
    unittest.main(verbosity=2)
