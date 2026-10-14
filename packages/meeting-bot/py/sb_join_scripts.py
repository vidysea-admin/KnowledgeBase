"""sb_join: the in-page JavaScript snippets for click and body-text reads (moved verbatim from sb_join.py)."""

# ISS-U0-1: Zoom's web-client join UI (name field, Join button, "Join Audio by Computer",
# waiting-for-host / end-of-webinar text) renders inside a same-origin <iframe> the top document
# never contains directly. Both CLICK_JS and BODY_TEXT_JS below recurse into every same-origin
# iframe (and iframes nested inside those, arbitrarily deep) via a shared `walk(doc)` helper.
# `frame.contentDocument` throws (or returns null, depending on browser) for a cross-origin
# frame — that access is wrapped in try/catch so a cross-origin ad/tracker iframe is silently
# skipped rather than raising out of execute_script. Zoho/Meet pages that have no iframe at all
# take the exact same code path: `doc.querySelectorAll('iframe')` returns an empty list, `walk`
# recurses zero times, and behaviour is unchanged from before this fix.
#
# ISS-U0-4/ISS-U0-5 (checker cycle 1, fixed): the frame recursion above had no visibility gate on
# the <iframe> ELEMENT itself in its parent document — a frame collapsed to zero size or hidden
# via display:none/visibility:hidden (on itself OR any ancestor) still had its content visited,
# clicked (ISS-U0-4) and merged into BODY_TEXT_JS (ISS-U0-5), because CLICK_JS's own
# getBoundingClientRect check only ever looked at the clicked ELEMENT relative to ITS OWN
# document — a browser lays out an iframe's inner content at natural size regardless of the
# iframe's own collapsed CSS size, so that check can never see a collapsed/hidden container.
#
# ISS-U0-6/ISS-U0-7 (checker cycle 2, fixed here): the cycle-1 fix enumerated hiding TECHNIQUES
# one at a time (self zero-size, self/ancestor display:none via getClientRects, ancestor
# visibility:hidden) and cycle 2's own adversarial fixtures kept finding new techniques the
# enumeration missed — an ancestor that clips its OWN box to zero size via overflow:hidden while
# the iframe keeps an explicit nonzero width/height (ISS-U0-6, high: overflow:hidden only clips
# rendering, it never removes the child from layout or zeros the child's own rect, so
# getClientRects().length stays non-zero), plus opacity:0 and off-screen absolute positioning
# (ISS-U0-7, medium). isFrameVisible() below stops enumerating techniques and instead computes
# the frame's actual on-screen VISIBLE AREA: start from the frame's own
# getBoundingClientRect() intersected with its owner document's viewport (frame.ownerDocument is
# the PARENT document containing the <iframe> tag — not its nested contentDocument — so this is
# exactly the coordinate space the ancestor walk below also lives in); walk every ancestor up to
# documentElement, and whenever an ancestor's own overflow clips (overflow-x/-y not 'visible'),
# intersect the running rect with that ancestor's own box too. display:none, visibility:hidden/
# collapse and opacity:0 are checked directly (on the frame itself AND every ancestor) since those
# hide the whole box regardless of geometry. The frame is visible iff the final intersected area
# is at least 2x2px — an exact 0-width/0-height rect is unambiguously invisible; 2px is a
# deliberate small margin above that so a 1px antialiasing/rounding sliver from getBoundingClientRect
# floats never counts as "on screen" either. Because walkFrames only recurses into a frame once
# its OWN isFrameVisible() call passes, and each call only looks at that frame's local ancestor
# chain in its own parent document, nesting composes automatically — a nested frame's own geometry
# is checked fresh against its own (already-visible) parent document, never assumed from the
# outer frame's result. Zoho/Meet pages that have no iframe at all take the exact same code path
# as always: `doc.querySelectorAll('iframe')` returns an empty list, isFrameVisible is never
# called, and behaviour is unchanged from before ISS-U0-1.
_IFRAME_WALK_JS = """
function _rectIntersect(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function _hiddenBySelfStyle(cs) {
  return cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' ||
    parseFloat(cs.opacity) === 0;
}
function isFrameVisible(frame) {
  const csSelf = getComputedStyle(frame);
  if (_hiddenBySelfStyle(csSelf)) return false;
  const win = frame.ownerDocument.defaultView;
  let r = _rectIntersect(frame.getBoundingClientRect(),
    { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight });
  if (r.width < 2 || r.height < 2) return false;
  let el = frame.parentElement;
  while (el) {
    const cs = getComputedStyle(el);
    if (_hiddenBySelfStyle(cs)) return false;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      r = _rectIntersect(r, el.getBoundingClientRect());
      if (r.width < 2 || r.height < 2) return false;
    }
    el = el.parentElement;
  }
  return true;
}
function walkFrames(doc, visit) {
  visit(doc);
  let frames;
  try {
    frames = [...doc.querySelectorAll('iframe')];
  } catch (e) {
    return;
  }
  for (const frame of frames) {
    if (!isFrameVisible(frame)) continue;  // ISS-U0-4/ISS-U0-5: skip the whole hidden subtree
    let inner;
    try {
      inner = frame.contentDocument;
    } catch (e) {
      inner = null;  // cross-origin: SecurityError — skip silently, never throw
    }
    if (!inner) continue;
    walkFrames(inner, visit);
  }
}
"""

CLICK_JS = _IFRAME_WALK_JS + """
const wanted = arguments[0];
let hit = null;
walkFrames(document, (doc) => {
  if (hit) return;
  let els;
  try {
    els = [...doc.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')];
  } catch (e) {
    return;
  }
  for (const el of els) {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!t || t.length > 40) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || el.disabled) continue;
    if (wanted.includes(t)) { el.click(); hit = t; return; }
  }
});
return hit;
"""

# ISS-U0-1: same traversal for the body-text read main() uses for END_PHRASES/RECONNECT_PHRASES/
# OFFLINE_PAGE_PHRASES detection — text living only inside an iframe (e.g. "waiting for the host
# to start this webinar") was previously invisible to those checks.
BODY_TEXT_JS = _IFRAME_WALK_JS + """
let parts = [];
walkFrames(document, (doc) => {
  try {
    if (doc.body) parts.push(doc.body.innerText || '');
  } catch (e) {
    // ignore
  }
});
return parts.join(' ');
"""

# ISS-CAPTUREFIX-001: is the Meet call-controls bar on screen? Visible "Leave call" button (aria-label
# or data-tooltip) or the "Call controls" toolbar. The lobby decision itself is made from body text
# (sb_join_detect.classify_meet_state) because the waiting screen can show a hang-up control too.
IN_CALL_JS = """
const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const sel = 'button[aria-label*="leave call" i], [role=button][aria-label*="leave call" i], ' +
  'button[data-tooltip*="leave call" i], [role=toolbar][aria-label*="call controls" i], ' +
  '[aria-label="Call controls" i]';
return [...document.querySelectorAll(sel)].some(vis);
"""


# ISS-LOBBYWATCH-001: in-call controls for Zoom web / Teams web / unknown platforms. Text- and
# aria-based first (class names churn); the data-tid hooks are Teams' own test ids. UNVERIFIED
# against live Zoom/Teams -- they need a live check. Visible = non-zero size, as for Meet.
_VIS = "const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };\n"
ZOOM_IN_CALL_JS = _VIS + """
const sel = 'button[aria-label^="leave" i], [role=button][aria-label^="leave" i], button[aria-label*="end meeting" i], ' +
  '[role=toolbar][aria-label*="meeting" i]';
return [...document.querySelectorAll(sel)].some(vis);
"""
TEAMS_IN_CALL_JS = _VIS + """
const sel = 'button#hangup-button, button[data-tid="hangup-main-btn"], [data-tid="calling-unified-bar"], ' +
  'button[aria-label^="leave" i], button[aria-label^="hang up" i], [role=toolbar][aria-label*="meeting controls" i]';
return [...document.querySelectorAll(sel)].some(vis);
"""
GENERIC_IN_CALL_JS = _VIS + """
const sel = 'button[aria-label^="leave" i], [role=button][aria-label^="leave" i], button[aria-label^="hang up" i], ' +
  'button[aria-label^="end call" i]';
return [...document.querySelectorAll(sel)].some(vis);
"""
IN_CALL_JS_BY_PLATFORM = {"meet": IN_CALL_JS, "zoom": ZOOM_IN_CALL_JS, "teams": TEAMS_IN_CALL_JS, "other": GENERIC_IN_CALL_JS}
