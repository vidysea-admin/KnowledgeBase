# Manifest — brain-knowledge-graph (U-BRAIN)

**Contract:** qa/contracts/brain-knowledge-graph.md
**Goal task:** none registered (Umesh live request, 2026-09-24 — not a `.goal/goal.json` roadmap row)
**Date:** 2026-09-24
**Fix cycle:** 0 of max 3
**Dual check:** no (no matching `.goal` task, so no `criticality: critical` derivation; the unit is
still FULL ceremony below because it changes a read path)
**Issues addressed:** ISS-292
**Executor:** claude-opus-subagent (this maker subagent)
**Executor rationale:** cross-layer unit (pure package + API read path + a full UI rewrite) with a
tenancy invariant on it — not an Ollama-lane candidate under the maker's never-delegate rule.
**Queue tier:** 4 — "Umesh live requests, 2026-09-24 — product UI epic", item 4.
**Severity gate:** FULL — it changes a read path (`GET /graph` now reads a second collection) and a
user-facing surface, so manifest + verdict + contract + close-out all apply.

**Status:** checked-PASS — cycle 0 PASS by /checker (a264c49, live visible browser + pre-unit negative control); closed out by maker 2026-09-25

---

## What changed

### Server — the union ([C1], [C6], [C7])

- `packages/index/src/graph/types.ts` (NEW, 74 lines) — the wire shape: `KnowledgeGraph{nodes,
  edges, stats}`, canonical `<kind>:<slug>` node ids, `ref` for deep links, `sources[]` provenance,
  per-edge `type`/`inferred`/`confidence`/`evidence[]`, and `KnowledgeGraphStats` for staleness.
  Named distinctly from `tree/flatten-graph.ts`'s `Graph` so `lint-dupes` stays green and the tree
  flattener's existing contract and tests are untouched.
- `packages/index/src/graph/build-graph.ts` (NEW, 208 lines) — pure `buildKnowledgeGraph({treeRoot,
  entityEdges, sessions})`. Canonicalises the tree half's bare slugs into `<kind>:<slug>` so a topic
  in `tree_index` and the same topic in `graph_edges` merge into ONE node; reads `graph_edges` rows
  defensively (the JSON Schema pins only `_id/tenantId/from/to/type` and allows extras); sets
  `inferred = confidence < 1`; relabels session nodes from real `sessions.title`; computes
  `sessionsMissing`.
- `packages/index/src/index.ts:11-12` — exports the new builder and types.
- `packages/db/src/index.ts:15-17` — exports the `graphEdges` accessor. It has existed since plan
  §10 U0.9 but was never exported, which is part of why no route could read the collection.
- `apps/api/src/store.ts:17` (import), `:249-260` (`createMongoGraphReadDeps`) — reads `tree_index`
  + `graphEdges(tenantId)` + `sessions(tenantId)` in parallel and builds the payload. Both new reads
  go through `packages/db` `coll(tenantId)`, so [I1] holds by construction.
- `apps/api/src/routes/graph.ts:1-22` — **the stale scope disclosure is corrected.** The old comment
  asserted `graph_edges` "hold ZERO real rows and no pipeline writes them" and that the route reads
  `tree_index` only; both stopped being true when `scripts/webinar/sync-session.mjs` shipped. The new
  comment states what IS read, what is still NOT (`speakers`/`orgs`/`topics` as collections,
  `decisions`, claim→topic edges) and why the 404 is deliberately kept.
- `apps/api/src/fixtures.ts:184-205` — `fakeGraphReadDeps` now carries one node from each source plus
  `stats`, so the union shape is exercised by the default fixture.

### Client — labels, drill-down, filters ([C2]-[C5], [C7], [C8])

- `apps/web/src/api/types.ts:60-108` — wire types mirrored by hand (this file's standing boundary
  rule): `GraphNodeKind`, `GraphEvidence`, `GraphStats`, and the edge's `type` field replacing `kind`.
- `apps/web/src/pages/brain/force-layout.ts` (NEW, 141 lines) — deterministic seeded
  Fruchterman-Reingold. Needed because the previous renderer was a `<canvas>`, which cannot carry a
  DOM label; an SVG renderer needs positions it owns. `MAX_LAID_OUT_NODES = 400` is the stated [I4]
  ceiling.
- `apps/web/src/pages/brain/GraphSvg.tsx` (NEW, 145 lines) — SVG renderer. Each node is a `<g>` with
  `tabIndex=0`, `role="button"`, an `aria-label`, exactly ONE `<text>` and ONE `<title>`. Inferred
  edges are dashed and lighter ([C4]).
- `apps/web/src/pages/brain/graph-model.ts` (NEW, 162 lines) — pure filtering, neighbour grouping,
  evidence hrefs, and the degrade-past-ceiling subgraph.
- `apps/web/src/pages/brain/NodePanel.tsx` (NEW, 132 lines) — drill-down: kind + label, neighbours
  grouped by edge type with direction arrows and per-edge confidence, every neighbour clickable, and
  an Evidence list linking to `/sessions/<id>#turn-<turnId>`.
- `apps/web/src/pages/BrainPage.tsx` (REWRITTEN IN PLACE, 211 → 265 lines) — URL-backed filters
  (`?kinds=&session=&q=&node=`), zoom/fit, re-centre on select, refresh-on-focus, the staleness
  banner, the counts line, the degraded-ceiling note, and the explanatory 404 empty state.
- `apps/web/src/pages/sessions/SessionDetailPage.tsx:8,11-17,41,55-62,92-96,120-126` — every turn now
  carries `id="turn-<turnId>"` + `data-turn-id`, and arriving with that hash scrolls to it and
  highlights it. Without this the [C3] evidence link would land at the top of an 80-turn transcript.

### Tests (written before the implementation)

- `packages/index/src/graph/build-graph.test.ts` (NEW, 13 tests) — red first (module not found), then
  green.
- `apps/api/src/routes/graph.test.ts` — **extended, not replaced**: the union assertion and the
  cross-tenant [I1] probe were added to the existing file because `apps/api/src/routes/` is at
  exactly its `lint-dirsize` budget (30/30) and a new file there is an automatic FAIL.
- `apps/web/src/pages/brain/graph-model.test.ts` (NEW, 16 tests), `force-layout.test.ts` (NEW, 7).
- `apps/web/src/pages/BrainPage.test.tsx` — rewritten. It used to `vi.mock("react-force-graph-2d")`
  away, so the thing under test was the mock; that is precisely why "13 shapes, 0 labels" was
  invisible to every existing test. The mock is gone and the [C2] probe runs for real.

### Two real bugs this unit's own tests caught

1. **Clear-filters did nothing.** Three sequential `setParam(…, null)` calls all read the same
   render's `prev` under React batching, so the last re-added what the first two deleted. Fixed with
   one atomic `setParams` (`BrainPage.tsx:141-150`).
2. **The [C2] probe was weaker than it looked.** Falsifying it by deleting the label CONTENT left an
   empty `<text>` behind and the count-equality assertion stayed green. The probe now also asserts
   every label is non-empty (`BrainPage.test.tsx:71-73`).

---

## How to verify (commands + expected)

| # | Command | Expected |
|---|---|---|
| 1 | `node --test --import tsx packages/index/src/graph/build-graph.test.ts` | 13 pass, 0 fail |
| 2 | `node --test --import tsx apps/api/src/routes/graph.test.ts` | 5 pass, 0 fail |
| 3 | `pnpm -C apps/web test` | 90 pass, 0 fail (15 files) |
| 4 | `pnpm -r typecheck` | every workspace Done |
| 5 | `pnpm lint:structure` | see "Known gaps" — lint-root FAILS on a PRE-EXISTING breach |
| 6 | `node qa/evidence/brain-knowledge-graph-2026-09-24/c06-live-graph.mjs toc` | 207 nodes / 642 edges; zoho node present; 0 unlabelled |
| 7 | `node qa/evidence/brain-knowledge-graph-2026-09-24/c06-live-graph.mjs probe-tenant-xyz` | `loadGraph -> null (route would 404)` |
| 8 | `curl -H "Authorization: Bearer <graph-scoped key>" http://127.0.0.1:3301/graph` | HTTP 200, union payload |

## Actual outputs (from the maker's own runs)

**1 — the pure builder**
```
✔ [C1] nodes and edges come from BOTH tree_index and graph_edges in one payload (4.5995ms)
✔ [C1] every node carries {id,label,kind} and kind covers session|topic|org|person|country|date
✔ [C1] every edge carries {source,target,type,inferred}
✔ [C4] confidence < 1 is flagged inferred; confidence 1 is not
✔ [I2] no edge is invented — edge count equals tree edges + distinct entity rows
✔ [C3] evidence turnIds survive onto the wire edge, with the session they belong to
✔ [C6] a session present ONLY in graph_edges still reaches the graph, labelled from sessions
✔ [C7] a session in `sessions` but in neither source is reported as missing, not hidden
✔ [C8] no tree and no edges builds an empty-but-honest graph rather than throwing
✔ the same entity in both sources is ONE node, tagged with both sources
✔ duplicate graph_edges rows collapse to one edge (idempotent re-sync is not a denser graph)
✔ labels for entity nodes are humanised from the id, never invented
✔ a malformed graph_edges row (missing from/to) is skipped, not rendered as a broken node
ℹ tests 13   ℹ pass 13   ℹ fail 0
```

**2 — the route**
```
✔ GET /graph with the graph scope returns real nodes/edges
✔ GET /graph without the graph scope returns 403
✔ [C1] GET /graph carries the union: tree_index AND graph_edges nodes, edges typed, stats present
✔ [I1] a second tenant's key gets 404 from /graph — no other tenant's node labels leak
✔ GET /graph for a tenant with no tree index and no edges returns 404 with an explanatory message
ℹ tests 5   ℹ pass 5   ℹ fail 0
```

**3 — the web suite**
```
 Test Files  15 passed (15)
      Tests  90 passed (90)
```

**4 — typecheck**
```
packages/core typecheck: Done   packages/db typecheck: Done   packages/ai typecheck: Done
packages/ask typecheck: Done    packages/ingest typecheck: Done   packages/index typecheck: Done
packages/meeting-bot typecheck: Done   apps/api typecheck: Done   (apps/web tsc --noEmit: clean)
```

**5 — `pnpm lint:structure`, run IN FULL (not a subset — ISS-285)**
```
lint-loc: OK (303 file(s) within budget)
lint-dirsize: OK (84 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example .gitignore
  .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml Living-Knowledge-Base-Architecture.html
  migrate-mongo-config.cjs package.json pnpm-lock.yaml pnpm-workspace.yaml structure.config.json
  TASKS.md tsconfig.base.json
```
The `&&` chain stops there, so every later step was run individually and all are green:
```
lint-dupes: OK (330 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (3468 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)
node --test scripts/lint.test.mjs → ℹ tests 14  ℹ pass 14  ℹ fail 0
tracker-audit: OK (gate G1,G4)
depcruise → ✔ no dependency violations found (320 modules, 986 dependencies cruised)
```
**Every one of those 16 files is tracked at HEAD — this unit added none of them.** See Known gaps.

**6 — live graph through the real store (Mongo 13.202.206.101, tenant toc)**
```
tenant toc: 207 nodes / 642 edges
  node kinds: {"session":27,"topic":158,"org":8,"date":1,"month":1,"user":1,"person":3,"country":8}
  edge types: {"session-topic":150,"session-org":24,"topic-cooccurrence":374,"held_on":1,
               "in_month":1,"captured":1,"spoke_in":3,"represents":2,"located_in":8,
               "partner_of":4,"covers":22,"discussed":52}
  stats: {"sessionsTotal":27,"sessionsInGraph":27,"sessionsMissing":[],
          "edgeSources":{"treeIndex":548,"entityEdges":94}}
  labelled nodes: 207 of 207
  [C6] 2026-09-24 zoho node: {"id":"session:2026-09-24-zoho-next-european-study-destinations",
    "label":"The Next European Study Destinations to Watch: New Choices for Your Europe Portfolio",
    "kind":"session","ref":"2026-09-24-zoho-next-european-study-destinations",
    "sources":["tree_index","graph_edges"]}
  [C3] edges carrying evidence turnIds: 83
  [C4] inferred edges: 465 of 642
```
Before this unit, the same route returned 164 nodes / 526 edges, kinds `session|topic|org` only.

**7 — cross-tenant control [I1]**
```
tenant probe-tenant-xyz: loadGraph -> null (route would 404)

graph_edges by tenant: [{"_id":"toc","n":94}]
sessions by tenant:    [{"_id":"toc","n":27}]
tree_index roots:      [{"node_id":"tenant:toc","tenantId":"toc"}]
```

**8 — over HTTP**
```
http 200
nodes 207 edges 642
kinds session,topic,org,date,month,user,person,country
unlabelled 0
stats {"sessionsTotal":27,"sessionsInGraph":27,"sessionsMissing":[],"edgeSources":{"treeIndex":548,"entityEdges":94}}
```

---

## Capability coverage (each new claim → its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `GET /graph` reads `graph_edges`, not `tree_index` alone ([C1]) | `build-graph.test.ts` "[C1] nodes and edges come from BOTH…" | `build-graph.ts:170` — `if (!from \|\| !to \|\| !type \|\| true) continue` | before `✔ [C1] nodes and edges come from BOTH tree_index and graph_edges in one payload (8.0312ms)` · after `✖ [C1] nodes and edges come from BOTH tree_index and graph_edges in one payload (7.4753ms)` |
| A sub-1-confidence row is marked derived, never equal to a stated one ([C4]) | `build-graph.test.ts` "[C4] confidence < 1 is flagged inferred" | `build-graph.ts:178` — `inferred: false` | before `✔ [C4] confidence < 1 is flagged inferred; confidence 1 is not (0.3884ms)` · after `✖ [C4] confidence < 1 is flagged inferred; confidence 1 is not (7.9682ms)`, siblings [C6]/[C7] stayed `✔` |
| Sessions absent from the graph are counted, not hidden ([C7]) | `build-graph.test.ts` "[C7] a session in `sessions` but in neither source…" | `build-graph.ts:205` — `sessionsMissing: []` | before `✔ [C7] a session in …reported as missing, not hidden (0.471ms)` · after `✖ [C7] a session in …reported as missing, not hidden (6.1499ms)`, [C4]/[C6] stayed `✔` |
| An edge-only session is labelled from `sessions.title` ([C6] acceptance case) | `build-graph.test.ts` "[C6] a session present ONLY in graph_edges…" | `build-graph.ts:195` — delete the `relabelSession` call | before `✔ [C6] a session present ONLY in graph_edges still reaches the graph, labelled from sessions (0.9092ms)` · after `✖ …(11.1309ms)`, [C4]/[C7] stayed `✔` |
| Every rendered node carries a real, non-empty `<text>` label ([C2]) | `BrainPage.test.tsx` "renders one `<text>` label per visible node" | `GraphSvg.tsx:138` — delete `{shortLabel(n.label)}` | before `✓ BrainPage [C2] — the label probe > renders one <text> label per visible node, and the count is not zero (394ms)` · after `× …renders one <text> label per visible node, and the count is not zero` / `AssertionError: expected 0 to be greater than 0` |
| An evidence row resolves to its exact turn ([C3]) | `graph-model.test.ts` "resolve to a real turn anchor on the session page" | `graph-model.ts:57` — `const sessionId = undefined` | before `✓ evidence links [C3] > resolve to a real turn anchor on the session page` · after `× …` / `AssertionError: expected null to be '/sessions/s1#turn-t-7'`; the [C5] sibling stayed `✓` |
| The kind filter actually narrows the graph ([C5]) | `graph-model.test.ts` "kind filter is strict and drops edges whose endpoint left" | `graph-model.ts:131` — `if (false) {` | before `✓ filterGraph [C5] > kind filter is strict and drops edges whose endpoint left` · after `× …` / `AssertionError: expected [ 'session:s1', …(4) ] to deeply equal [ 'person:anita' ]`; the [C3] sibling stayed `✓` |
| The route answers for the CALLER's tenant only ([I1]) | `graph.test.ts` "[I1] a second tenant's key gets 404…" | `routes/graph.ts:36` — `deps.loadGraph("tenant-1")` | before `✔ [I1] a second tenant's key gets 404 from /graph — no other tenant's node labels leak (26.2681ms)` · after `✖ …(50.0362ms)` / `AssertionError: probe tenant must not reach tenant-1's graph` |

Mutation-run safety (D-020): every edit above ran through a harness that takes a byte backup, applies
the edit, runs the suite under `timeout 300`, and restores from the backup in a `trap … EXIT INT TERM
ERR`, verifying with `cmp`. Each run printed `RESTORED-OK <file>`, and a post-run
`grep -rn "MUTANT" apps packages` returns nothing.

---

## Live browser evidence

`qa/evidence/brain-knowledge-graph-2026-09-24/` — headed Chromium via the Playwright MCP, against a
FRESH api on `:3301` running this unit's code (the pre-existing `:3300` instance is on stale
pre-unit code and was deliberately left running) and a vite on `:5176` pointed at it, over the real
Mongo tenant `toc`.

- **Pages:** `/brain`, `/brain?node=session:2026-09-24-zoho-…`, `/brain?kinds=person,country,session&q=hungary`,
  `/sessions/2026-09-24-zoho-…#turn-…-t002`.
- **Console errors: 0** on all four (2 React Router v7 future-flag warnings and a dev-server
  favicon 404, neither from application code).
- **[C2] DOM probe:** `nodeGroups 207 · svg text 207 · svg title 207 · equal: true`. Baseline before
  this unit: 13 shapes, **0** labels.
- **Interactions** (`{did, expected, observed, pass}` in `report.json`): node click → panel with 7
  edge-type groups and 34 clickable neighbours; confidence shown for derived rows; evidence link →
  the exact turn, anchor found among 80, highlighted `rgb(253,243,223)`, turn text *"Devanshi-tion
  and build a more diversified Europe portfolio…"*; URL-only filter load → 5 of 207 nodes, "2
  filter(s) active". All `pass: true`.
- Screenshots: `b01-graph-with-labels-and-panel.png`, `b02-filtered-view-url-state.png`.

**This is a SMOKE CHECK and is not the validation.** Per the standing rule the live visible-browser
verdict is the checker's, running its own script — `qa/evidence/ui-epic-2026-09-24/checker-probes.md`.

---

## Known gaps (disclosed)

1. **`pnpm lint:structure` FAILS on `lint-root`, and it is PRE-EXISTING.** Root holds 16 tracked
   loose files against a budget of 15. All 16 are tracked at HEAD and this unit added none; I did not
   move one, because root layout is named in `ARCHITECTURE.md §4` and moving a tracked root file
   needs an authorizing `docs/DECISIONS.md` entry, which is the Approver's call, not the maker's.
   **This needs a decision before any unit in this repo can claim a fully green `lint:structure`.**
2. **A pre-existing test failure, unrelated to this unit:** `packages/index/src/tree/tree-real-data.test.ts`
   fails with `ENOENT … data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/session.json`
   — the webinar sync wrote `source.json`/`turns.json`/`meta.json` into that directory but no
   `session.json`, and the test walks every directory. **Verified pre-existing by stashing this
   unit's entire diff and re-running: `ℹ pass 0 · ℹ fail 1`, same ENOENT.**
3. **I removed an untracked file by accident.** The stash round-trip used to prove gap 2 did not
   restore the stray untracked root artifact
   `C<U+F03A>UsersLenovoAppDataLocalTempclaude…scratchpaddiff.patch` (a temp diff with a mangled
   Windows path as its filename, present in the starting `git status`). It was never tracked, so no
   history is lost; its blob survives in a dangling stash commit if anyone wants it. Root's tracked
   count is 16 either way, so it does not change gap 1.
4. **`apps/api/src/store.ts` is now at exactly 300 non-blank lines, the lint-loc budget.** It is
   green, with zero headroom. `apps/api/src/` and `apps/api/src/routes/` are both at exactly 30/30
   files, so the usual remedy (split into a new file) is closed off. The next unit that touches this
   file will have to make room first — flagging it rather than leaving it to be discovered.
5. **[C7]'s banner is not visible in the live browser evidence** because the real data currently has
   `sessionsMissing: 0` — the correct behaviour is for it not to render. It is covered by a unit test
   with a seeded missing session, not by a live screenshot.
6. **[C8]'s empty state is not shown live** either; it needs a key for a tenant with no data. Proven
   at the store layer (`loadGraph('probe-tenant-xyz') -> null`) and by a unit test.
7. **I minted an API key against the live Mongo** (`node scripts/mint-key.mjs --tenant toc --label
   u-brain-maker-smoke`) to run the browser smoke check. That is a production write. It is the
   project's own sanctioned path for exactly this (the script's own header: "Minting a credential is
   not seeding content"), it seeds no content, and it is revocable. No other production write happened.
8. **`react-force-graph-2d` is now unused** by application code but deliberately LEFT in
   `apps/web/package.json`. Removing a dependency is not something this contract asks for and would
   be a separate, reversible decision.
9. **[C5] search keeps matches AND their direct neighbours**, not matches alone — a matched node with
   no edges renders as a disconnected dot, which is the failure mode this unit exists to fix. The UI
   says so in the page header. If the checker reads [C5] as strict-matches-only, this is the one
   place to push back on.
10. **[C8] vs [I1] conflict, resolved toward the invariant.** [C8] says "not a 404 that the UI
    silently swallows" while [I1] pins a probe that requires `/graph` to 404 for a foreign tenant.
    I kept the 404 (with an explanatory `message`) and made the UI render it as an honest empty
    state. Turning it into a 200-with-empty-nodes would have broken the [I1] probe set verbatim.
    Flagging it explicitly rather than narrowing either one quietly.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
