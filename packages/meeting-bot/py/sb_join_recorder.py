"""sb_join: recorder-extension ownership proof, registration policy install and CDP session (moved verbatim from main()).

The context manager wraps what main() ran inside `try:` ... `finally:`; `os` and `time` are keyword parameters so main()
hands over its own (patchable) module globals.
"""
import contextlib
import json
from types import SimpleNamespace


@contextlib.contextmanager
def recorder_link(sb, a, registration, policy_extension, *, os, time):
    import math
    import re
    import psutil
    import urllib.request
    import websocket
    from urllib.parse import urlparse
    if websocket.__version__ != "1.9.2":
        raise RuntimeError("Managed capture requires pinned websocket-client 1.9.2")
    browser_pid = getattr(sb.driver, "browser_pid", None)
    if not isinstance(browser_pid, int) or isinstance(browser_pid, bool) or browser_pid <= 0 or not a.browser_executable:
        raise RuntimeError("Cannot verify managed recorder browser ownership")
    expected_exe = os.path.normcase(os.path.realpath(a.browser_executable))
    expected_profile = os.path.normcase(os.path.realpath(a.profile))
    identity = None
    deadline = time.monotonic() + 15
    def remaining():
        budget = deadline - time.monotonic()
        if budget <= 0:
            raise RuntimeError("Recorder extension invocation deadline exceeded")
        return min(5, budget)
    address = sb.driver.capabilities.get("goog:chromeOptions", {}).get("debuggerAddress", "")
    if not isinstance(address, str) or not re.fullmatch(r"127\.0\.0\.1:[0-9]{1,5}", address):
        raise RuntimeError("Recorder debugger endpoint ownership refused")
    port = int(address.split(":")[1])
    if not 1 <= port <= 65535:
        raise RuntimeError("Recorder debugger port refused")
    connection, worker_session = None, None
    sequence = 0
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args, **_kwargs):
            raise RuntimeError("Recorder debugger redirects refused")
    def arm(seconds):
        nonlocal deadline
        deadline = time.monotonic() + seconds

    try:
        for phase in ("before-connect", "before-action"):
            process = psutil.Process(browser_pid)
            argv = process.cmdline()
            profiles = [arg.split("=", 1)[1] for arg in argv if arg.startswith("--user-data-dir=")]
            profiles += [argv[index + 1] if index + 1 < len(argv) else "" for index, arg in enumerate(argv) if arg == "--user-data-dir"]
            created = process.create_time()
            if (os.path.normcase(os.path.realpath(process.exe())) != expected_exe or
                any(arg == "--type" or arg.startswith("--type=") for arg in argv) or not profiles or
                any(not value or not os.path.isabs(value) or os.path.normcase(os.path.realpath(value)) != expected_profile for value in profiles) or
                not isinstance(created, (int, float)) or isinstance(created, bool) or not math.isfinite(created) or created <= 0):
                raise RuntimeError("Recorder browser process identity refused")
            current_identity = (browser_pid, expected_exe, expected_profile, created)
            if identity is not None and identity != current_identity:
                raise RuntimeError("Recorder browser process identity changed")
            identity = current_identity
            if phase == "before-action":
                break
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open("http://" + address + "/json/version", timeout=remaining()) as response:
                payload = response.read(1048577)
            if len(payload) > 1048576:
                raise RuntimeError("Recorder debugger response oversized")
            endpoint = json.loads(payload)["webSocketDebuggerUrl"]
            parsed = urlparse(endpoint)
            if (parsed.scheme != "ws" or parsed.hostname != "127.0.0.1" or parsed.port != port or
                parsed.username or parsed.password or parsed.query or parsed.fragment or
                not re.fullmatch(r"/devtools/browser/[A-Za-z0-9-]+", parsed.path)):
                raise RuntimeError("Recorder browser websocket ownership refused")
            connection = websocket.create_connection(endpoint, timeout=remaining(), suppress_origin=True,
                                                     http_no_proxy=["127.0.0.1"], redirect_limit=0)
            def command(method, params=None, session=None):
                nonlocal sequence
                sequence += 1
                connection.settimeout(remaining())
                request = {"id": sequence, "method": method, "params": params or {}}
                if session:
                    request["sessionId"] = session
                connection.send(json.dumps(request))
                for _ in range(64):
                    connection.settimeout(remaining())
                    reply = connection.recv()
                    if not isinstance(reply, str) or len(reply) > 1048576:
                        raise RuntimeError("Recorder CDP message refused")
                    reply = json.loads(reply)
                    if not isinstance(reply, dict):
                        raise RuntimeError("Recorder CDP reply shape refused")
                    if "id" in reply:
                        if type(reply["id"]) is not int or reply["id"] != sequence:
                            raise RuntimeError("Recorder CDP reply identity refused")
                        if "error" in reply or not isinstance(reply.get("result"), dict):
                            raise RuntimeError("Recorder CDP " + method + " failed")
                        return reply["result"]
                raise RuntimeError("Recorder CDP event limit exceeded")
            extensions = command("Extensions.getExtensions").get("extensions", [])
            expected_extension = os.path.normcase(os.path.realpath(policy_extension))
            owned = [item for item in extensions if item.get("enabled") is True and item.get("path") and os.path.normcase(os.path.realpath(item["path"])) == expected_extension]
            if len(owned) != 1 or not re.fullmatch(r"[a-p]{32}", owned[0].get("id", "")):
                raise RuntimeError("Recorder extension ownership mapping refused")
            extension_id = owned[0]["id"]
            while True:
                targets = command("Target.getTargets").get("targetInfos", [])
                workers = [item for item in targets if item.get("type") == "service_worker" and item.get("url") == "chrome-extension://" + extension_id + "/background.js"]
                if len(workers) == 1:
                    break
                if len(workers) > 1:
                    raise RuntimeError("Recorder extension worker ambiguous")
                time.sleep(min(0.1, remaining()))
            if not isinstance(workers[0].get("targetId"), str) or not workers[0]["targetId"]:
                raise RuntimeError("Recorder extension worker identity refused")
            worker_session = command("Target.attachToTarget", {"targetId": workers[0]["targetId"], "flatten": True}).get("sessionId")
            if not isinstance(worker_session, str) or not worker_session:
                raise RuntimeError("Recorder extension worker attachment refused")
            # A clean blank target replaces every restored registration page before policy changes.
            sb.driver.switch_to.new_window("tab")
            current_target = sb.driver.current_window_handle.removeprefix("CDwindow-")
            pages = [item for item in command("Target.getTargets").get("targetInfos", []) if item.get("type") == "page"]
            if not any(item.get("targetId") == current_target and item.get("url") == "about:blank" for item in pages):
                raise RuntimeError("Registration blank target ownership refused")
            for item in pages:
                if item.get("targetId") != current_target:
                    if command("Target.closeTarget", {"targetId": item["targetId"]}).get("success") is not True:
                        raise RuntimeError("Restored registration target removal unproved")
            while True:
                remaining_pages = [item for item in command("Target.getTargets").get("targetInfos", []) if item.get("type") == "page"]
                if len(remaining_pages) == 1 and remaining_pages[0].get("targetId") == current_target:
                    break
                time.sleep(min(0.1, remaining()))
        def evaluate_policy(expression):
            answer = command("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True}, worker_session)
            if answer.get("exceptionDetails"):
                raise RuntimeError("Registration policy evaluation refused")
            return answer.get("result", {}).get("value")
        policy_check = None
        if registration:
            import hashlib
            import uuid
            from urllib.parse import urlsplit
            allowed = registration["allowedHosts"]
            parsed_policy_url = urlsplit(a.url)
            scheme = parsed_policy_url.scheme
            port = parsed_policy_url.port if parsed_policy_url.port is not None else (443 if scheme == "https" else 80)
            local_http = registration.get("localFixture") is True and parsed_policy_url.hostname in ("127.0.0.1", "localhost")
            if not 1 <= port <= 65535 or scheme != "https" and not (scheme == "http" and local_http):
                raise RuntimeError("Registration policy origin refused")
            port_pattern = "(:" + str(port) + ")?" if port == (443 if scheme == "https" else 80) else ":" + str(port)
            resources = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"]
            rules = [{"id": 910001, "priority": 1, "action": {"type": "block"}, "condition": {"urlFilter": "*", "resourceTypes": resources}}]
            for host in sorted(set(allowed)):
                if (not re.fullmatch(r"[a-z0-9.-]{1,253}", host)
                    or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                           for label in (host[:-1] if host.endswith(".") else host).split("."))):
                    raise RuntimeError("Registration policy host refused")
                if scheme == "http" and host not in ("127.0.0.1", "localhost"):
                    raise RuntimeError("Registration policy local origin refused")
                rules.append({"id": 910001 + len(rules), "priority": 2, "action": {"type": "allow"},
                              "condition": {"regexFilter": "^" + scheme + "://" + re.escape(host) + port_pattern + "/", "resourceTypes": resources}})
            fingerprint = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            receipt = {"nonce": str(uuid.uuid4()), "browserPid": browser_pid, "browserCreatedAt": identity[3],
                       "profile": expected_profile, "extensionId": extension_id, "fingerprint": fingerprint}
            expected = {"receipt": receipt, "rules": rules, "javascript": {"setting": "block"}}
            policy_origin = parsed_policy_url.scheme + "://" + parsed_policy_url.netloc + "/"
            installed = evaluate_policy("installRegistrationPolicy(" + json.dumps({"receipt": receipt, "rules": rules, "primaryUrl": policy_origin}) + ")")
            def verify_policy():
                nonlocal deadline
                deadline = time.monotonic() + 10
                process = psutil.Process(browser_pid)
                if process.create_time() != receipt["browserCreatedAt"] or os.path.normcase(os.path.realpath(process.exe())) != expected_exe:
                    raise RuntimeError("Registration browser identity changed")
                value = evaluate_policy("readRegistrationPolicy(" + json.dumps(policy_origin) + ")")
                if value != expected:
                    raise RuntimeError("Registration policy receipt mismatch")
                return True
            if installed != expected or verify_policy() is not True:
                raise RuntimeError("Registration policy installation unproved")
            policy_check = verify_policy
        else:
            cleared = evaluate_policy("clearRegistrationPolicy(" + json.dumps({"extensionId": extension_id, "priorTargetsGone": True, "primaryUrl": a.url}) + ")")
            if (not isinstance(cleared, dict) or cleared.get("rules") or cleared.get("receipt") is not None
                    or cleared.get("javascript") != {"setting": "allow"}):
                raise RuntimeError("Registration policy removal unproved")
        yield SimpleNamespace(policy_check=policy_check, command=command, extension_id=extension_id, arm=arm)
    finally:
        if connection is not None:
            if worker_session is not None:
                try:
                    command("Target.detachFromTarget", {"sessionId": worker_session})
                except Exception:
                    pass
            close_budget = max(0, min(1, deadline - time.monotonic()))
            if close_budget:
                connection.settimeout(close_budget)
                connection.close(timeout=close_budget)
            else:
                connection.shutdown()
