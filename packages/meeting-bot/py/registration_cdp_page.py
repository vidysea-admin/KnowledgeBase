"""T-052: the page-target CDP websocket client used by registration_cdp (moved verbatim from registration_cdp.py)."""
import json
import queue
import re
import threading

# debuggerAddress forms accepted for the CDP socket: exactly these three loopback hosts, a numeric port.
LOOPBACK_ADDRESS = re.compile(r"(127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})")


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
