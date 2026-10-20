"""Page-agent guardrails, enforced in code: the model's JSON is only a proposal and can never override these.
Fail closed: any doubt raises AgentRefused with a clear reason. Pure functions, no browser, no network."""
import re
from urllib.parse import urlsplit

# Hosts the agent may stay on besides the starting site: media players only.
PLAYER_HOSTS = ("youtube.com", "youtube-nocookie.com", "vimeo.com", "brightcove.net", "brightcove.com")
ACTIONS = ("click", "type", "select", "scroll", "wait", "done", "refuse")
NEEDS_INDEX = ("click", "type", "select")
# Never click or navigate to these, whatever the goal says.
AUTH_RE = re.compile(r"sign[ _-]?in|log[ _-]?in|login\.|oauth|accounts\.google\.com|choose an account|use another account|consent|continue with google|\ballow\b|not a bot|captcha|recaptcha", re.I)
# Never type into these (password, one-time code, card).
SECRET_RE = re.compile(r"pass(word|code)|\botp\b|one[ -]?time|verification code|2fa|cvv|cvc|card|cc-|security code", re.I)
PAY_RE = re.compile(r"\bpay(ment)?\b|checkout|purchase|\bbuy\b|credit|billing|\bcard\b|\bcvv\b|subscribe|donate", re.I)
REGISTER_RE = re.compile(r"regist|sign[ _-]?up|\bsubmit\b|\bconfirm\b|\bcomplete\b|\bjoin\b.*\bevent\b", re.I)
SECRET_AUTOCOMPLETE = ("one-time-code", "current-password", "new-password")


class AgentRefused(Exception):
    """Fail-closed refusal; str() is the clear reason."""


def host_ok(url, start_host):
    u = urlsplit(url or "")
    host = u.hostname or ""
    return u.scheme == "https" and (host == start_host or any(host == h or host.endswith("." + h) for h in PLAYER_HOSTS))


def _text(el):
    return " ".join(str(el.get(k, "")) for k in ("name", "text", "href", "src", "trail", "id", "label", "placeholder", "autocomplete", "field")).lower()


def check_action(action, elements, ctx):
    """Validate one proposed action against the observed elements. ctx: start_host, profile (dict), goal, allow_submit.
    Returns the target element (or None for scroll/wait/done/refuse). Raises AgentRefused."""
    kind = action.get("action") if isinstance(action, dict) else None
    if kind not in ACTIONS:
        raise AgentRefused("model proposed an unknown action %r" % (kind,))
    if kind == "refuse":
        raise AgentRefused("model refused: %s" % str(action.get("reason", ""))[:200])
    if kind not in NEEDS_INDEX:
        return None
    idx = action.get("index")
    if isinstance(idx, bool) or not isinstance(idx, int) or not 0 <= idx < len(elements):
        raise AgentRefused("action index %r is not an observed element" % (idx,))
    el = elements[idx]
    blob = _text(el)
    if AUTH_RE.search(blob):
        raise AgentRefused("sign-in, OAuth, account-chooser or consent control refused: '%s'" % str(el.get("name", ""))[:60])
    if PAY_RE.search(blob):
        raise AgentRefused("payment control refused: '%s'" % str(el.get("name", ""))[:60])
    if kind == "click":
        if el.get("tag") == "a" or el.get("tag") == "iframe":
            target = el.get("href") or el.get("src") or ""
            if target and not host_ok(target, ctx["start_host"]):
                raise AgentRefused("navigation to %s refused (outside the start site and player hosts)" % (urlsplit(target).hostname or "unknown"))
        if REGISTER_RE.search(blob) and not (ctx.get("goal") == "register" and ctx.get("allow_submit")):
            raise AgentRefused("registration or submit control refused without explicit approval: '%s'" % str(el.get("name", ""))[:60])
    if kind == "type":
        if el.get("type") in ("password", "tel", "hidden", "file") or SECRET_RE.search(blob) or el.get("autocomplete", "") in SECRET_AUTOCOMPLETE \
                or str(el.get("autocomplete", "")).startswith("cc-"):
            raise AgentRefused("typing into a password, one-time-code or card field refused")
        value = action.get("text")
        if not isinstance(value, str) or value not in {str(v) for v in (ctx.get("profile") or {}).values()}:
            raise AgentRefused("typed value is not in the allowlisted profile map")
    if kind == "select":
        value = action.get("text")
        if not isinstance(value, str) or value not in {str(v) for v in (ctx.get("profile") or {}).values()}:
            raise AgentRefused("selected value is not in the allowlisted profile map")
    return el


def same_element(before, now):
    """Action-time re-verification: the element at the index is still the one the model saw."""
    return bool(now) and now.get("visible") and all(before.get(k) == now.get(k) for k in ("tag", "name", "href", "src", "type", "id"))


def check_location(url, start_host):
    host = urlsplit(url or "").hostname or ""
    if AUTH_RE.search(host) or not host_ok(url, start_host):
        raise AgentRefused("page left the allowed hosts or reached a sign-in host: %s" % (host or "unknown"))
