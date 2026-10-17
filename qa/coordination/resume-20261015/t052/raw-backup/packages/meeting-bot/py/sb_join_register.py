"""sb_join: the registration submit script and register_form guard chain (moved verbatim from sb_join.py)."""


# ISS-373/ISS-374: validation, snapshot and submission run in ONE synchronous script (no
# event can interleave), the body is built from the validated snapshot (no FormData, no
# form.submit(): neither 'formdata' nor 'submit' listeners run), and the POST is sent with
# redirect:'error' so a 3xx can never forward the operator values to a second host.
REGISTRATION_JS = r"""
const i = arguments[0], action = arguments[1], done = arguments[arguments.length - 1];
const blocked = reason => ({status:'action_required', reason});
const port = url => url.port || (url.protocol === 'https:' ? '443' : '80');
const valueOf = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const gather = () => {
  const expected = new URL(i.url), current = new URL(location.href);
  if (!i.allowedHosts.includes(current.hostname) || current.protocol !== expected.protocol
    || port(current) !== port(expected)) return blocked('redirect_host');
  if (document.querySelector('input[type=password],iframe[src*="captcha"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey],input[autocomplete^="cc-"]')) return blocked('challenge_payment_login');
  const text = document.body.innerText.toLowerCase();
  if (/captcha|payment required|credit card|sign in to register|log in to register/.test(text)) return blocked('challenge_payment_login');
  const forms = document.querySelectorAll(i.form.formSelector);
  if (forms.length !== 1 || !(forms[0] instanceof HTMLFormElement)) return blocked('form_mismatch');
  const form = forms[0], mapped = [];
  for (const [key, selector] of Object.entries(i.form.fields)) {
    const controls = form.querySelectorAll(selector);
    if (controls.length !== 1 || !(controls[0] instanceof HTMLInputElement)
      || !['text','email','tel'].includes(controls[0].type) || controls[0].disabled
      || controls[0].readOnly || !controls[0].getClientRects().length) return blocked('field_mismatch');
    mapped.push(controls[0]);
  }
  const controlsNow = Array.from(form.elements);
  for (const control of controlsNow) {
    if (control.type === 'checkbox' && control.required) return blocked('required_consent');
    if (['checkbox','radio'].includes(control.type) && control.checked && !control.disabled) return blocked('unconfigured_consent');
    if (control.required && !mapped.includes(control)) return blocked('unknown_required');
  }
  const submits = form.querySelectorAll(i.form.submitSelector);
  if (submits.length !== 1 || submits[0].type !== 'submit' || submits[0].disabled) return blocked('submit_mismatch');
  const submit = submits[0], target = new URL(submit.getAttribute('formaction') || form.action, location.href);
  const method = (submit.getAttribute('formmethod') || form.method).toLowerCase();
  const encoding = (submit.getAttribute('formenctype') || form.enctype).toLowerCase();
  if (!i.allowedHosts.includes(target.hostname) || target.protocol !== expected.protocol
    || port(target) !== port(expected)
    || target.username || target.password || (submit.formTarget || form.target)) return blocked('redirect_host');
  if (method !== 'post' || encoding !== 'application/x-www-form-urlencoded') return blocked('unsupported_form');
  const entries = [];
  for (const control of controlsNow) {
    if (control === submit) { if (control.name) entries.push([control.name, control.value]); continue; }
    if (control.disabled || ['FIELDSET','OUTPUT','OBJECT'].includes(control.tagName)) continue;
    if (control.tagName === 'BUTTON' || (control.tagName === 'INPUT' && ['submit','button','reset','image'].includes(control.type))) continue;
    if (['checkbox','radio'].includes(control.type)) continue;
    if (!(control instanceof HTMLInputElement) || !['text','email','tel','hidden'].includes(control.type)) return blocked('unsupported_form');
    if (control.name) entries.push([control.name, valueOf.get.call(control)]);
  }
  for (const [key, selector] of Object.entries(i.form.fields)) {
    const element = form.querySelector(selector);
    if (!element.name) return blocked('field_mismatch');
  }
  return {form, target, entries, mapped};
};
const first = gather();
if (!first.form) { done(first); return; }
if (action === 'inspect') { done({status:'ready',reason:'ready'}); return; }
for (const [key, selector] of Object.entries(i.form.fields)) {
  valueOf.set.call(first.form.querySelector(selector), i.operator[key]);
}
const before = gather();
if (!before.form) { done(before); return; }
if (!before.form.checkValidity()) { done(blocked('invalid_values')); return; }
const final = gather();
if (!final.form) { done(final); return; }
const body = new URLSearchParams(final.entries).toString();
const values = {};
for (const [key, selector] of Object.entries(i.form.fields)) values[key] = valueOf.get.call(final.form.querySelector(selector));
if (final.form !== first.form || final.target.href !== before.target.href
  || body !== new URLSearchParams(before.entries).toString()) { done(blocked('changed_after_validation')); return; }
fetch(final.target.href, {method:'POST', body, headers:{'Content-Type':'application/x-www-form-urlencoded'},
  redirect:i.redirectMode === 'follow' ? 'follow' : 'error', credentials:'include', mode:'no-cors', cache:'no-store'})
  .then(() => done({status:'submitted', reason:'awaiting_confirmation', target:final.target.href, body, values}),
        () => done({status:'uncertain', reason:'submission_not_confirmed'}));
"""


def register_form(sb, instructions, script_isolated=False, policy_check=None, cdp_connect=None):
    """One submit attempt; positive result is awaiting confirmation, never registration proof."""
    def not_attempted(reason):
        return {"status": "action_required", "reason": reason, "submissionDisposition": "not-attempted"}

    if not script_isolated:
        return not_attempted("script_isolation_unproved")
    import re
    from urllib.parse import urlsplit
    hosts = instructions.get("allowedHosts")
    raw_url = instructions.get("url", "")
    if not isinstance(raw_url, str) or not raw_url or len(raw_url) > 8192:
        return not_attempted("request_policy_refused")
    try:
        parsed = urlsplit(raw_url)
        origin_port = parsed.port if parsed.port is not None else (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return not_attempted("request_policy_refused")
    local = instructions.get("localFixture") is True and parsed.hostname in ("127.0.0.1", "localhost")
    if (not isinstance(hosts, list) or not 1 <= len(hosts) <= 20
            or any(not isinstance(host, str) or not re.fullmatch(r"[a-z0-9.-]{1,253}", host)
                   or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                          for label in (host[:-1] if host.endswith(".") else host).split(".")) for host in hosts)
            or parsed.username or parsed.password or parsed.fragment
            or any(ord(char) < 32 or ord(char) == 127 for char in raw_url)
            or not 1 <= origin_port <= 65535
            or parsed.scheme == "http" and any(host not in ("127.0.0.1", "localhost") for host in hosts)
            or parsed.scheme != "https" and not (local and parsed.scheme == "http")):
        return not_attempted("request_policy_refused")
    if parsed.hostname not in hosts:
        return not_attempted("redirect_host")
    sources = [parsed.scheme + "://" + host + ":" + str(origin_port) for host in hosts]
    policy = "form-action " + " ".join(sources)
    script = REGISTRATION_JS
    try:
        driver = getattr(sb, "driver", sb)
        for command, arguments in (("Network.enable", {}), ("Network.setBypassServiceWorker", {"bypass": True})):
            if not isinstance(driver.execute_cdp_cmd(command, arguments), dict):
                return not_attempted("request_policy_unproved")
        if not callable(policy_check) or policy_check() is not True:
            return not_attempted("persistent_policy_unproved")
        result = driver.execute_async_script(script, instructions, "inspect")  # selenium driver: SB's own wrapper takes (script, timeout)
        if result.get("status") != "ready":
            return not_attempted(result["reason"]) if result.get("status") == "action_required" else {"status": "uncertain", "reason": "browser_failure"}
        installed = sb.execute_script(r"""
        if (!document.head) return false;
        const policy = document.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy'; policy.content = arguments[0];
        document.head.appendChild(policy);
        return policy.isConnected && policy.content === arguments[0];
        """, policy)
        if installed is not True:
            return not_attempted("request_policy_unproved")
        for command, arguments in (("Network.enable", {}), ("Network.setBypassServiceWorker", {"bypass": True})):
            if not isinstance(driver.execute_cdp_cmd(command, arguments), dict):
                return not_attempted("request_policy_unproved")
        if policy_check() is not True:
            return not_attempted("persistent_policy_unproved")
        import registration_cdp  # T-052: optional CDP redirect policy; cdp_connect=None keeps redirect:'error'
        result = registration_cdp.submit_with_redirects(sb, script, instructions, hosts, raw_url, cdp_connect)
        if not isinstance(result, dict):
            return {"status": "uncertain", "reason": "navigation_during_submit"}
        result.pop("submissionDisposition", None)  # Post-entry evidence is never a proof of no attempt.
        if result.get("status") == "submitted":
            # What was sent must be exactly what was validated: approved target, operator values.
            try:
                from urllib.parse import parse_qs
                sent = urlsplit(result.get("target"))
                same = (sent.hostname in hosts and sent.scheme == parsed.scheme
                        and (sent.port or (443 if sent.scheme == "https" else 80)) == origin_port
                        and result.get("values") == instructions["operator"]
                        and isinstance(parse_qs(result.get("body"), keep_blank_values=True), dict))
            except (ValueError, TypeError, AttributeError, KeyError):
                same = False
            if not same:
                return {"status": "uncertain", "reason": "submitted_mismatch"}
        return result
    except Exception:
        return {"status": "uncertain", "reason": "browser_failure"}
