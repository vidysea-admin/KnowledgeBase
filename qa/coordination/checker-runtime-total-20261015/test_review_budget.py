"""Focused unit-boundary and backward-compatibility checks; no provider calls."""
import copy
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("staged_review_budget", Path(__file__).with_name("review_budget.py"))
budget = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(budget)


def sample(actual=True):
    data = {
        "maker": {"active_s": 10000, "tokens": 1000000, "cost": 100},
        "reviewers": [{"id": "child-1", "active_s": 10, "tokens": 41000, "cost": 1}],
        "next_phase": {"active_s": 10, "tokens": 1000, "output_tokens": 800, "cost": .1},
    }
    if actual:
        data["token_metric"] = "actual_total"
        for obj in [data["maker"], *data["reviewers"], data["next_phase"]]:
            obj["token_metric"] = "actual_total"
    return data


class TokenMetricTests(unittest.TestCase):
    def test_actual_total_is_not_output_allocation(self):
        data = sample()
        for obj in [data["maker"], *data["reviewers"], data["next_phase"]]:
            obj["cost"] = None
        data["bootstrap_scope"] = "one phase with unknown optional cost"
        result = budget.assess(data)
        self.assertEqual(result["totals"]["tokens"]["value"], 41000)
        self.assertEqual(result["output_token_allocation"], 800)
        self.assertEqual(result["ratios"]["tokens"], .041)
        self.assertTrue(result["ratio_verified_by_metric"]["tokens"])
        self.assertTrue(result["ratio_verified_by_metric"]["active_s"])
        self.assertFalse(result["ratio_verified_by_metric"]["cost"])
        self.assertFalse(result["ratio_verified"])

    def test_legacy_arithmetic_and_reserve_remain_unverified(self):
        data = sample(False)
        data.update(completion_reserve=True, completion_reserve_id="unit/1/sha")
        result = budget.assess(data)
        self.assertEqual(result["status"], "WITHIN_ALLOCATION")
        self.assertEqual(result["ratios"]["tokens"], .041)
        self.assertEqual(result["completion_reserve"]["allocation"], {"active_s": 30, "tokens": 800})
        self.assertEqual(result["token_accounting_status"], "unverified_legacy_units")
        self.assertFalse(result["ratio_verified_by_metric"]["tokens"])
        self.assertFalse(result["ratio_verified"])

    def test_missing_and_mixed_tags_refuse(self):
        for target in ("maker", "reviewer", "next_phase", "budget_debit", "bootstrap", "escalation"):
            for tag in (None, "legacy_allocation"):
                with self.subTest(target=target, tag=tag):
                    data = sample()
                    if target == "reviewer":
                        obj = data["reviewers"][0]
                    elif target == "budget_debit":
                        obj = data["reviewers"][0].setdefault("budget_debit", {"tokens": 6000})
                    elif target == "escalation":
                        data["escalation"] = {"authority": "Umesh", "reason": "required checks", "limits": {"tokens": 100000}}
                        obj = data["escalation"]["limits"]
                    elif target == "bootstrap":
                        obj = data.setdefault("bootstrap", {"tokens": 6000})
                    else:
                        obj = data[target]
                    obj.pop("token_metric", None)
                    if tag is not None:
                        obj["token_metric"] = tag
                    with self.assertRaises(ValueError):
                        budget.assess(data)

    def test_actual_reserve_required_positive_and_inside_total(self):
        for value in (None, 0, -1, True, float("inf")):
            data = sample()
            data.update(completion_reserve=True, completion_reserve_id="unit/1/sha", completion_reserve_tokens=value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                budget.assess(data)
        data = sample()
        data.update(completion_reserve=True, completion_reserve_id="unit/1/sha", completion_reserve_tokens=58000)
        self.assertEqual(budget.assess(data)["status"], "WITHIN_ALLOCATION")
        data["completion_reserve_tokens"] = 58001
        self.assertIn("completion_reserve_tokens", budget.assess(data)["exceeded"])

    def test_finalization_bound_and_once_only(self):
        data = sample()
        data.update(completion_reserve=True, completion_reserve_id="unit/1/sha", completion_reserve_tokens=1000)
        data["next_phase"]["kind"] = "finalization"
        self.assertEqual(budget.assess(data)["status"], "WITHIN_ALLOCATION")
        data["next_phase"]["tokens"] = 1001
        self.assertIn("finalization_allocation_tokens", budget.assess(data)["exceeded"])
        data["reviewers"][0].update(phase_kind="finalization", completion_reserve_id="unit/1/sha")
        self.assertIn("finalization_already_committed_tokens", budget.assess(data)["exceeded"])

    def test_unknown_actual_stays_unknown_and_prior_debits_accumulate(self):
        data = sample()
        data["reviewers"][0]["tokens"] = None
        data["reviewers"][0]["budget_debit"] = {"tokens": 60000, "token_metric": "actual_total"}
        data["reviewers"].append({"id": "retry-2", "active_s": 10, "tokens": 41000, "cost": None, "token_metric": "actual_total"})
        result = budget.assess(data)
        self.assertIsNone(result["totals"]["tokens"]["value"])
        self.assertIsNone(result["ratios"]["tokens"])
        self.assertFalse(result["ratio_verified_by_metric"]["tokens"])
        self.assertEqual(result["budget_debits"]["tokens"]["value"], 101000)
        self.assertIn("tokens", result["exceeded"])
        del data["reviewers"][0]["budget_debit"]
        self.assertIn("unknown_tokens_debit", budget.assess(data)["exceeded"])

    def test_commensurate_max_actual_debit_and_child_identity(self):
        data = sample()
        data["reviewers"][0]["budget_debit"] = {"tokens": 6000, "token_metric": "actual_total"}
        self.assertEqual(budget.assess(data)["budget_debits"]["tokens"]["value"], 41000)
        data["reviewers"].append(copy.deepcopy(data["reviewers"][0]))
        with self.assertRaises(ValueError):
            budget.assess(data)

    def test_output_bound_validation_and_unknown_output(self):
        for value in (1001, -1, True, float("inf")):
            data = sample()
            data["next_phase"]["output_tokens"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                budget.assess(data)
        data = sample()
        del data["next_phase"]["output_tokens"]
        self.assertIsNone(budget.assess(data)["output_token_allocation"])

    def test_bootstrap_and_escalation_do_not_reset_history(self):
        data = sample()
        data["maker"]["tokens"] = None
        data["bootstrap"] = {"tokens": 50000, "token_metric": "actual_total"}
        data["bootstrap_scope"] = "one synthetic phase"
        result = budget.assess(data)
        self.assertEqual(result["status"], "BOOTSTRAP_REVIEW")
        self.assertFalse(result["ratio_verified_by_metric"]["tokens"])
        data["escalation"] = {"authority": "Umesh", "reason": "required checks", "limits": {"active_s": 1000, "tokens": 41000, "cost": 10, "token_metric": "actual_total"}}
        result = budget.assess(data)
        self.assertIn("tokens", result["exceeded"])
        self.assertEqual(result["budget_debits"]["tokens"]["value"], 41000)

    def test_known_actual_compliance_and_misses_preserve_dimension_results(self):
        data = sample()
        data["maker"]["cost"] = 100
        data["reviewers"][0]["cost"] = 1
        data["next_phase"]["cost"] = .1
        self.assertTrue(budget.assess(data)["ratio_verified"])
        data["reviewers"][0]["tokens"] = 100001
        result = budget.assess(data)
        self.assertTrue(result["ratio_verified_by_metric"]["tokens"])
        self.assertIn("tokens", result["target_missed"])
        self.assertIn("tokens", result["exceeded"])
        data["reviewers"][0]["active_s"] = None
        self.assertFalse(budget.assess(data)["ratio_verified_by_metric"]["active_s"])

    def test_unknown_optional_cost_cannot_relax_known_primary_limits(self):
        data = sample()
        data["maker"].update(active_s=100, tokens=100000, cost=None)
        data["reviewers"][0].update(active_s=0, tokens=0, cost=None)
        data["next_phase"].update(active_s=40, tokens=20000, cost=None)
        data["bootstrap_scope"] = "bounded primary review with unknown cost"
        data["bootstrap"] = {"active_s": 120, "tokens": 200000, "token_metric": "actual_total"}
        result = budget.assess(data)
        self.assertEqual(result["status"], "NEEDS_EXTRA_REVIEW")
        self.assertEqual(result["limits"]["active_s"], 10)
        self.assertEqual(result["limits"]["tokens"], 10000)
        self.assertIn("active_s", result["exceeded"])
        self.assertIn("tokens", result["exceeded"])
        self.assertTrue(result["ratio_verified_by_metric"]["active_s"])
        self.assertTrue(result["ratio_verified_by_metric"]["tokens"])
        self.assertFalse(result["ratio_verified_by_metric"]["cost"])
        self.assertFalse(result["ratio_verified"])
        self.assertIsNone(result["totals"]["cost"]["value"])


if __name__ == "__main__":
    unittest.main()
