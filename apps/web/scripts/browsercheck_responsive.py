"""Live 375/1280 px re-check for ISS-BC3746-001 (system Chrome via Python Playwright; mocked API).
Usage: python browsercheck_responsive.py [webBase=http://127.0.0.1:5399] [outDir=responsive-shots]
Web must run with VITE_API_BASE_URL=http://127.0.0.1:3399 (all requests to it are mocked here;
no real backend, no DB). Per page: documentElement.scrollWidth <= viewport; at 375 gutter 16px, menu
button visible and opens links; at 1280 sidebar 220px, menu hidden. Also injects a wide table, a wide
<pre> and the BrainPage split markup, and checks they scroll/stack inside the page width."""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5399"
OUT = sys.argv[2] if len(sys.argv) > 2 else "responsive-shots"
os.makedirs(OUT, exist_ok=True)
PAGES = ["/", "/sessions", "/ask", "/search", "/brain", "/explorer", "/graph-confidence", "/gaps",
         "/activity-health", "/analytics", "/join-rules", "/calendar", "/watch", "/sources", "/settings",
         "/jobs", "/claims", "/status", "/setup", "/ops-health", "/notifications", "/ingest",
         "/meeting-bot", "/whatsapp", "/sessions/x"]
fails = 0
results = []
def check(ok, msg):
    global fails
    if not ok: fails += 1
    results.append({"ok": ok, "msg": msg}); print(("PASS " if ok else "FAIL ") + msg)

GRAPH = {"nodes": [{"id": "session:s1", "label": "Study in Hungary", "kind": "session", "ref": "s1", "sources": ["tree_index"]},
  {"id": "topic:sch", "label": "Scholarships", "kind": "topic", "ref": "sch", "sources": ["tree_index"]},
  {"id": "person:a", "label": "Anita", "kind": "person", "ref": "a", "sources": ["graph_edges"]}],
  "edges": [{"source": "session:s1", "target": "topic:sch", "type": "session-topic", "inferred": False, "origin": "tree_index"},
            {"source": "person:a", "target": "session:s1", "type": "spoke_in", "inferred": False, "confidence": 1, "origin": "graph_edges"}],
  "stats": {"sessionsTotal": 1, "sessionsInGraph": 1, "sessionsMissing": [], "edgeSources": {"treeIndex": 1, "entityEdges": 1}}}
MOCKS = {"/graph": GRAPH, "/calendar/upcoming": {"meetings": []}, "/watch-state": {"state": [], "heartbeats": []},
         "/sessions": {"sessions": []}, "/watched-sources": {"sources": []}, "/meeting-candidates": {"candidates": []}}
def mock(route):
    path = route.request.url.split("3399", 1)[1].split("?")[0]
    if path.startswith("/sessions/"):
        return route.fulfill(status=404, content_type="application/json", body='{"error":"not_found"}')
    route.fulfill(status=200, content_type="application/json", body=json.dumps(MOCKS.get(path, {})))

INJECT = """() => {
  const m = document.querySelector('.app-main');
  const t = document.createElement('table'); t.id='x-table';
  t.innerHTML = '<tr>' + Array.from({length:12}, (_,i)=>'<td style="min-width:120px">cell '+i+'</td>').join('') + '</tr>';
  const p = document.createElement('pre'); p.id='x-pre'; p.textContent = 'x'.repeat(400);
  const b = document.createElement('div'); b.className='card brain-split'; b.id='x-brain';
  b.innerHTML = '<div style="flex:1;min-width:0">graph</div><div class="brain-panel">panel</div>';
  m.append(t, p, b);
}"""

with sync_playwright() as pw:
    br = pw.chromium.launch(channel="chrome", headless=True)
    for w, h in [(375, 812), (1280, 800)]:
        ctx = br.new_context(viewport={"width": w, "height": h})
        ctx.add_init_script("try{localStorage.setItem('lkbApiKey','test-key')}catch(e){}")
        ctx.route("**://127.0.0.1:3399/**", mock)
        page = ctx.new_page()
        for p in PAGES:
            page.goto(BASE + p, wait_until="networkidle")
            m = page.evaluate("""() => { const de=document.documentElement, main=document.querySelector('.app-main'),
              nav=document.querySelector('.nav-sidebar'), tg=document.querySelector('.nav-toggle');
              return {sw:de.scrollWidth, cw:de.clientWidth, shell:!!main,
                pad: main?parseFloat(getComputedStyle(main).paddingLeft):null,
                nav: nav?nav.getBoundingClientRect().width:null,
                tg: tg?getComputedStyle(tg).display!=='none':false}; }""")
            tag = f"{w}px {p}"
            check(m["sw"] <= m["cw"], f"{tag} no horizontal page scroll (scrollWidth {m['sw']} vs {m['cw']})")
            if not m["shell"]:
                check(False, f"{tag} app shell not rendered (error/login gate)"); continue
            if w == 375:
                check(m["pad"] == 16, f"{tag} main gutter 16px ({m['pad']})")
                check(m["tg"], f"{tag} menu button visible")
                before = page.locator("#nav-links").is_visible()
                page.click(".nav-toggle")
                after = page.locator("#nav-links").is_visible()
                check((not before) and after, f"{tag} menu collapsed then opens")
                page.click(".nav-toggle")
            else:
                check(round(m["nav"]) in (220, 221), f"{tag} sidebar 220px ({m['nav']})")
                check(not m["tg"], f"{tag} menu button hidden")
            page.screenshot(path=f"{OUT}/{w}{p.replace('/', '_') or '_root'}.png")
        page.goto(BASE + "/sessions", wait_until="networkidle")
        page.evaluate(INJECT)
        r = page.evaluate("""() => { const de=document.documentElement, t=document.getElementById('x-table'),
          p=document.getElementById('x-pre'), b=document.getElementById('x-brain');
          const rb=b.querySelector('.brain-panel').getBoundingClientRect(), g=b.firstElementChild.getBoundingClientRect();
          return {sw:de.scrollWidth, cw:de.clientWidth, tw:t.scrollWidth, tc:t.clientWidth, pw:p.scrollWidth, pc:p.clientWidth,
                  panelW:rb.width, stacked: rb.top >= g.bottom - 1}; }""")
        if w == 375:
            check(r["sw"] <= r["cw"], f"{w}px injected wide table+pre+brain: page scrollWidth {r['sw']} vs {r['cw']}")
            check(r["tw"] > r["tc"] and r["pw"] > r["pc"], f"{w}px table/pre scroll inside own box (table {r['tw']}>{r['tc']}, pre {r['pw']}>{r['pc']})")
            check(r["stacked"] and r["panelW"] <= 375, f"{w}px brain panel stacked under graph (panel width {r['panelW']})")
        else:
            check((not r["stacked"]) and round(r["panelW"]) == 340, f"{w}px brain panel stays 340px beside graph ({r['panelW']})")
        page.screenshot(path=f"{OUT}/{w}_injected.png")
        ctx.close()
    br.close()
print(f"{fails} FAIL" if fails else "ALL PASS")
json.dump(results, open(f"{OUT}/results.json", "w"), indent=1)
sys.exit(1 if fails else 0)
