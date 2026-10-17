import importlib.util
import json
from pathlib import Path
import shutil
import sys
import threading
import unittest
import uuid

spec = importlib.util.spec_from_file_location("bounded", Path(__file__).with_name("bounded-review-transport.py"))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class Fake:
    offline_fake = True
    capabilities = {"exact_complete_input", "stateless_text", "total_output_cap", "deadline"}

    def __init__(self, mutate=None, exact=10):
        self.calls = 0
        self.exact = exact
        self.mutate = mutate

    def count(self, raw, *, deadline):
        if self.mutate:
            self.mutate()
        return dict(input_tokens=self.exact, payload_sha256=b.digest(raw), model="fake-pinned")

    def generate(self, raw, *, max_output_tokens, deadline):
        self.calls += 1
        self.cap = max_output_tokens
        return dict(payload_sha256=b.digest(raw), model="fake-pinned", output="review text",
                    usage=dict(input_tokens=self.exact, output_tokens=5, cached_tokens=3, reasoning_tokens=4))


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2] / "qa/coordination/checker-hard-budget-20261015/transport-maker" / ("fixture-" + uuid.uuid4().hex)
        self.root.mkdir(parents=True)
        self.path = self.root / "request.json"
        self.raw = b.encode(dict(model="fake-pinned", instructions="Inspect sealed facts", input="facts"))
        self.path.write_bytes(self.raw)
        self.ledger = b.Ledger(self.root / "ledger.json")
        self.ledger.initialize("unit/cycle/candidate", 1000, 100)

    def tearDown(self):
        shutil.rmtree(self.root)

    def run_fake(self, fake=None, **kw):
        return b.execute(self.ledger, self.path, identity="unit/cycle/candidate",
                         expected_sha256=b.digest(self.raw), pinned_model="fake-pinned",
                         client=fake or Fake(), reserve_tokens=10, **kw)

    def test_allowed_completion_and_subsets(self):
        self.run_fake()
        row = self.ledger.read()["attempts"][0]
        self.assertEqual(row["actual_total"], 15)
        self.assertEqual(row["semantic_verdict"], "NOT_EVALUATED")

    def test_input_exhaustion_zero_generation(self):
        fake = Fake(exact=90)
        with self.assertRaises(b.Refused):
            self.run_fake(fake)
        self.assertEqual(fake.calls, 0)
        self.assertEqual(self.ledger.read()["attempts"][0]["charged_tokens"], 100)

    def test_mutation_between_count_and_generation(self):
        fake = Fake(mutate=lambda: self.path.write_bytes(b"changed"))
        with self.assertRaises(b.Refused):
            self.run_fake(fake)
        self.assertEqual(fake.calls, 0)

    def test_retry_aggregate_and_no_reset(self):
        self.run_fake(); self.run_fake()
        rows = self.ledger.read()["attempts"]
        self.assertEqual([r["output_cap"] for r in rows], [80, 65])
        with self.assertRaises(b.Refused):
            self.ledger.initialize("new", 100, 10)

    def test_concurrent_reservation(self):
        entered = threading.Event(); release = threading.Event()
        errors = []
        def block():
            entered.set()
            if not release.wait(2):
                raise RuntimeError("test release timeout")
        def run():
            try:
                self.run_fake(Fake(mutate=block))
            except BaseException as exc:
                errors.append(exc)
        thread = threading.Thread(target=run)
        thread.start()
        try:
            self.assertTrue(entered.wait(2))
            second = Fake()
            with self.assertRaises(b.Refused):
                self.run_fake(second)
            self.assertEqual(second.calls, 0)
        finally:
            release.set(); thread.join(2)
        self.assertFalse(thread.is_alive()); self.assertFalse(errors)

    def test_unknown_denominator_and_usage_fail_closed(self):
        with self.assertRaises(b.Refused):
            b.Ledger(self.root / "other").initialize("id", None, 10)
        fake = Fake()
        fake.generate = lambda *args, **kwargs: dict(usage={})
        with self.assertRaises(b.Refused):
            self.run_fake(fake)
        with self.assertRaises(b.Refused):
            self.run_fake()

    def test_hidden_output_cap_property(self):
        for exact in (0, 1, 17, 89):
            ledger = b.Ledger(self.root / (str(exact) + ".json"))
            ledger.initialize("unit/cycle/candidate", 1000, 100)
            fake = Fake(exact=exact)
            # Use exactly the cap, including 4 hidden reasoning tokens when possible.
            def generate(raw, *, max_output_tokens, deadline):
                return dict(payload_sha256=b.digest(raw), model="fake-pinned",
                            usage=dict(input_tokens=exact, output_tokens=max_output_tokens,
                                       reasoning_tokens=min(4, max_output_tokens)))
            fake.generate = generate
            b.execute(ledger, self.path, identity="unit/cycle/candidate", expected_sha256=b.digest(self.raw),
                      pinned_model="fake-pinned", client=fake, reserve_tokens=10)
            self.assertLessEqual(ledger.read()["attempts"][0]["actual_total"], 90)

    def test_no_unapproved_real_network(self):
        fake = Fake(); fake.offline_fake = False
        with self.assertRaises(b.Refused):
            self.run_fake(fake)
        self.assertEqual(fake.calls, 0)
        self.assertEqual(self.ledger.read()["attempts"], [])

    def test_deadline_and_payload_capabilities(self):
        with self.assertRaises(b.Refused):
            self.run_fake(clock=iter([0, 11]).__next__)
        self.assertEqual(self.ledger.read()["attempts"][0]["state"], "reserved")


if __name__ == "__main__":
    unittest.main()
