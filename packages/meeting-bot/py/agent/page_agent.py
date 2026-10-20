"""Generic page agent: screenshot + indexed interactive elements -> vision model -> one guarded action, repeated.
Goals are natural language ("get the webinar replay or live session playing"); nothing here knows a site or platform.
Guardrails live in page_agent_guard and cannot be overridden by the model. Every step is logged (LKB_AGENT_LOG file)."""
import base64
import hashlib
import json
import os
from urllib.parse import urlsplit

import page_agent_guard as guard
import page_agent_model as model

MAX_STEPS = 15
TIMEOUT_S = 240
PROMPT = """You drive a web browser to reach this goal: {goal}
You see a screenshot and the list of visible interactive elements (index, tag, role, name, text, href/src, type).
Reply with ONE JSON object only: {{"action":"click|type|select|scroll|wait|done|refuse","index":<number>,"text":"<value>","reason":"<why>"}}.
Rules: pick elements by index. Use "done" only when the goal is achieved (for playback: a video player is on screen and playing).
Never sign in, never use password/one-time-code/card fields, never accept consent or choose an account. Type only values from this profile: {profile}.
If you see a sign-in wall, bot check ("confirm you are not a bot"), captcha, or the goal is impossible without signing in, reply "refuse" with the reason.
Step {step} of {max}. Elements: {elements}"""

ELEMENTS_JS = r"""
const SEL = 'a,button,input,select,textarea,iframe,[role=button],[role=link],[role=tab],[onclick]';
const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
document.querySelectorAll('[data-lkb-agent]').forEach(e => e.removeAttribute('data-lkb-agent'));
const out = []; let i = 0;
for (const e of document.querySelectorAll(SEL)) {
  if (!vis(e) || out.length >= 80) continue;
  const r = e.getBoundingClientRect(), lab = e.labels && e.labels[0] ? e.labels[0].innerText : '';
  const trail = []; for (let n = e.parentElement, k = 0; n && n !== document.body && k < 6; n = n.parentElement, k++) trail.push((n.id + ' ' + n.className).toLowerCase());
  e.setAttribute('data-lkb-agent', String(i));
  const tx = ((e.innerText || e.value || '') + '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  out.push({index: i++, form: !!(e.form || e.closest('form')), submit: (e.type === 'submit' || (e.tagName === 'BUTTON' && !e.getAttribute('type') && !!(e.form || e.closest('form')))), tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', type: (e.type || '').toLowerCase(),
    name: (e.getAttribute('aria-label') || lab || e.title || e.placeholder || tx || '').trim().toLowerCase().slice(0, 80), text: tx,
    href: (e.href || '').toLowerCase().slice(0, 200), src: (e.src || '').toLowerCase().slice(0, 200), id: e.id || '',
    label: (lab || '').toLowerCase().slice(0, 60), placeholder: (e.placeholder || '').toLowerCase(), autocomplete: (e.getAttribute('autocomplete') || '').toLowerCase(),
    trail: trail.join(' | ').slice(0, 300), visible: true, bbox: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]});
}
return out;
"""
TEXT_JS = "return (document.body.innerText || '').slice(0, 4000);"
PLAYER_JS = "return !!document.querySelector('video') || [...document.querySelectorAll('iframe')].some(f => /youtube|vimeo|brightcove/i.test(f.src));"


def _log(entry):
    path = os.environ.get("LKB_AGENT_LOG")
    if path:
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except OSError:
            pass


def page_text(sb):
    """Top document text plus the text of each iframe (WebDriver can enter cross-origin frames)."""
    parts = [sb.execute_script(TEXT_JS) or ""]
    try:
        for frame in sb.driver.find_elements("css selector", "iframe"):
            try:
                sb.driver.switch_to.frame(frame)
                try:
                    parts.append(sb.execute_script(TEXT_JS) or "")
                finally:
                    sb.driver.switch_to.default_content()
            except Exception:
                continue
    except Exception:
        pass
    return "\n".join(parts)


def screenshot(sb):
    return base64.b64decode(sb.driver.execute_cdp_cmd("Page.captureScreenshot", {"format": "jpeg", "quality": 45})["data"])


def run_agent(sb, goal, *, time, emit, ask=model.ask, profile=None, allow_submit=False, max_steps=MAX_STEPS, timeout_s=TIMEOUT_S, shot=screenshot):
    """Returns when the model says done and (for playback) a player exists. Raises AgentRefused otherwise."""
    start_host = urlsplit(sb.driver.current_url).hostname or ""
    ctx = {"start_host": start_host, "profile": profile or {}, "goal": "register" if "regist" in goal.lower() else "play", "allow_submit": allow_submit}
    started = time.time()
    for step in range(1, max_steps + 1):
        if time.time() - started > timeout_s:
            raise guard.AgentRefused("page agent timed out after %ds" % timeout_s)
        guard.check_location(sb.driver.current_url, start_host)
        elements = sb.execute_script(ELEMENTS_JS)
        guard.check_page(page_text(sb), elements)  # code-level bot-check detector, independent of the model
        jpeg = shot(sb)
        label, action = ask(PROMPT.format(goal=goal, profile=json.dumps(sorted((profile or {}).keys())), step=step, max=max_steps,
                                          elements=json.dumps([{k: e[k] for k in ("index", "tag", "role", "type", "name", "href", "src")} for e in elements])), jpeg)
        entry = {"step": step, "model": label, "action": action.get("action"), "index": action.get("index"), "reason": str(action.get("reason", ""))[:200],
                 "shot": hashlib.sha256(jpeg).hexdigest()[:12], "element": None}
        try:
            target = guard.check_action(action, elements, ctx)
            if target is not None:
                entry["element"] = {k: target.get(k) for k in ("tag", "name", "href", "src")}
            _execute(sb, action, target, ctx, time)
        except guard.AgentRefused as e:
            entry["refused"] = str(e)
            _log(entry)
            emit("agent-step", **entry)
            raise
        _log(entry)
        emit("agent-step", **entry)
        if action["action"] == "done":
            if "playback" in goal.lower() or "play" in goal.lower():
                if not sb.execute_script(PLAYER_JS):
                    raise guard.AgentRefused("model said done but no video player is on the page")
            return step
    raise guard.AgentRefused("page agent reached the %d-step cap without finishing" % max_steps)


def _execute(sb, action, target, ctx, time):
    kind = action["action"]
    if kind == "wait":
        time.sleep(2)
    elif kind == "scroll":
        sb.execute_script("window.scrollBy(0, Math.round(innerHeight * 0.8));")
    elif kind in guard.NEEDS_INDEX:
        # Action-time re-verification: re-enumerate and require the same, still visible, still allowed element at the index.
        now = sb.execute_script(ELEMENTS_JS)
        idx = action["index"]
        if idx >= len(now) or not guard.same_element(target, now[idx]):
            raise guard.AgentRefused("target changed between observation and action")
        guard.check_action(action, now, ctx)  # the fresh element must still pass every guardrail
        el = sb.driver.find_element("css selector", '[data-lkb-agent="%d"]' % idx)
        if kind == "click":
            el.click()  # trusted WebDriver click
        elif kind == "type":
            el.clear()
            el.send_keys(action["text"])
        else:
            from selenium.webdriver.support.ui import Select
            Select(el).select_by_visible_text(action["text"])
        time.sleep(2)

