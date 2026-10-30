# t057 KB vectorless (PageIndex-style) retrieval: what exists, why VC does not use it, minimal design

Date: 2026-10-29. Read-only study. No code edit, no restart, no DB write, no browser, no secret value printed (key NAMES only: `VC_KB_BASE_URL`, `VC_KB_API_KEY`). Live probes this task: 6 sequential GETs/POSTs (`/health`, `/sessions`, `/graph` twice, one `POST /ask`). Cites are `path:line` in `D:\KnowledgeBase` (HEAD `1af3f3d3`, sibling repo, read-only per D-001) unless marked VC.

## 1. Does the KB already contain a vectorless / tree path? YES. It is built, populated, and exposed. VC does not use it.

Intended design (documented, approved): ARCHITECTURE.md:14-15 and :30-33 (H1 "Vectorless for every source type. Provenance-bound trees (PageIndex pattern), keyword retrieval ... and bounded LLM navigation; no embedding step on ingest"). Approved by Umesh as D-173 (docs/DECISIONS.md:2297-2305, "Complete the Knowledge Brain with Vectorless RAG"; text routing on Ollama Cloud GLM primary + DeepSeek verifier). H2 (ARCHITECTURE.md:34): tree-search -> retrieval evaluator -> answer, web fallback when coverage insufficient.

Code that already implements it:

| Piece | Where | What it does |
|---|---|---|
| Tree builder (offline) | `packages/index/src/tree/build.ts:1-159` (`buildTree`, summaries from `session_pages.summary`; topic children `extract-topics-llm.ts`, `topic-indexing.ts`) | Tree = `tenant -> year -> month -> session -> topic / org`, node `{node_id,title,level,summary,children,evidence{sessionRef,sessionRefs}}`. Built at ingest/index time. No embeddings, no network in the builder. |
| Tree store | Mongo `tree_index`, one root doc per tenant, filter `treeIndexRootFilter` `build.ts:49-51` (`node_id = tenant:<id>`); schema `schema/tree_index.schema.json`; read by `loadWithExclusions` in `apps/api/src/routes/ask/ask.ts:62-63` | Loaded whole on every `/ask` (404 "no tree index built" if absent, `ask.ts:65-68`). |
| LLM node selection | `packages/ask/src/select-nodes.ts:1-97` (`selectNodes`) with `tree-routing.ts:1-43` (`routingFrontier`, caps `ROUTING_LIMITS = {nodes:48, bytes:24KB}` `tree-routing.ts:4`) | Up to 3 rounds (`select-nodes.ts:73`); each round sends a `node_id \| title \| summary` frontier, LLM returns `{"node_ids":[...]}`, `treeSearch` (`packages/index/src/tree/search.ts:17-27`) resolves ids to nodes. This IS the PageIndex query step. |
| Deep pipeline | `packages/ask/src/ask-v2.ts:22-24` -> `ask-graph.ts:131-133` (retrieve = selectNodes + gatherCandidates), then per-candidate LLM scoring (evaluator), refine, answer, grounding (up to 12 LLM completions, D-203 text) | Exposed as `POST /ask` with `filters.mode = "deep"` (`apps/api/src/answer-policy/application.ts:58-61`). |
| Default path | `ask-v2.ts:34-150` `askFastV2` (D-203, docs/DECISIONS.md:2657-2665) | Since D-203 (2026-10-28) the DEFAULT `/ask` is "standard RAG chatbot": NO tree-selection LLM. Retrieval = lexical arm over turns + a non-LLM lexical match over tree topic/native-passage node summaries (`apps/api/src/ask/passage-lexical.ts:84-98` `treeLexicalIds`, `TREE_ARM_LEVELS = {native-passage, topic}`), top-5, then ONE answer LLM call + at most one grounding call, 20 s deadline (`ask-v2.ts:30`, `application.ts:55`). D-203 status: "Pending: maker unit ask-fast-rag. Redeploy to live stays a separate human gate." |
| Expose tree to clients | `GET /graph` (graph built from the tree: `stats.edgeSources.treeIndex`) | Live, see section 2. |

Is it populated live? Yes. Probe `GET /graph` (200, 4.55 s, 72 KB): `stats = {sessionsTotal:21, sessionsInGraph:21, sessionsMissing:[], edgeSources:{treeIndex:460, entityEdges:0}}`; nodes by kind: topic 110, session 21, org 3; 2 sessions excluded as `unsupported-text` (`excludedSessions:2`). (Note lkb-live.knowledge.md:40 said `/api/graph` 404 "no tree index yet" on 2026-10-26; that is stale, the tree exists now.) VC's own `kb-client.ts` already knows the 404 case (`not_found`).

### Why VC does not use it
1. VC calls only `GET /search` (`mcp/university-kb/src/source-kind.ts:201`, `client.search(query, STUDENT_SEARCH_K=5)`; `kb-client.ts:494`) and `POST /ask` (`kb-client.ts:607`). `/search` is lexical turn retrieval and does NOT touch the tree at all (`apps/api/src/search-store.ts:127-155`, analysis in `kb-slowness-analysis.md` section 2).
2. `/ask` is the only endpoint that can reach the tree, but (a) the live deployment is evidently still the PRE-D-203 deep graph or otherwise very slow: my probe `POST /ask {"query":"What did the speakers say about the University of California admissions?"}` got NO response in 60 s (client timeout; the D-203 fast path would have returned a degraded answer by its 20 s deadline, `ask-v2.ts:136-142`), so the live host is likely not running the fast-path code (inference; deploy SHA not observable) and (b) VC caps `/ask` at 8 s (`kb-client.ts:164-165`), so even a working deep run (many sequential LLM calls) can never finish inside VC's budget.
3. Even the new fast path pays the KB's N+1 visibility cost: `apps/api/src/ask/ask-arms.ts:85-86` loads ALL tenant turns (`turns.find({})`) and runs `visibility.filterTurns` over every one of them (`apps/api/src/visibility/knowledge.ts:157-168`, the sequential ~8-round-trip-per-row loop) once per request (`currentTurns` memo, `ask-arms.ts:87-88`). With ~3.2k turns that alone is multi-second to tens of seconds, before any LLM call. So the tree is never the bottleneck; the visibility loop is, on both `/search` and `/ask`.

## 2. Corpus shape

- Live DB `lkb_prod`, tenant `toc` (docs/VC-DB-READ-CONTRACT.md:41-47 area; `lkb-live.knowledge.md:26`): 22-23 sessions, ~3.2k turns (3,165-3,238 across snapshots), 1,768 claims, 1,828 chunks, 105 topics. Probe `GET /sessions` (200, 0.23 s): 23 sessions, 21 usable in the graph; 2 index-FAILED earlier (Visa Blueprint Part 2, new UCAS application; `status.index:"failed"`), so hidden by visibility.
- Collections (`docs/SNAPSHOT.md:99-143`, `docs/VC-DB-READ-CONTRACT.md:36-47`): `turns` (verbatim passages; `tenantId, sessionId, speakerRef, tStart, tEnd, text`), `sessions` (title, date, org, sourceId, status), `sources` (kind, consent), `session_pages` (summary, keyInsights, decisions, qa, evidence), `claims`, `topics` (`name`, `sessionRefs`), `chunks` (dormant embeddings), `tree_index`, `graph_edges` (0 rows live), `transcript_reviews` (overlay text). `turns` indexes: `_id_`, `tenantId_1`, `tenantId_1_sessionId_1` only (`search-store.ts:40-43`).
- Natural structure: it is a SMALL corpus of webinar recordings (titles like "UniAccess Live: Xavier University", "Inside the UC System", "Visa Blueprint Part 2: Italy, France, New Zealand", "Funding Dreams", "UK: Beyond Offer Letters", "India Test Series", GRE/GMAT/UK tests). Existing hierarchy is TIME (year > month > session) then topic/org children; session is the natural leaf for retrieval, topic nodes are the natural cross-session routing hints (105 topic strings). Country / topic / university grouping is not in the tree today; it is implicit in titles and topic names and could be added by the builder (a "country > topic > session" overlay) without changing leaves.
- Size consequence: 21 sessions + 110 topic titles as `node_id | title | summary<=768 chars` is about 15-25 KB (~4-6k tokens). That fits one LLM call whole (the existing frontier cap is 24 KB / 48 nodes, `tree-routing.ts:4`). No multi-round descent is needed at this corpus size.

## 3. What `/ask` does today (models, tree selection)

- Deep mode (`mode:"deep"`): LLM calls = select_nodes (up to 3 rounds), one score call per candidate (up to 6, `SOURCE_LIMITS.candidates`), refine strips, answer, grounding; routed through `options.dispatch` -> the T-019 provider router (`apps/api/src/ask/source-context.ts:265`). Models per D-173: GLM 5.3 Flash (Ollama Cloud) primary, DeepSeek 4.1 Flash as independent grounding verifier (data/eval/vectorless-full92-proposal-20261015/README.md planning notes: "GLM is primary, DeepSeek performs independent answer grounding"; "12 logical completions per question" structural worst case). The proposal README budgets six nominal calls per question. Routing file is `config/ai-routing.yaml` (not read in detail here).
- Fast mode (default after D-203, not necessarily deployed): no select_nodes, no scoring; arms-only top-5 -> one answer call -> one grounding call (`ask-v2.ts:34-61`, 20 s deadline). So the PageIndex "LLM reads the tree and picks node ids" step is currently reachable ONLY through `mode:"deep"`, and D-203 deliberately moved it off the default path to cut latency (a Umesh ruling quoted in D-203 "Why": live /ask exceeded 90 s with up to 12 LLM calls).
- Response contract: `{answer, verdict, reason, scored, web_used, insufficient_coverage, sources:{internal,web}, auditLog}` (mirrored in VC `kb-client.ts:1-12`). `internal[].node_id` are tree node ids.

## 4. VC side: where a tree path plugs in

- `packages/engine/src/student/graph.ts:1397-1476` `answerFromKb`: binds `deps.kb.searchKb` (always), `askKnowledgeBase` (authenticated only) and `getSession` (authenticated only) (`graph.ts:1400-1402`, `1476`). Port built in `mcp/university-kb/src/source-kind.ts:185-230` `createStudentKbPort`: `searchKb -> client.search(query, 5)`, `askKnowledgeBase -> applyServeRule(client.ask(query))`, `getSession -> client.getSession`.
- Anonymous mode is structurally search-only (`kb-client.ts` `KnowledgeBaseAnonymousClient = Pick<..., "search"|"sources">`); any tree path for anonymous must also be search-shaped (return cited hits, no answer generation) to preserve A15c.
- Plug-in point: a new read method on the KB client next to `search` (for example `routeTree(query)` returning `{hits:[{turnId,sessionId,score,turn,session}]}`, the SAME `KbSearchHit` shape, `kb-client.ts:228-250`), wired as the first branch inside `createStudentKbPort.searchKb` (`source-kind.ts:199-203`) with the lexical `/search` as the fallback only. No change to `answerFromKb` consumers because hits keep the existing shape and verification against inline turn/session (B2/A13) stays intact. Serve rule `applyServeRule` stays unchanged for `/ask`.

## 5. Proposed design (concrete, minimal)

Goal: replace "lexical regex over all turns + per-turn visibility" with "one fast LLM call over the compact tree -> session/topic ids -> indexed fetch -> visibility check on only the selected sessions". Keep provenance (turn ids, quotes) and the visibility rules intact.

### 5.1 Two ways to land it (both reuse the existing tree)

- Option A (recommended first, KB repo, needs Umesh approval, D-001): add a thin endpoint in KB, `GET /route?q=&k=` (scope `search`), that does: load tree from `tree_index` (already cached/loaded for `/ask`, `ask.ts:62`), `routingFrontier` + a single `selectNodes` round (reuse `packages/ask/src/select-nodes.ts` with `maxRounds=1`, `tree-routing.ts`), resolve ids with `treeSearch` (`packages/index/src/tree/search.ts:17`), fetch only the selected sessions' turns by indexed `{tenantId, sessionId:{$in}}`, rank those turns in memory with `lexicalSearchTurns` (already fast: KB's own comment 38 ms per 2118 turns), return the existing `/search` hit JSON. Reuses all of the KB's tested code; the only new code is the route plus the memoised visibility change K1.
- Option B (VC only, no KB approval needed, uses the approved read contract docs/VC-DB-READ-CONTRACT.md "VC reads the KB database directly"): build and keep the tree in the VC database `virtual_counsellor` (full CRUD there, approved 2026-09-25), built by a VC offline job from KB `sessions` + `session_pages` + `topics` (+ `claims` for per-session facts), and query it in VC. VC must then re-implement the contract section 4 visibility rules (docs/VC-DB-READ-CONTRACT.md:68-90: session `index=="done"` and `indexAttempt.state=="complete"`, generation match, source `kind` allowed and `consent.given!==false`, skip `whatsapp-batch`, apply `transcript_reviews` overlay) and needs DB network access to the KB Mongo host (contract: "Allow VC's host IP only", currently an open item; the shared Mongo host "lacks auth today", contract line 172). Higher duplication risk and a second source of truth for visibility; do A unless Umesh wants VC independent of the KB deploy cycle.

### 5.2 Where the tree lives

Option A: the existing `tree_index` collection in `lkb_prod` (no new store). Option B: a VC-owned collection `kb_tree` in `virtual_counsellor` with one doc per tenant plus a `builtFromDigest` (hash of the session ids + `indexAttempt.generation`s) so a stale tree is detected and rebuilt.

### 5.3 Build job (offline, cheap)

Reuse `buildTree` for structure (`build.ts`). Add the one thing the current tree lacks for routing quality: a one-line routing summary per session and a country/theme tag set. Use Gemini 3.5-flash-lite (VC choice per Umesh; KB's own routing is GLM 5.3 Flash via Ollama Cloud, D-173, so a KB-side build keeps GLM and a VC-side build uses Gemini). Node shape, unchanged plus two optional fields: `{node_id, title, level, summary (<=768 chars, routing-only), children, evidence{sessionRef,sessionRefs}, tags?:string[], turnSpans?:[{tStart,tEnd}]}`. Cost: 21-23 sessions, one summarise call each (the KB already writes `session_pages.summary` at ingest, so the build can be $0 by reusing it, or about 23 x ~1-3k tokens if re-summarised). Rebuild triggers: new/changed session (`indexAttempt.generation` change) or consent withdrawal; incremental via `regenerate.ts` (`packages/index/src/tree/regenerate.ts` already rebuilds touched years only). Total build for the whole corpus: well under a minute and under a few cents at flash-lite prices (unknown exact price; do not treat as free).

### 5.4 Query path and expected latency per stage (inference, NOT measured unless stated)

| Stage | Work | Expected latency |
|---|---|---|
| 1. Load compact tree | Option A: in-memory cached `tree_index` root (one indexed `findOne` on `tenantId`+`node_id` on a miss; 15-25 KB). Option B: process-memory cache in VC, refresh on a version check. | 1-30 ms warm, ~50-150 ms cold |
| 2. Local pre-rank (optional, no LLM) | `routingFrontier` token-overlap ranking (`tree-routing.ts:9-43`) to pick the 48 nodes / 24 KB that go to the model | under 5 ms |
| 3. ONE LLM call: pick node ids | prompt ~4-6k tokens in, ~50-100 tokens out (`{"node_ids":[...]}`), flash-lite class model | about 0.8-2.0 s (provider dependent; the model-options evidence in this folder gives the VC-side numbers to use) |
| 4. Resolve + fetch text by id | `treeSearch` in memory; `turns.find({tenantId, sessionId:{$in:[<=3 sessions]}})` uses the `tenantId_1_sessionId_1` index (`search-store.ts:40-43`); ~150 turns per session (3.2k turns / 22 sessions) -> about 100-450 rows | 30-150 ms |
| 5. Rank turns inside selected sessions | `lexicalSearchTurns` in memory | under 50 ms |
| 6. Visibility on the selected sessions only | session-level checks ONCE per distinct session (sessions + sources + whatsapp_candidates + review head = ~4-5 reads each, memoised), then per-turn overlay via ONE `transcript_reviews.find({sessionId:{$in}})` instead of per-turn reads | 50-200 ms IF K1 (batched/memoised `filterTurns`) lands; WITHOUT K1, 450 turns x ~8 sequential reads is several seconds, so K1 is a prerequisite for the latency target |
| Total to cited hits | | roughly 1.2-2.6 s, versus 6 to >40 s for `/search` today (`kb-slowness-analysis.md` section 3) |
| Optional answer stage | VC already generates its own reply from the hits (VC `answerFromKb`), so no KB `/ask` call is needed on this path | removes the second 8 s cap (`kb-client.ts:164-167`) entirely |

Compared with KB `/ask` deep: deep does 6-12 LLM calls; this design does 1 (plus VC's own answer call that exists today).

### 5.5 How the visibility / permission rule is preserved

- The tree is only a routing aid; it never carries answer evidence. Answer text always comes from `turns` rows fetched by id, so every fact keeps a turn id + session + tStart/tEnd (H3 "no fact without provenance", ARCHITECTURE.md:35-37) and the existing B2/A13 verification in VC (drop hits whose turn/session is not inline) still applies.
- Visibility is checked AFTER selection on only the chosen sessions, with the same rules (`knowledge.ts:41-50, 97-116`; contract section 4): published (`index done` + `indexAttempt complete`), generation match, `sources.kind` allowed and `consent.given !== false`, no `whatsapp-batch`, review overlay applied. Fail closed: any read error drops the session (`guarded(...)` pattern, `knowledge.ts:150-168`).
- Tree staleness cannot leak withdrawn content: the node ids only select WHICH sessions to inspect; a withdrawn/failed session is rejected at stage 6 even if its summary is still in the cached tree. The KB already does a trusted-tree check (`visibility.trustedTree`, `knowledge.ts:169`) and tenant-membership guard on candidates (`ask-graph.ts:94-103`); Option A inherits both. One residual risk to test: routing summaries are derived text, so a withdrawn session's summary text must not be sent to the routing LLM either (the existing `loadWithExclusions` / eligible-tree filter, `ask.ts:62`, `apps/api/src/indexing/eligible-tree.ts`, already strips ineligible sessions from the loaded tree; Option B must replicate that filter at tree-build and at cache-refresh time).
- Anonymous mode: tree routing returns hits only (no `ask`, no `getSession`), same structural limit as today.
- Student data: the query text is the only thing sent to the routing LLM (a user question, as today to `/search`); no profile or student rows. Under Option B the routing LLM is Gemini (external service), so per the hard rule it needs per-use approval for V3.3/Pathlynks/student data, which does not apply here because the payload is KB webinar summaries plus the typed question only; flag it anyway as a decision for Umesh if student profile facts are ever added to the query.

### 5.6 Edits by repo

KB repo (`D:\KnowledgeBase`, sibling, read-only for VC, needs Umesh approval per D-001, Lab Protocol: decision entry + checker there):
1. K1: memoise / batch `filterTurns` and `currentTurn` per `(tenantId, sessionId)` (`apps/api/src/visibility/knowledge.ts:97-168`). Needed for stage 6 under any design, and also fixes `/search` (23.6 s -> about 1-2 s) and `ask-arms.ts:85-86` (all-turns visibility on every `/ask`).
2. New route `GET /route` (Option A) or reuse `/ask` with a `mode:"route"` that stops after retrieval (`application.ts:58-61` is the switch to extend). Reuses `select-nodes.ts` with a 1-round cap.
3. Redeploy the D-203 fast-path build to live (separate human gate per D-203) so `/ask` stops hitting the 60 s+ deep path.
4. Optional: enrich the tree builder with `tags` (country/theme).

VC repo (this worktree, ours, no approval needed beyond normal maker-checker):
1. `mcp/university-kb/src/kb-client.ts`: add `route()` next to `search()` returning `KbSearchResult`; add a `KB_ROUTE_TIMEOUT_CAP_MS` (3 s suggested) beside lines 164-167.
2. `mcp/university-kb/src/source-kind.ts:199-203` `searchKb`: try `route()` first, fall back to `search()` only on `unavailable`/`not_found`, and add a per-process circuit breaker after a timeout (V2 in `kb-slowness-analysis.md`) so a slow KB does not add 8 s per turn.
3. Tests mirroring `kb-client` outage tests (typed `unavailable`, never throws) and a visibility test: a withdrawn-source session id returned by the router must be dropped.
Immediate VC-only mitigations (V2, V3 in the slowness analysis) still apply and do not depend on any of this.

### 5.7 Caveats (brain caveat applied) and risks

- Vectorless needs structured documents and costs one LLM call per query. Here the structure exists (sessions with summaries and 105 topics) and the corpus is tiny, so the call is cheap; it will degrade if the corpus grows past about 150 sessions or the summaries stay generic (then use the existing multi-round descent, `select-nodes.ts` three rounds, or a topic-first frontier).
- Recall is bounded by summary quality: a fact discussed inside a session but not reflected in its 768-char routing summary or topic names will not be routed to. Mitigation: keep the lexical `/search` as a fallback on empty routing, add `tags`, and evaluate on the KB's 92-question golden set (`data/eval/vectorless-full92-proposal-20261015/`), which is already designed for this comparison but is still an unsigned, unexecuted proposal needing Umesh's spend approval.
- The 2 index-FAILED sessions and the 2 `unsupported-text` exclusions are not in the tree, so questions about them (for example "Visa Blueprint Part 2: Italy, France, New Zealand") cannot be answered by any tree path until re-indexed.
- Expected latencies in 5.4 are estimates from code structure and the measured ~1.5 ms-per-read and 0.15 s network RTT in the slowness analysis; the only measured numbers here are `/health` 0.18 s, `/sessions` 0.23 s, `/graph` 4.55 s (this one also pays the tree load + visibility exclusions, so it is a rough upper bound for a cold tree read), and the `POST /ask` 60 s no-response.

## 6. Not measured / limits

- Deployed KB build SHA, KB host CPU/RAM, the model actually used by `/ask` live, and per-stage server timings (remote host, no logs).
- `/ask` default and `/ask mode:"deep"` completion latency (one default probe timed out at 60 s; not repeated to avoid load/cost). `config/ai-routing.yaml` model assignments were not read line by line.
- Tree text size (15-25 KB) is an estimate from the node counts (21 sessions, 110 topics) and the 768-char summary cap, not a fetched byte count of `tree_index`.
- Option B's network reachability to the KB Mongo host from VC is unverified.
