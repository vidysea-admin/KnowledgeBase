# U3.2 live browser check, 2026-10-13 (D-146)

Real Chrome 1 browser (headless, Playwright driver), apps/api on :3411 with MONGODB_DB=lkb_staging (asserted before start), apps/web (Vite dev) on :5411, CORS limited to :5411. Source: main tree HEAD c2d9db9a. Keys bc-u32-20261013 (tenants toc and bc-u32-20261013) were minted and deleted by id afterwards; no collection dropped; automation Chrome :9333 untouched.

| Result | Check | Detail |
|---|---|---|
| PASS | A signed-out: no global bar, no /search request | bar=0 searchRequests=0 text="" |
| PASS | B global bar present on /, /sessions, /ask, /calendar, /search (exactly one each) | {"/":1,"/sessions":1,"/ask":1,"/calendar":1,"/search":1} |
| PASS | C submit from / navigates to /search?q= and shows results (one request) | url=http://127.0.0.1:5411/search?q=counselling articles=1 searchRequests=1 reqUrl=http://127.0.0.1:3411/search?q=counselling&k=20 first="UniAccess Live: Meet Leeds Arts University 2026-08-24 Speaker: spk:2 1304–1356 s I think the perception that design is limi |
| PASS | C2 bar shows current q on /search | bar="counselling" |
| PASS | C3 result shows title, date, speaker, time range, quote, Open transcript link | UniAccess Live: Meet Leeds Arts University 2026-08-24 Speaker: spk:2 1304–1356 s I think the perception that design is limited to only color and paper. From tha |
| PASS | G Open transcript lands on the cited turn (rendered, highlighted, in viewport) | href=/sessions/2026-08-24-uniaccess-leeds-arts-university#turn-2026-08-24-uniaccess-leeds-arts-university-t020 visible=true inViewport=true bg=rgb(253, 243, 223) |
| PASS | H Back from transcript returns to results for same q | http://127.0.0.1:5411/search?q=counselling |
| PASS | D blank/whitespace refused: no navigation, no request | url=http://127.0.0.1:5411/sessions reqs=0 |
| PASS | M Enter key submits; space encoded as + | url=http://127.0.0.1:5411/search?q=AI+in+counselling reqs=1 |
| PASS | E special chars round-trip once (URL q and API q equal input; 1 request) | urlSearch=?q=A%26B+%231+50%25+%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%87+%E4%B8%96%E7%95%8C apiQ=A&B #1 50% नमस्ते 世界 n=1 |
| PASS | I no-hit query shows 'No passages found' empty state | arch Find passages in your transcripts and open their source. Search transcriptsSearch No passages found for “zzqxjvwk”. |
| PASS | F bar input capped at 512 chars | maxlength=512 typedLen=512 |
| PASS | F2 hostile ?q= is inert (no dialog, no injected element, API-origin only) | dialog=false injected=0 reqs=1 |
| PASS | F3 2000-char ?q= sends <=512 chars | sentLen=512 |
| FAIL | F4a direct browser load of malformed %-encoding under Vite DEV server | vite dev server answers HTTP 500 before the app loads (dev-server behaviour, any path; not app code) |
| PASS | F4 malformed percent-encoding (in-app navigation) does not crash page; searched as text | uncaughtPageErrors=0 searchReqs=1 text="Search all sessions Go Search Find passages in your transcripts and open their source. Search transcriptsSearch Results for “�%A” Visa Bluep" |
| PASS | C4 direct-URL load runs exactly one request | n=1 |
| PASS | H2 Back re-runs earlier query | Results for “counselling” |
| PASS | M2 bar input focusable | activeElement=#global-search-query |
| PASS | L mobile 390px: bar visible, no horizontal page scroll | {"sw":390,"cw":390} barVisible=true |
| PASS | J other-tenant key sees zero hits for the same query | our transcripts and open their source. Search transcriptsSearch No passages found for “counselling”. |
| PASS | K invalid key: no results shown | Living Knowledge Base Paste your API key to continue. Continue |
| pending-embeddings | P1 semantic/hybrid-ranked results on the Search page (embeddings) | GET /search is lexical-only today; lkb_staging holds 751 chunks of an expected 1905 and embeddings finish 14-15 Oct. Re-run after. |
| not built | P2 'Send to Ask' handoff from a result | Manifest u3-2-global-search-bar lists it as NOT done (needs an Ask-page ?q= contract first). Not a FAIL of this check. |

Network evidence: network-api-calls.json (status, method, URL, auth header redacted). Screenshots: *.png. Defects: qa/issues.u32live.jsonl (ISS-U32LIVE-001 low, ISS-U32LIVE-002 low).

Note F4a is marked FAIL for the Vite dev server only (ISS-U32LIVE-001); the app-level F4 check passes. Not covered: production build/static host, 403 no-scope key, Zoom/Teams.
