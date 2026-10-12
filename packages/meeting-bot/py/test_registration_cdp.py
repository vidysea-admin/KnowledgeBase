"""T-052: CDP redirect interceptor for the registration POST. Fake CDP client, no browser, no network.
The ISS-374 recorded reproductions are replayed verbatim through register_form + the interceptor."""
import json
import os
import queue
import sys
import threading

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import registration_cdp as rc
import sb_join
import test_sb_join_registration_redirect as base
from test_sb_join_registration_redirect import INSTRUCTIONS, FakeSB, unapproved

ORIGIN = "https://reg.example.com/register"
APPROVED = ["reg.example.com", "pay.example.com"]
POST_URL = "https://reg.example.com/submit"
LOCAL_POST = "http://127.0.0.1:50700/submit"


class FakeCDP:
    def __init__(self, fail_enable=False):
        self.sent, self.handler, self._alive, self.fail_enable, self.closed = [], None, True, fail_enable, False

    def set_handler(self, fn):
        self.handler = fn

    def send(self, method, params=None):
        if method == "Fetch.enable" and self.fail_enable:
            raise RuntimeError("no CDP")
        self.sent.append((method, params))
        return {}

    def alive(self):
        return self._alive

    def close(self):
        self.closed = True

    def methods(self, name):
        return [p for m, p in self.sent if m == name]


def paused(rid, url, method="POST", status=None, location=None, rtype="Fetch", net="N1", redirected=None):
    event = {"requestId": rid, "networkId": net, "resourceType": rtype, "request": {"url": url, "method": method}}
    if status is not None:
        event["responseStatusCode"] = status
        event["responseHeaders"] = [{"name": "Content-Type", "value": "text/html"}] + (
            [{"name": "location", "value": location}] if location is not None else [])
    if redirected:
        event["redirectedRequestId"] = redirected
    return event


def interceptor(origin=ORIGIN, approved=APPROVED):
    cdp = FakeCDP()
    icp = rc.RedirectInterceptor(cdp, approved, origin)
    icp.start()
    return icp, cdp


def drive(status, location, url=POST_URL):
    """A POST answered with status/location; returns (interceptor, cdp)."""
    icp, cdp = interceptor()
    cdp.handler(paused("r1", url))
    cdp.handler(paused("r1", url, status=status, location=location))
    return icp, cdp


def followed(cdp):
    return bool(cdp.methods("Fetch.continueResponse")) and not cdp.methods("Fetch.failRequest")


def refused(cdp):
    return bool(cdp.methods("Fetch.failRequest")) and not cdp.methods("Fetch.continueResponse")


def test_enable_uses_request_and_response_stage_patterns():
    _, cdp = interceptor()
    (params,) = cdp.methods("Fetch.enable")
    assert {p["requestStage"] for p in params["patterns"]} == {"Request", "Response"}


@pytest.mark.parametrize("status", [301, 302, 303])
def test_approved_https_redirect_to_another_approved_host_is_followed(status):
    icp, cdp = drive(status, "https://pay.example.com/thanks")
    assert followed(cdp) and icp.followed[0]["to"] == "https://pay.example.com/thanks" and not icp.refused


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
@pytest.mark.parametrize("loc", ["/thanks", "thanks?x=1", "https://reg.example.com/thanks", "//reg.example.com/t",
                                 "HTTPS://REG.EXAMPLE.COM./t"])
def test_relative_and_same_host_redirect_is_followed(status, loc):
    icp, cdp = drive(status, loc)
    assert followed(cdp), icp.refused


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
@pytest.mark.parametrize("loc", ["https://evil.example/x", "//evil.example/x", "http://localhost:50707/redirected",
                                 "https://reg.example.com.evil.example/x", "https://evil.example/https://reg.example.com/"])
def test_unapproved_redirects_are_refused(status, loc):
    icp, cdp = drive(status, loc)
    assert refused(cdp) and icp.refused


@pytest.mark.parametrize("status", [307, 308])
def test_body_resending_redirect_to_other_approved_host_is_refused(status):
    icp, cdp = drive(status, "https://pay.example.com/thanks")
    assert refused(cdp) and icp.refused[0]["reason"] == "body_resend_other_host"


@pytest.mark.parametrize("status", [302, 307])
def test_http_downgrade_is_refused(status):
    assert refused(drive(status, "http://reg.example.com/thanks")[1])


@pytest.mark.parametrize("status", [302, 307])
def test_http_with_the_origin_port_number_is_still_refused(status):
    assert refused(drive(status, "http://reg.example.com:443/t")[1])


def test_other_port_is_refused_default_port_is_not():
    assert refused(drive(302, "https://reg.example.com:8443/t")[1])
    assert followed(drive(302, "https://reg.example.com:443/t")[1])


@pytest.mark.parametrize("status", [302, 307])
@pytest.mark.parametrize("loc", [
    "https://reg.example.com@evil.example/x", "https://reg.example.com:pw@evil.example/x",
    "https://user:pw@reg.example.com/x", "https://evil.example\\@reg.example.com/", "https://evil.example\\.reg.example.com/",
    "https://evil.example#@reg.example.com/", "https:///evil.example/x", "https:evil.example/x", "////evil.example/x",
    "https://reg.example.com\t.evil.example/", "https://reg.example.com\n@evil.example/", " https://evil.example/",
    "https://рeg.example.com/", "https://reg.example.com。evil.example/", "https://ｒeg.example.com/",
    "https://xn--reg-example.com/", "https://REG.EXAMPLE.COM.evil.example/", "https://%72eg.example.com/",
    "https://0x7f.1/", "javascript:alert(1)", "data:text/html,x", "ftp://reg.example.com/",
    "https://reg.example.com%2f@evil.example/",
])
def test_userinfo_idn_case_and_parser_confusion_tricks_are_refused(loc, status):
    icp, cdp = drive(status, loc)
    assert refused(cdp), (loc, icp.followed)


def test_missing_duplicate_location_and_non_redirect_3xx_are_refused():
    assert refused(drive(302, None)[1])
    icp, cdp = interceptor()
    cdp.handler(paused("r1", POST_URL))
    event = paused("r1", POST_URL, status=302, location="/a")
    event["responseHeaders"].append({"name": "Location", "value": "/b"})
    cdp.handler(event)
    assert refused(cdp)
    for status in (300, 304, 305, 306, 399):
        assert refused(drive(status, "/thanks")[1]), status


def test_redirect_chain_follows_each_hop_then_caps_hops():
    icp, cdp = interceptor()
    cdp.handler(paused("r0", POST_URL))
    for n in range(1, rc.MAX_HOPS + 2):
        cdp.handler(paused("r%d" % n, POST_URL, status=302, location="/next%d" % n))
        assert bool(icp.refused) == (n > rc.MAX_HOPS), n
    assert icp.refused[-1]["reason"] == "too_many_hops"


def test_redirected_request_to_unapproved_host_is_failed_at_request_stage():
    icp, cdp = interceptor()
    cdp.handler(paused("r1", POST_URL))
    cdp.handler(paused("r2", "https://evil.example/x", method="GET", redirected="r1"))
    assert cdp.methods("Fetch.failRequest") and icp.refused[0]["reason"] == "host"


def test_chain_is_tracked_by_redirected_request_id_when_network_id_is_missing():
    icp, cdp = interceptor()
    cdp.handler(dict(paused("r1", POST_URL), networkId=None))
    cdp.handler(dict(paused("r2", "https://evil.example/x", method="GET", redirected="r1"), networkId=None))
    assert icp.refused


def test_unrelated_requests_pass_untouched_and_a_second_post_is_refused():
    icp, cdp = interceptor()
    cdp.handler(paused("g1", "https://elsewhere.example/a.js", method="GET", rtype="Script", net="G"))
    cdp.handler(paused("g1", "https://elsewhere.example/a.js", method="GET", rtype="Script", net="G", status=200))
    assert not icp.refused and not cdp.methods("Fetch.failRequest")
    cdp.handler(paused("r1", POST_URL))
    cdp.handler(paused("r2", POST_URL, net="N2"))
    assert icp.refused[0]["reason"] == "extra_post"


def test_handler_error_fails_the_request_closed():
    icp, cdp = interceptor()
    cdp.handler({"requestId": "r9", "request": None})  # malformed event
    assert cdp.methods("Fetch.failRequest")[0]["requestId"] == "r9" and icp.errors


def test_post_to_unapproved_host_is_failed_at_request_stage():
    icp, cdp = interceptor()
    cdp.handler(paused("r1", "https://evil.example/submit"))
    assert cdp.methods("Fetch.failRequest") and not cdp.methods("Fetch.continueRequest")


# --- verdict ---------------------------------------------------------------------------------
def finished(final_status, redirect=True):
    icp, cdp = interceptor()
    cdp.handler(paused("r1", POST_URL))
    if redirect:
        cdp.handler(paused("r1", POST_URL, status=302, location="/thanks"))
        cdp.handler(paused("r2", "https://reg.example.com/thanks", method="GET", redirected="r1"))
        cdp.handler(paused("r2", "https://reg.example.com/thanks", method="GET", status=final_status))
    else:
        cdp.handler(paused("r1", POST_URL, status=final_status))
    return icp, cdp


@pytest.mark.parametrize("redirect", [True, False])
def test_verdict_confirms_2xx_with_and_without_redirect(redirect):
    assert finished(200, redirect)[0].verdict({"target": POST_URL}) is None


def test_verdict_never_confirms_error_or_unknown_final_status():
    assert finished(500)[0].verdict({"target": POST_URL})["status"] == "uncertain"
    assert finished(404)[0].verdict({"target": POST_URL})["status"] == "uncertain"
    icp, cdp = interceptor()
    cdp.handler(paused("r1", POST_URL))
    assert icp.verdict({"target": POST_URL})["status"] == "uncertain"  # no response seen
    assert interceptor()[0].verdict({"target": POST_URL})["status"] == "uncertain"  # no POST seen


def test_verdict_refused_hop_dead_session_or_target_mismatch_is_not_success():
    icp, _ = drive(302, "https://evil.example/")
    assert icp.verdict({"target": POST_URL})["status"] == "uncertain"
    icp, cdp = finished(200)
    cdp._alive = False
    assert icp.verdict({"target": POST_URL})["status"] == "uncertain"
    icp, _ = finished(200)
    assert icp.verdict({"target": "https://pay.example.com/submit"})["reason"] == "submitted_mismatch"


def test_verdict_refusal_alone_blocks_success():
    icp, _ = finished(200)
    icp.refused.append({"url": "x", "reason": "host"})
    assert icp.verdict({"target": POST_URL})["status"] == "uncertain"


# --- wiring through register_form (real REGISTRATION_JS under node, fake CDP) -----------------
class CdpSB(FakeSB):
    """With redirectMode 'follow' the JS runs against a plain-200 server, then the scenario's real server
    answers (status/Location, optionally a final status) are replayed through the fake CDP; a failed
    request makes the fetch reject, exactly as in Chrome."""
    def __init__(self, scenario, box, final=200):
        super().__init__(scenario)
        self.box, self.final = box, final

    def execute_async_script(self, script, instructions, action):
        if action != "submit" or instructions.get("redirectMode") != "follow":
            return super().execute_async_script(script, instructions, action)
        server = self.scenario.get("server", {}).get("/submit", {"code": 200})
        saved, self.scenario = self.scenario, dict(self.scenario, server={"/submit": {"code": 200}})
        try:  # the shared harness helper ignores the instructions argument, so pass them through here
            base.INSTRUCTIONS = instructions
            out = super().execute_async_script(script, instructions, action)
        finally:
            base.INSTRUCTIONS = INSTRUCTIONS
        self.scenario = saved
        assert self.submit_runs[-1]["posts"][0]["redirect"] == "follow"
        cdp = self.box[0]
        cdp.handler(paused("r1", LOCAL_POST))
        cdp.handler(paused("r1", LOCAL_POST, status=server["code"], location=server.get("location")))
        if server["code"] in rc.REDIRECT_CODES and followed(cdp):
            nxt = "http://127.0.0.1:50700" + server["location"] if server["location"].startswith("/") else server["location"]
            cdp.handler(paused("r2", nxt, method="GET", redirected="r1"))
            if not cdp.methods("Fetch.failRequest"):
                cdp.handler(paused("r2", nxt, method="GET", status=self.final))
        if cdp.methods("Fetch.failRequest"):
            return {"status": "uncertain", "reason": "submission_not_confirmed"}  # fetch rejects
        return out


def register_cdp(scenario, connect=True, final=200, instructions=INSTRUCTIONS):
    box = []

    def factory(_driver):
        box.append(FakeCDP())
        return box[0]
    sb = CdpSB(scenario, box, final)
    result = sb_join.register_form(sb, instructions, script_isolated=True, policy_check=lambda: True,
                                   cdp_connect=factory if connect else None)
    return result, sb, box


@pytest.mark.parametrize("code", [307, 308])
def test_iss_374_replay_unapproved_localhost_redirect_still_refused_with_interceptor(code):
    # ledger reproductions: "/submit -> 307 (308) Location unapproved localhost /redirected"
    result, sb, box = register_cdp({"server": {"/submit": {"code": code, "location": "http://localhost:50707/redirected"}}})
    assert result == {"status": "uncertain", "reason": "submission_not_confirmed"}
    assert box[0].methods("Fetch.failRequest") and not box[0].methods("Fetch.continueResponse")
    assert unapproved(sb.submit_runs) == [] and box[0].closed


@pytest.mark.parametrize("code", [307, 308])
def test_iss_374_replay_without_cdp_keeps_redirect_error_path(code):
    scenario = {"server": {"/submit": {"code": code, "location": "http://localhost:50707/redirected"}}}
    result, sb, _ = register_cdp(scenario, connect=False)
    assert result == {"status": "uncertain", "reason": "submission_not_confirmed"}
    assert sb.submit_runs[0]["posts"][0]["redirect"] == "error" and len(sb.submit_runs[0]["posts"]) == 1


def test_approved_302_with_interceptor_registers_again():
    result, sb, box = register_cdp({"server": {"/submit": {"code": 302, "location": "/thanks"}}})
    assert result["status"] == "submitted" and result["reason"] == "awaiting_confirmation"
    assert box[0].methods("Fetch.disable") and box[0].closed


def test_307_to_other_approved_host_is_refused_end_to_end():
    two = dict(INSTRUCTIONS, allowedHosts=["127.0.0.1", "localhost"])
    result, _, box = register_cdp({"server": {"/submit": {"code": 307, "location": "http://localhost:50700/thanks"}}}, instructions=two)
    assert result == {"status": "uncertain", "reason": "submission_not_confirmed"}
    assert box[0].methods("Fetch.failRequest")


def test_final_non_2xx_after_approved_redirect_is_not_reported_as_submitted():
    result, _, _ = register_cdp({"server": {"/submit": {"code": 302, "location": "/thanks"}}}, final=500)
    assert result == {"status": "uncertain", "reason": "submission_not_confirmed"}


@pytest.mark.parametrize("failure", ["enable", "connect"])
def test_cdp_unavailable_falls_back_to_redirect_error(failure):
    made = []

    def connect(_driver):
        if failure == "connect":
            raise RuntimeError("no debugger")
        made.append(FakeCDP(fail_enable=True))
        return made[0]
    sb = CdpSB({"server": {"/submit": {"code": 302, "location": "http://127.0.0.1:50700/thanks"}}}, [])
    result = sb_join.register_form(sb, INSTRUCTIONS, script_isolated=True, policy_check=lambda: True, cdp_connect=connect)
    assert result == {"status": "uncertain", "reason": "submission_not_confirmed"}
    assert sb.submit_runs[0]["posts"][0]["redirect"] == "error"
    assert all(c.closed for c in made)


def test_old_path_unchanged_when_no_connector_given():
    result, sb, _ = register_cdp({}, connect=False)
    assert result["status"] == "submitted" and sb.submit_runs[0]["posts"][0]["redirect"] == "error"


# --- PageCdp framing (fake websocket) ----------------------------------------------------------
def test_page_cdp_round_trip_and_event_dispatch():
    class WS:
        def __init__(self):
            self.inbox, self.sent = queue.Queue(), []

        def send(self, text):
            message = json.loads(text)
            self.sent.append(message)
            self.inbox.put(json.dumps({"id": message["id"], "result": {}}))

        def recv(self):
            item = self.inbox.get(timeout=5)
            if item is None:
                raise OSError("closed")
            return item

        def close(self):
            self.inbox.put(None)

    ws = WS()
    cdp = rc.PageCdp(ws)
    seen, ready = [], threading.Event()

    def handler(event):
        seen.append(event)
        cdp.send("Fetch.continueRequest", {"requestId": event["requestId"]})
        ready.set()
    cdp.set_handler(handler)
    ws.inbox.put(json.dumps({"method": "Fetch.requestPaused", "params": {"requestId": "a"}}))
    assert cdp.send("Fetch.enable", {}) == {}
    assert ready.wait(5) and seen == [{"requestId": "a"}]
    assert sorted(m["method"] for m in ws.sent) == ["Fetch.continueRequest", "Fetch.enable"]
    cdp.close()
    assert not cdp.alive()
