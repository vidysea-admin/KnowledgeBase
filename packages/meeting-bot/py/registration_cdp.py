"""T-052: CDP Fetch-domain redirect policy for the webinar registration POST.

sb_join.register_form submits with fetch(redirect:'error') (ISS-373/374), so any 3xx fails closed.
This module lets a redirect be followed again WITHOUT reopening the leak: a CDP client paused on
every request/response decides each hop. A hop is followed only when the resolved Location is
https (loopback http only for the local fixture), on the origin's port, userinfo-free, and its host
equals an approved host exactly; 307/308 (which re-send the body) additionally only to the host of
the redirecting request. Everything else is failed with Fetch.failRequest. If CDP cannot be
established the caller keeps redirect:'error' (this module is optional, never required).
"""
import json
import queue
import re
import sys
import threading
from urllib.parse import urljoin, urlsplit

REDIRECT_CODES = (301, 302, 303, 307, 308)
BODY_RESENDING = (307, 308)
MAX_HOPS = 5
LOOPBACK = ("127.0.0.1", "localhost")
# debuggerAddress forms accepted for the CDP socket: exactly these three loopback hosts, a numeric port.
LOOPBACK_ADDRESS = re.compile(r"(127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})")
_SCHEME_START = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
_ABSOLUTE = re.compile(r"^https?://[^/\\?#]", re.I)
_NETWORK_PATH = re.compile(r"^//[^/\\?#]")


def normalise_host(host):
    """Lower-case ASCII host without a single trailing dot, or None. Non-ASCII/IDN is refused outright."""
    if not isinstance(host, str) or not host or not host.isascii():
        return None
    host = host.lower()
    host = host[:-1] if host.endswith(".") else host
    return host if re.fullmatch(r"[a-z0-9.-]{1,253}", host) else None


def _origin_of(url):
    parts = urlsplit(url)
    port = parts.port if parts.port is not None else (443 if parts.scheme == "https" else 80)
    return parts.scheme, normalise_host(parts.hostname), port, parts


def check_url(url, approved, origin_scheme, origin_port):
    """(ok, reason) for a concrete request URL: exact approved host, origin scheme and port, no userinfo."""
    try:
        if not isinstance(url, str) or len(url) > 8192 or not url.isascii() \
                or any(ord(c) <= 32 or ord(c) == 127 or c == "\\" for c in url):
            return False, "malformed_url"
        scheme, host, port, parts = _origin_of(url)
        if parts.username is not None or parts.password is not None or "@" in parts.netloc:
            return False, "userinfo"
        if scheme != origin_scheme or (scheme != "https" and not (scheme == "http" and host in LOOPBACK)):
            return False, "scheme"
        if host is None or host not in approved:
            return False, "host"
        if port != origin_port:
            return False, "port"
    except ValueError:
        return False, "malformed_url"
    return True, "ok"


def check_redirect(status, location, current_url, approved, origin_scheme, origin_port):
    """Decide one redirect hop. Returns (allowed, reason, resolved_url_or_None). Fails closed."""
    try:
        if status not in REDIRECT_CODES:
            return False, "status", None
        if not isinstance(location, str) or not location or len(location) > 8192 or not location.isascii() \
                or any(ord(c) <= 32 or ord(c) == 127 or c == "\\" for c in location):
            return False, "location_malformed", None
        # Reject spellings on which Python's resolver and Chrome's URL parser disagree
        # (e.g. "https:///evil", "https:evil", "////evil"): only clean absolute / network-path / relative forms.
        if _SCHEME_START.match(location):
            if not _ABSOLUTE.match(location):
                return False, "location_form", None
        elif location.startswith("//"):
            if not _NETWORK_PATH.match(location):
                return False, "location_form", None
        resolved = urljoin(current_url, location)
        ok, reason = check_url(resolved, approved, origin_scheme, origin_port)
        if not ok:
            return False, reason, None
        if status in BODY_RESENDING and _origin_of(resolved)[1] != _origin_of(current_url)[1]:
            return False, "body_resend_other_host", None
        return True, "ok", resolved
    except (ValueError, TypeError):
        return False, "location_malformed", None


def _location(headers):
    values = [h.get("value") for h in (headers or []) if isinstance(h, dict) and str(h.get("name", "")).lower() == "location"]
    return values[0] if len(values) == 1 else None


class RedirectInterceptor:
    """Drives Fetch.* through `cdp` (send(method, params) -> dict, set_handler(fn), alive(), close())."""

    def __init__(self, cdp, approved_hosts, origin_url):
        self.cdp = cdp
        scheme, _host, port, _ = _origin_of(origin_url)
        self.scheme, self.port = scheme, port
        self.approved = {normalise_host(h) for h in approved_hosts} - {None}
        self.keys, self.chains = {}, {}
        self.followed, self.refused, self.errors = [], [], []
        self.first_url = self.final_status = None
        self.posts = 0
        self.started = False

    def start(self):
        self.cdp.set_handler(self.handle)
        reply = self.cdp.send("Fetch.enable", {"patterns": [{"urlPattern": "*", "requestStage": "Request"},
                                                            {"urlPattern": "*", "requestStage": "Response"}]})
        if not isinstance(reply, dict):
            raise RuntimeError("Fetch.enable not acknowledged")
        self.started = True

    def heartbeat(self):
        """Raise unless the socket answers a round trip right now (called just before the submit)."""
        if not self.started or not self.cdp.alive() or not isinstance(self.cdp.send("Browser.getVersion", {}), dict):
            raise RuntimeError("CDP heartbeat failed")

    def stop(self):
        try:
            if self.started:
                self.cdp.send("Fetch.disable", {})
        finally:
            self.started = False
            self.cdp.close()

    # -- event handling (any failure fails the paused request: fail closed) --
    def handle(self, event):
        rid = event.get("requestId") if isinstance(event, dict) else None
        try:
            self._handle(event)
        except Exception as error:  # noqa: BLE001
            self.errors.append(repr(error))
            self._fail(rid)

    def _fail(self, rid):
        if not rid:
            return
        try:
            self.cdp.send("Fetch.failRequest", {"requestId": rid, "errorReason": "BlockedByClient"})
        except Exception as error:  # noqa: BLE001
            self.errors.append(repr(error))

    def _handle(self, event):
        rid, request = event["requestId"], event["request"]
        key = event.get("networkId") or self.keys.get(event.get("redirectedRequestId")) or rid
        self.keys[rid] = key
        status = event.get("responseStatusCode")
        if event.get("responseErrorReason") is not None:
            if key in self.chains:
                self.errors.append("response_error:" + str(event["responseErrorReason"]))
            self._fail(rid)
            return
        if status is None:
            self._request_stage(rid, key, event, request)
        else:
            self._response_stage(rid, key, event, request, status)

    def _request_stage(self, rid, key, event, request):
        tracked = key in self.chains
        if not tracked and request.get("method") == "POST" and event.get("resourceType") in ("XHR", "Fetch"):
            self.posts += 1
            if self.posts > 1:
                self.refused.append({"url": request.get("url"), "reason": "extra_post"})
                self._fail(rid)
                return
            self.chains[key] = 0
            self.first_url = request.get("url")
            tracked = True
        if tracked:
            ok, reason = check_url(request.get("url"), self.approved, self.scheme, self.port)
            if not ok:
                self.refused.append({"url": request.get("url"), "reason": reason})
                self._fail(rid)
                return
        self.cdp.send("Fetch.continueRequest", {"requestId": rid})

    def _response_stage(self, rid, key, event, request, status):
        if key not in self.chains:
            self.cdp.send("Fetch.continueResponse", {"requestId": rid})
            return
        if 300 <= status <= 399:
            hops = self.chains[key] + 1
            allowed, reason, resolved = check_redirect(status, _location(event.get("responseHeaders")), request.get("url"),
                                                       self.approved, self.scheme, self.port)
            if hops > MAX_HOPS:
                allowed, reason = False, "too_many_hops"
            if not allowed:
                self.refused.append({"url": request.get("url"), "status": status, "reason": reason})
                self._fail(rid)
                return
            self.chains[key] = hops
            self.followed.append({"from": request.get("url"), "to": resolved, "status": status})
        else:
            self.final_status = status
        self.cdp.send("Fetch.continueResponse", {"requestId": rid})

    # -- verdict --
    def verdict(self, result):
        """None when the interception supports the page's 'submitted' result, else the downgraded result."""
        bad = {"status": "uncertain", "reason": "submission_not_confirmed"}
        if self.refused or self.errors or self.posts != 1 or not self.cdp.alive() or not self.started:
            return bad
        if not (isinstance(self.final_status, int) and 200 <= self.final_status < 300):
            return bad
        try:
            sent, seen = urlsplit(result.get("target")), urlsplit(self.first_url)
            if (sent.scheme, normalise_host(sent.hostname), sent.port or self.port, sent.path, sent.query) != \
                    (seen.scheme, normalise_host(seen.hostname), seen.port or self.port, seen.path, seen.query):
                return {"status": "uncertain", "reason": "submitted_mismatch"}
        except (ValueError, TypeError, AttributeError):
            return {"status": "uncertain", "reason": "submitted_mismatch"}
        return None


def _note_inactive(result, why):
    """CDP is off for this run: say so (stderr + result note) instead of silently using redirect:'error'."""
    print("registration-cdp inactive (" + why + "): redirect:'error' fallback in use", file=sys.stderr, flush=True)
    return dict(result, cdp="inactive", cdp_reason=why) if isinstance(result, dict) else result


def submit_with_redirects(sb, script, instructions, approved_hosts, origin_url, connect):
    """Run the 'submit' script. With a working interceptor the fetch follows redirects under CDP policy;
    without one (connect is None or fails) it is exactly the old redirect:'error' path, and that is reported
    (stderr line plus cdp/cdp_reason on a dict result) whenever a connector was supplied but could not be used."""
    interceptor, why = None, None
    driver = getattr(sb, "driver", sb)  # SB's own execute_async_script takes (script, timeout); the selenium driver takes script args
    if connect is not None:
        cdp = None
        try:
            cdp = connect(driver)
            interceptor = RedirectInterceptor(cdp, approved_hosts, origin_url)
            interceptor.start()
            interceptor.heartbeat()  # ISS-REGCDP-003: never enable 'follow' on a socket that is not answering now
        except Exception as error:  # noqa: BLE001 - CDP unavailable: fail closed to redirect:'error'
            why = str(error)[:80] or type(error).__name__
            if cdp is not None:
                try:
                    cdp.close()
                except Exception:  # noqa: BLE001
                    pass
            interceptor = None
    if interceptor is None:
        result = driver.execute_async_script(script, instructions, "submit")
        return _note_inactive(result, why) if why is not None else result
    try:
        result = driver.execute_async_script(script, dict(instructions, redirectMode="follow"), "submit")
    except Exception:
        interceptor.stop()
        raise
    # Read the verdict BEFORE stop(): stop() closes the connection.
    downgraded = interceptor.verdict(result) if isinstance(result, dict) and result.get("status") == "submitted" else None
    try:
        interceptor.stop()
    except Exception:  # noqa: BLE001
        downgraded = downgraded or {"status": "uncertain", "reason": "submission_not_confirmed"}
    return downgraded or result


class PageCdp:
    """Own websocket to the current page target (Chrome allows several CDP clients). Events are queued
    by a reader thread and handled by a worker, so handlers may call send()."""

    def __init__(self, connection):
        self.connection, self.handler = connection, None
        self.lock, self.next_id, self.waiting, self.dead = threading.Lock(), 0, {}, False
        self.events = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()
        threading.Thread(target=self._work, daemon=True).start()

    def set_handler(self, handler):
        self.handler = handler

    def alive(self):
        return not self.dead

    def send(self, method, params=None, timeout=5):
        with self.lock:
            self.next_id += 1
            ident, slot = self.next_id, {"event": threading.Event()}
            self.waiting[ident] = slot
            self.connection.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        if not slot["event"].wait(timeout) or self.dead:
            raise RuntimeError("CDP " + method + " unanswered")
        if "error" in slot or not isinstance(slot.get("result"), dict):
            raise RuntimeError("CDP " + method + " failed")
        return slot["result"]

    def _read(self):
        try:
            while True:
                message = json.loads(self.connection.recv())
                if "id" in message:
                    slot = self.waiting.pop(message["id"], None)
                    if slot is not None:
                        slot.update({k: message[k] for k in ("result", "error") if k in message})
                        slot["event"].set()
                elif message.get("method") == "Fetch.requestPaused":
                    self.events.put(message.get("params", {}))
        except Exception:  # noqa: BLE001
            self.dead = True
            for slot in list(self.waiting.values()):
                slot["event"].set()
            self.events.put(None)

    def _work(self):
        while True:
            event = self.events.get()
            if event is None:
                return
            if self.handler is not None:
                self.handler(event)

    def close(self):
        self.dead = True
        self.events.put(None)
        try:
            self.connection.close()
        except Exception:  # noqa: BLE001
            pass


def connect_page_cdp(driver):
    """Open a loopback-only CDP websocket to the driver's current page. Raises if anything is unexpected."""
    import urllib.request
    import websocket  # pinned websocket-client (requirements.txt)
    address = driver.capabilities.get("goog:chromeOptions", {}).get("debuggerAddress", "")
    found = LOOPBACK_ADDRESS.fullmatch(address) if isinstance(address, str) else None
    if not found or not 0 < int(found.group(2)) < 65536:
        raise RuntimeError("debugger endpoint refused")
    # Chrome listens on the numeric loopback; connect to the literal so a name ("localhost") is never resolved.
    host = {"localhost": "127.0.0.1"}.get(found.group(1), found.group(1))
    address = host + ":" + found.group(2)
    target = driver.current_window_handle.removeprefix("CDwindow-")
    if not re.fullmatch(r"[A-Fa-f0-9]{32}", target):
        raise RuntimeError("page target refused")
    connection = websocket.create_connection("ws://" + address + "/devtools/page/" + target, timeout=5,
                                             suppress_origin=True, http_no_proxy=[host], redirect_limit=0)
    connection.settimeout(None)
    return PageCdp(connection)
