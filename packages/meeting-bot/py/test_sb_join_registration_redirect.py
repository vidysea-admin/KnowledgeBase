"""ISS-374 / ISS-373 regressions for sb_join.register_form. No browser, no network: the real
REGISTRATION_JS runs under node against a fake DOM and a fake fetch/server
(fixtures/regsafe_dom_harness.mjs). Each case below is a recorded reproduction, run verbatim."""
import json
import os
import pathlib
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import sb_join

HERE = pathlib.Path(__file__).parent
NODE = os.environ.get("LKB_NODE") or r"C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
OPERATOR = {"firstName": "Fixture", "lastName": "Operator", "email": "fixture@example.test"}
INSTRUCTIONS = {"url": "http://127.0.0.1:50700/register", "allowedHosts": ["127.0.0.1"], "localFixture": True,
                "operator": OPERATOR,
                "form": {"mode": "native-html", "formSelector": "#registration", "submitSelector": "button[type=submit]",
                         "fields": {"firstName": "#first", "lastName": "#last", "email": "#email"}}}
APPROVED = {"127.0.0.1"}


def run_harness(action, scenario):
    payload = {"script": sb_join.REGISTRATION_JS, "instructions": INSTRUCTIONS, "action": action, "scenario": scenario}
    done = subprocess.run([NODE, str(HERE / "fixtures" / "regsafe_dom_harness.mjs")], input=json.dumps(payload),
                          capture_output=True, text=True, timeout=30)
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout)


class FakeSB:
    """Stands in for the SeleniumBase object; the page script runs in node."""
    def __init__(self, scenario):
        self.scenario, self.driver, self.last = scenario, self, None
        self.submit_runs = []

    def execute_cdp_cmd(self, command, arguments):
        return {}

    def execute_script(self, script, *args):
        return True  # CSP meta install

    def execute_async_script(self, script, instructions, action):
        assert script is sb_join.REGISTRATION_JS
        out = run_harness(action, self.scenario)
        if action == "submit":
            self.submit_runs.append(out)
        return out["result"]


def register(scenario):
    sb = FakeSB(scenario)
    result = sb_join.register_form(sb, INSTRUCTIONS, script_isolated=True, policy_check=lambda: True)
    return result, sb


def unapproved(runs):
    return [p for run in runs for p in run["posts"] if p["host"] not in APPROVED]


# --- ISS-374: recorded reproductions (ledger row `reproductions`, verbatim) -----------------
@pytest.mark.parametrize("code", [307, 308])
def test_iss_374_redirect_to_unapproved_localhost_is_not_followed(code):
    # "Native POST /submit on approved 127.0.0.1 -> 307 (308) Location unapproved localhost /redirected"
    scenario = {"server": {"/submit": {"code": code, "location": "http://localhost:50707/redirected"}}}
    result, sb = register(scenario)
    assert result["status"] != "submitted"
    assert result == {"status": "uncertain", "reason": "submission_not_confirmed"}
    assert unapproved(sb.submit_runs) == []
    assert len(sb.submit_runs[0]["posts"]) == 1 and sb.submit_runs[0]["posts"][0]["redirect"] == "error"


def test_iss_374_redirect_to_approved_host_also_fails_closed():
    result, sb = register({"server": {"/submit": {"code": 307, "location": "http://127.0.0.1:50700/redirected"}}})
    assert result["status"] == "uncertain" and len(sb.submit_runs[0]["posts"]) == 1


def test_iss_374_control_follow_mode_would_leak():
    """The fake server does leak when redirects are followed: proves the cases above bite."""
    patched = sb_join.REGISTRATION_JS.replace("i.redirectMode === 'follow' ? 'follow' : 'error'", "'follow'")
    assert patched != sb_join.REGISTRATION_JS
    payload = {"script": patched, "instructions": INSTRUCTIONS, "action": "submit",
               "scenario": {"server": {"/submit": {"code": 307, "location": "http://localhost:50707/redirected"}}}}
    out = json.loads(subprocess.run([NODE, str(HERE / "fixtures" / "regsafe_dom_harness.mjs")], input=json.dumps(payload),
                                    capture_output=True, text=True, timeout=30).stdout)
    assert [p["host"] for p in out["posts"]] == ["127.0.0.1", "localhost"] and out["posts"][0]["body"] == out["posts"][1]["body"]


def test_iss_374_clean_submission_still_works_and_sends_validated_body():
    result, sb = register({})
    assert result["status"] == "submitted" and result["reason"] == "awaiting_confirmation"
    post = sb.submit_runs[0]["posts"][0]
    assert post["path"] == "/submit" and post["body"] == "first=Fixture&last=Operator&email=fixture%40example.test&csrf=token"
    assert sb.submit_runs[0]["calls"] == ["checkValidity"]  # no form.submit(), no FormData


# --- ISS-373: validate-then-use gap. Hostile mutations fired at the one point a listener could run.
MUTATIONS = ["action", "formaction", "action-localhost", "add-required-consent", "check-consent",
             "swap-value", "swap-hidden", "add-field"]


@pytest.mark.parametrize("mutation", MUTATIONS)
def test_iss_373_mutation_after_validation_sends_nothing(mutation):
    result, sb = register({"onValidate": mutation})
    assert result["status"] == "action_required", (mutation, result)
    assert [run["posts"] for run in sb.submit_runs] == [[]]
    assert unapproved(sb.submit_runs) == []


def test_iss_373_native_submit_and_formdata_are_never_used():
    for mutation in (None, "action"):
        scenario = {"onValidate": mutation} if mutation else {}
        _, sb = register(scenario)
        assert set(sb.submit_runs[0]["calls"]) <= {"checkValidity"}


def test_python_rejects_a_result_that_differs_from_the_validated_values(monkeypatch):
    sb = FakeSB({})
    real = sb.execute_async_script

    def tampered(script, instructions, action):
        out = real(script, instructions, action)
        if action == "submit":
            out = dict(out, values=dict(out["values"], email="attacker@evil.example"))
        return out
    sb.execute_async_script = tampered
    assert sb_join.register_form(sb, INSTRUCTIONS, script_isolated=True, policy_check=lambda: True) == {
        "status": "uncertain", "reason": "submitted_mismatch"}
    sb.execute_async_script = lambda s, i, a: dict(real(s, i, a), target="http://localhost:1/x") if a == "submit" else real(s, i, a)
    assert sb_join.register_form(sb, INSTRUCTIONS, script_isolated=True, policy_check=lambda: True)["reason"] == "submitted_mismatch"


def test_retry_receipt_proves_only_exits_before_submit_entry(monkeypatch):
    import sb_join_register
    import registration_cdp
    class Stub:
        driver = None
        def __init__(self, inspect):
            self.driver = self
            self.inspect = inspect
        def execute_cdp_cmd(self, *args):
            return {}
        def execute_async_script(self, *args):
            return self.inspect
        def execute_script(self, *args):
            return True
    called = []
    def submit(*args):
        called.append(True)
        return {"status": "action_required", "reason": "field_mismatch", "submissionDisposition": "not-attempted"}
    monkeypatch.setattr(registration_cdp, "submit_with_redirects", submit)
    result = sb_join_register.register_form(Stub({"status": "action_required", "reason": "field_mismatch"}),
        INSTRUCTIONS, script_isolated=True, policy_check=lambda: True)
    assert result == {"status": "action_required", "reason": "field_mismatch", "submissionDisposition": "not-attempted"}
    assert called == []
    result = sb_join_register.register_form(Stub({"status": "ready"}), INSTRUCTIONS,
        script_isolated=True, policy_check=lambda: True)
    assert called == [True]
    assert "submissionDisposition" not in result
