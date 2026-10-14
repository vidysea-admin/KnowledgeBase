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
         "/meeting-bot", "/whatsapp", "/sessions/s0"]
fails = 0
results = []
def check(ok, msg):
    global fails
    if not ok: fails += 1
    results.append({"ok": ok, "msg": msg}); print(("PASS " if ok else "FAIL ") + msg)

LONG = "Admissions strategy for international undergraduate applicants to German and Hungarian universities: scholarships, visa timelines, accommodation and part-time work rules (2026 intake, extended session)"
URL = "https://example.com/" + "very-long-path-segment-" * 8 + "?utm_source=newsletter&utm_campaign=" + "x" * 80
SPK = "Dr. Anita Bhattacharyya-Venkataraghavan of the Department of International Admissions"
SESS = [{"_id": f"s{i}", "title": f"{LONG} part {i}", "date": "2026-10-1%d" % i, "org": SPK, "participants": [SPK, "Bob"],
         "status": {"transcribe": "done", "index": "done"}} for i in range(4)]
def node(i, kind): return {"id": f"{kind}:{i}", "label": f"{LONG[:60]} {i}", "kind": kind, "ref": str(i), "sources": ["tree_index"]}
NODES = [{"id": f"session:s{i}", "label": SESS[i]["title"], "kind": "session", "ref": f"s{i}", "sources": ["tree_index"]} for i in range(4)] +         [node(i, "topic") for i in range(3)] + [{"id": "person:a", "label": SPK, "kind": "person", "ref": "a", "sources": ["graph_edges"]}]
EDGES = [{"source": f"session:s{i}", "target": f"topic:{i % 3}", "type": "session-topic", "inferred": False, "origin": "tree_index"} for i in range(4)] +         [{"source": "person:a", "target": f"session:s{i}", "type": "spoke_in", "inferred": False, "confidence": 1, "origin": "graph_edges"} for i in range(4)]
GRAPH = {"nodes": NODES, "edges": EDGES, "stats": {"sessionsTotal": 4, "sessionsInGraph": 4, "sessionsMissing": [], "edgeSources": {"treeIndex": 4, "entityEdges": 4}}}
DETAIL = {"session": SESS[0], "page": {"summary": LONG * 2}, "claims": [{"_id": "c1", "text": LONG + " " + URL, "status": "verified"}],
          "turns": [{"_id": "t1", "speakerRef": "spk:1", "speakerLabel": SPK, "tStart": 0, "tEnd": 5, "text": LONG + " " + URL}],
          "notes": [{"text": LONG, "kind": "note", "tStart": 1}], "frames": []}
WATCHED = {"sources": [{"_id": "w1", "url": URL, "label": LONG, "reputationTier": "official", "checkIntervalHours": 6, "active": True,
                        "lastFetch": {"fetchedAt": "2026-10-12T10:00:00Z", "hash": "a" * 64, "diffFrom": None}}]}
MEET = {"meetings": [{"id": "m1", "title": LONG, "startTime": "2026-10-14T10:00:00Z", "endTime": "2026-10-14T11:00:00Z", "meetingUrl": URL, "organizer": SPK + "@example-university-admissions-office.example.com"}]}
CAND = {"candidates": [{"_id": "k1", "messageId": "m", "subject": LONG, "senderEmail": "a" * 60 + "@" + "b" * 60 + ".example.com", "senderDomain": "b" * 60 + ".example.com",
                        "meetingUrl": URL, "status": "pending", "detectedAt": "2026-10-12T10:00:00Z"}]}
OPS = {"operations": [{"id": "o1", "title": LONG, "status": "failed", "attempts": 2, "reason": LONG + URL}], "discovery": {"status": "healthy", "checkedAt": "2026-10-12T10:00:00Z"}}
MOCKS = {"/graph": GRAPH, "/calendar/upcoming": MEET, "/watch-state": {"state": [], "heartbeats": []},
         "/sessions": {"sessions": SESS}, "/watched-sources": WATCHED, "/meeting-candidates": CAND, "/webinar-operations": OPS}
def mock(route):
    path = route.request.url.split("3399", 1)[1].split("?")[0]
    if path.startswith("/sessions/") and path.count("/") == 2:
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(DETAIL))
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
