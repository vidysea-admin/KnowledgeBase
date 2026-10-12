# Verdict: browser-checks-2026-10-12

VERDICT: FAIL
Commit checked: 5549978 (lane/browsercheck)
Meaning of FAIL: the evidence is mostly honest and most results hold, but ONE reported PASS (join-rules "read-only without scope") is not demonstrated by the run, and its screenshot is mislabelled. I did not rerun the browser; I read the scripts, results, screenshots, contracts and API routes.

## EXPLANATION

Backend was a fixture (scripts/fixture-api.mjs: real data/toc-migrated transcripts, stub /ask, in-memory join-rules). The evidence proves browser rendering, routing, forms and CORS fetch of the web pages. It does not prove the real API, stores, ranking, answers, or any 412 path. The agent's summary says exactly this; that disclosure is honest.

### Per-page: does a fixture-backed Playwright run satisfy "live-browser validation" as written?
D-024 (docs/DECISIONS.md:262): "Live-browser validation becomes mandatory for UI-touching units"; the checker "must drive its OWN browser and may not read the maker's screenshots"; the maker writes qa/evidence/browser-<unit-slug>-<date>/report.json; a checker verdict carries a LIVE-BROWSER field. D-024's motivation is the API/web port mismatch "which no unit test can see because both sides are individually correct", i.e. a real web+API pair. So this run is a maker-style browser run against a fake API: useful evidence, but not by itself a D-024 Mode D pass (no independent checker browser, different evidence path and naming, no report.json, fixture not the real API).

| Page | Requirement (quote) | Fixture run |
|---|---|---|
| U3.1 Ask (web-ask-page) | contract line 63: "A live check belongs to Mode C, not here."; TASKS.md U3.1 row: "qa/contracts/web-ask-page.md itself does not require Playwright"; plan exit "requires a Playwright pass" | Page, form, answer card, internal/web source split, citation link, click-through, timestamps in session detail: satisfied for rendering. Real answer/citation: NOT satisfied (stub /ask). Plan's "Playwright pass" wording: literally met; see ruling below. |
| U3.2 global search bar | manifest:8 "SOURCE SCOPE ONLY (D-024) ... No live-browser check was run"; :79 "Focus order, the role=search landmark and the layout were not seen in a browser." | Landmark, bar on a non-search page, submit to /search?q=, bar mirrors URL, results (title/Speaker/range/quote), Open transcript to #turn- anchor, no-match text: satisfied for those named gaps. Ranking: not covered. Focus order and phone layout: not exercised (1280 px only). |
| T-046 /meeting-bot | manifest:12 "NOT validated in a live browser ... the D-024 live-browser check is still owed."; :91 "No check against real API payloads" | Four section headings, retention text, no alerts: satisfied for rendering. "No check against real API payloads" NOT closed: payload shapes were written by the agent for this page. Data-bearing states (retention numbers, alerts, failures) not exercised. |
| T-037 join-rules editor | contract:17 "C11 - Live browser (OWED ...). In a real browser with a real key: phone (~375 px) and desktop widths; the sender and domain confirmations; read-only mode with a key lacking the join-rules scope; the 503 state." | NOT satisfied. Real key: fixture strings only. Phone width, sender/domain confirmations, 503 state: not run. Read-only mode: NOT demonstrated (below). Load/edit/save/reload/matcher-less block on desktop: satisfied for rendering against the fixture only. |

### U3.1 ruling
Does this run close U3.1? NO, not on this evidence alone. TASKS.md says "that literal Playwright run has NOT been done and is the only open item". This is a literal Playwright run, so the wording gap narrows, but (a) it used a stub /ask, while the earlier 2026-09-21 and 2026-09-09 evidence already covered the real answer; (b) D-024 wants a checker's own browser, and this was the evidence-maker's run; (c) the plan file holding the exit wording is outside the repo and I could not read it. U3.1 can move to done only if Umesh accepts this run as the "literal Playwright" item together with the earlier real-tenant evidence; otherwise leave in_progress. That is a tracker decision, not mine.

Is "speaker+timestamp on the Ask page" a contract requirement? NOT for U3.1: qa/contracts/web-ask-page.md contains no speaker or timestamp requirement. NOT for T-056 either: its row reads only "Full cited-answer UX policies conflicts review queue and unstructured search acceptance". The agent's classification (observation, low, ISS-BROWSERCHECK-002) is fair; the "FAIL" line in run-output.txt reflects the brief's expectation, not a contract failure.

### Defect in the evidence (cause of FAIL)
"JoinRules - key without join-rules scope: editor read-only: PASS (saveDisabled; notice=none)". The page sets read-only only after a WRITE returns 403 (JoinRulesPage.tsx:74-77 and 146). The run never attempted a write with the read-only key. "Save rules" is disabled for any clean draft, so the check passes trivially; `notice=none` shows no read-only message appeared. join-rules-5-readonly.png is byte-identical (cmp) to join-rules-3-after-reload.png (the rw key) and shows editable inputs. Read-only mode is therefore untested.
ISS-BROWSERCHECK-001: the source claim is TRUE (scripts/mint-key.mjs ALL_SCOPES omits join-rules; router.ts WRITE_SCOPE = "join-rules"), but its evidence text cites that screenshot as showing the effect, which it does not; a fresh documented key would open an editable editor that gets 403 on first save, not a read-only one. Wording should be corrected.

### Fixture fidelity (compared with apps/api)
- /search `{query, hits:[{turnId, sessionId, score, turn, session}]}` matches routes/search.ts (SearchHit and 200 body; 400 on empty q). Faithful.
- /sessions and /sessions/:id: real routes in routes/brain.ts (scope sessions); pages rendered real titles and turns; shapes consistent with what the pages consume. I did not diff every field.
- /ask: stub; sources.internal[].evidence.sessionRef and the web split mirror the route; content invented. Fine for rendering only.
- /calendar/join-rules GET `{ruleSet,state}` and 403 on missing scope match router.ts. The fixture PUT validation is far looser than the real validator, with no 413/500/503/412/428 paths. The matcher-less block was caught by the page's own client-side validation, so it says nothing about server parity.
- /webinar-operations and /calendar/upcoming payloads are agent-authored.
- Screenshots viewed (ask-2, join-rules-5): no API key visible; keys only in localStorage and Settings was never visited. Binary grep for key patterns: none. results.json: 0 console errors, 0 external origins.

### Leftovers and main tree
- Ports 27099, 3391, 5180, 27019: nothing listening. No mongod or chrome process. Three node.exe processes exist, none from this run (this session's scratch script, a lean-video-obs test from another lane, a node tool process); none bind those ports.
- Main tree `git status --short`: empty. apps/web/node_modules, dist and tsconfig.tsbuildinfo are ignored, so a refreshed .vite cache through the junction changes nothing tracked.

### Recommendations (not applied)
- Redo only the read-only check: key without join-rules, edit a rule, click Save, expect the 403 notice (role=alert) and disabled inputs. Correct the -001 evidence wording and screenshot attribution.
- U3.1: see ruling; keep in_progress unless Umesh accepts. U3.2 and T-046: leave in_progress, add a note "fixture-backed render checked 2026-10-12", no closure. T-037 C11 stays OWED.
- An independent checker browser pass against the real API remains owed for all four pages under D-024.
- ISS-BROWSERCHECK-001 (medium) and -002 (low) stay open; -002 belongs to T-056 and is not a pulled unit.

ISSUES-WRITTEN: none
