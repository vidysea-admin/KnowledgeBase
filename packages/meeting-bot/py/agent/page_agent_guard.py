"""Page-agent guardrails, enforced in code: the model's JSON is only a proposal and can never override these.
Fail closed: any doubt raises AgentRefused with a clear reason. Pure functions, no browser, no network."""
import re
from urllib.parse import urlsplit

# Hosts the agent may stay on besides the starting site: media players only.
PLAYER_HOSTS = ("youtube.com", "youtube-nocookie.com", "vimeo.com", "brightcove.net", "brightcove.com")
ACTIONS = ("click", "type", "select", "scroll", "wait", "done", "refuse")
NEEDS_INDEX = ("click", "type", "select")
# Never click or navigate to these, whatever the goal says: sign-in, OAuth, account chooser, consent, captcha, any "continue with <provider>".
AUTH_RE = re.compile(r"sign[ _-]?(in|on)|log[ _-]?in|login\.|oauth|accounts\.google\.com|choose an account|use another account|consent|\ballow\b|not a bot|captcha|recaptcha"
                     r"|(continue|sign|log)[ _-]*(in|up)?[ _-]*(with|using)\b|\bsso\b|facebook|\bapple\b|microsoft|linkedin|github|twitter|\bx\.com|okta|auth0", re.I)
# Never type into these (password, one-time code, card, pin, ssn, secret).
SECRET_RE = re.compile(r"pass\W*(word|code|wd)|\botp\b|one[ -]?time|verification code|2fa|cvv|cvc|card|cc-|security code|\bpin\b|ssn|secret|social security", re.I)
PAY_RE = re.compile(r"\bpay(ment)?\b|checkout|purchase|\bbuy\b|credit|billing|\bcard\b|\bcvv\b|subscribe|donate", re.I)
# Controls that submit or advance a form: refused unless the goal is register AND submit was explicitly approved.
SUBMIT_RE = re.compile(r"regist|rsvp|reserve|sign[ _-]?up|get access|\bcontinue\b|\bnext\b|\bsubmit\b|\bconfirm\b|\bcomplete\b|\bjoin\b.*\bevent\b", re.I)
BOT_RE = re.compile(r"confirm you.?re not a bot|not a robot|captcha|verify (that )?you.?re (a )?human|verify you are (a )?human|unusual traffic|are you a robot", re.I)
SECRET_AUTOCOMPLETE = ("one-time-code", "current-password", "new-password")


class AgentRefused(Exception):
    """Fail-closed refusal; str() is the clear reason."""


def host_ok(url, start_host):
    u = urlsplit(url or "")
    host = u.hostname or ""
    return u.scheme == "https" and (host == start_host or any(host == h or host.endswith("." + h) for h in PLAYER_HOSTS))


def _leet(s):
    """p4ssw0rd / pass word / p@ss -> letters only, so spelling tricks do not dodge the secret-field match."""
    return re.sub(r"[^a-z]", "", s.lower().translate(str.maketrans("4031@$5", "aoeiass")))


def check_page(text, elements):
    """Code-level bot-check / captcha detector: fails closed whatever the model says."""
    if BOT_RE.search(text or "") or any(re.search(r"captcha", str(e.get("src", "")), re.I) for e in elements):
        raise AgentRefused("bot check or captcha on the page; not bypassed")


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
    name = str(el.get("name", ""))[:60]
    if AUTH_RE.search(blob):
        raise AgentRefused("sign-in, OAuth, account-chooser, consent or provider control refused: '%s'" % name)
    if PAY_RE.search(blob):
        raise AgentRefused("payment control refused: '%s'" % name)
    gate_open = ctx.get("goal") == "register" and bool(ctx.get("allow_submit"))
    if kind == "click":
        if el.get("tag") in ("a", "iframe"):
            target = el.get("href") or el.get("src") or ""
            if target and not host_ok(target, ctx["start_host"]):
                raise AgentRefused("navigation to %s refused (outside the start site and player hosts)" % (urlsplit(target).hostname or "unknown"))
        if not gate_open and (el.get("form") or el.get("submit") or el.get("type") in ("submit", "image") or SUBMIT_RE.search(blob)):
            raise AgentRefused("form, submit or registration control refused without explicit approval: '%s'" % name)
        return el
    if ctx.get("goal") != "register":
        raise AgentRefused("typing and selecting are refused unless the goal is registration")
    if kind == "type":
        if re.search(r"password|passcode|passwd", _leet(blob)) or el.get("type") in ("password", "tel", "hidden", "file") or SECRET_RE.search(blob) \
                or el.get("autocomplete", "") in SECRET_AUTOCOMPLETE or str(el.get("autocomplete", "")).startswith("cc-"):
            raise AgentRefused("typing into a password, one-time-code, card or secret field refused")
    value = action.get("text")
    if not isinstance(value, str) or value not in {str(v) for v in (ctx.get("profile") or {}).values()}:
        raise AgentRefused("typed or selected value is not in the allowlisted profile map")
    return el


def same_element(before, now):
    """Action-time re-verification: the element at the index is still the one the model saw."""
    return bool(now) and now.get("visible") and all(before.get(k) == now.get(k) for k in ("tag", "name", "href", "src", "type", "id"))


def check_location(url, start_host):
    host = urlsplit(url or "").hostname or ""
    if AUTH_RE.search(host) or not host_ok(url, start_host):
        raise AgentRefused("page left the allowed hosts or reached a sign-in host: %s" % (host or "unknown"))
