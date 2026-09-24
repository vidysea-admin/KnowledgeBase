# Contract — brain-knowledge-graph (U-BRAIN)

> **Authored by the CHECKER on 2026-09-24**, from Umesh's live instruction: *"abhi ye jo brain hai
> naa, it should look like a knowledgegraph aur like click krne mai we should get further details
> like drill down, abhi ye jo hai its not thatt amazing. we need to improve it and also like isko
> update bhi krte rhna hai along with new sessions and all."*
> Status: `proposed`. The maker never edits this file.

## Why this exists — measured, in a visible browser, 2026-09-24

Three defects were confirmed on screen at `127.0.0.1:5173/brain`, not inferred:

1. **The graph has no labels.** DOM probe: `svg circle|rect|g[class*=node]` = 13, `svg text|title`
   = **0**. Every node is an unlabelled dot, so the "knowledge graph" is a hairball that cannot be
   read without clicking each dot in turn.
2. **The richest data is not in it.** `GET /graph` returns 164 nodes / 526 edges built from
   `tree_index` ONLY. `apps/api/src/routes/graph.ts:5-11` still asserts that
   `graph_edges`/`topics`/`speakers`/`orgs` "hold ZERO real rows and no pipeline writes them" —
   **false since 2026-09-24**: `graph_edges` holds 94 real rows (person/org/topic/date/country
   entities, `type` values such as `held_on`, `spoke_in`, `covers`, `discussed`, each with
   `evidence[].turnId`, `confidence` and `tenantId`). No API route reads that collection.
3. **New sessions never arrive.** The 2026-09-24 webinar is in `sessions`/`turns`/`graph_edges`
   but has **0 chunks, 0 session_pages** and is absent from `tree_index`, so it does not appear on
   /brain at all and `/ask` answers "all candidates scored < lower threshold 0.3" about it.

Drill-down is not absent — clicking a topic shows a right panel with `LINKED SESSIONS (1)` — but it
is **one level deep and terminal**: a list of session links, no neighbours, no evidence, no path
back into the transcript.

## Scope

Rebuild the /brain surface into a readable, navigable, self-refreshing knowledge graph over the
UNION of `tree_index` and `graph_edges`. Server, client and freshness are in scope. Redesigning the
extraction that produces the edges is **not** — this unit renders and refreshes what exists and
makes the gaps visible rather than silently empty.

## Criteria (each machine-checkable)

1. **[C1] Union source.** `GET /graph` returns nodes and edges derived from BOTH `tree_index` and
   `graph_edges`, tenant-scoped through the `packages/db` accessor. Every node carries
   `{id, label, kind}` where `kind` covers at least `session | topic | org | person | country |
   date`. Every edge carries `{source, target, type, inferred, confidence?}`. The stale scope
   disclosure at `routes/graph.ts:5-11` is corrected in the same change.
2. **[C2] Labels are rendered.** For a tenant with ≥1 session, the /brain SVG contains at least one
   `<text>` (or equivalent accessible label) per visible node. **A DOM probe asserting
   `svg text` > 0 and equal to the visible node count is part of the unit's tests** — the current
   value is 0 and this criterion exists solely because that was invisible to every existing test.
3. **[C3] Drill-down is at least two levels and never terminal.** Clicking any node opens a panel
   showing: the node's kind and label; its neighbours grouped by edge `type`; and, for any edge
   carrying `evidence[].turnId`, a link that resolves to that turn in the session transcript.
   Every neighbour in the panel is itself clickable and re-centres the graph on that node. A user
   can get from a topic to a speaker to a session to a specific turn without typing a URL.
4. **[C4] Evidence and confidence are shown, not hidden.** Any edge with `inferred: true` or
   `confidence < 1` is visually distinguishable and states its confidence on inspection. The
   existing keyword-derived `covers`/`discussed` edges (confidence 0.7-0.8) must not be presented
   as equal to `held_on`/`spoke_in` (confidence 1).
5. **[C5] Filter and focus.** The graph can be filtered by node kind and by session, and searched
   by label. Filtering is reflected in the URL so a view can be shared and reloaded.
6. **[C6] FRESHNESS — the part Umesh asked for explicitly.** Ingesting a new session makes it
   appear on /brain with no manual re-index step. Concretely: after
   `scripts/sync-webinar-session.mjs <slug>` (or any ingestion path) completes, `GET /graph`
   contains that session's node and its `graph_edges`. Whether this is achieved by the graph
   reading `graph_edges` live, or by the sync refreshing `tree_index`, is the maker's design call —
   **but the 2026-09-24 session must be visible on /brain as the acceptance case**, since it is the
   one that proved the gap.
7. **[C7] Staleness is stated, never silent.** If any session exists in `sessions` but is absent
   from the graph, /brain says so with a count, rather than rendering a graph that looks complete.
   This is the `claims-degradation-honesty` pattern applied to the graph.
8. **[C8] Empty and degraded states are honest.** A tenant with no tree index gets an explanatory
   empty state, not a 404 that the UI silently swallows.

## Invariants

- **[I1] Tenancy is never widened.** Every new read path goes through the tenant-scoped accessor.
  The cross-tenant probe set proven clean on 2026-09-24 (probe tenant gets `{"sessions":[]}`, 404
  on session detail, 0 search hits, with `toc` positive controls returning real data) **must still
  pass unchanged** after this unit. A graph route that leaks another tenant's node labels is the
  ISS-078 class and is an automatic FAIL.
- **[I2] No fabricated relationships.** The graph renders only edges that exist in the data. A
  derived or co-occurrence edge must set `inferred: true`. Inventing edges to make the picture
  denser is a FAIL, not a polish choice.
- **[I3] A prettier graph that is still unreadable is not a PASS.** C2 and C3 are the substance;
  styling without labels or drill-down does not satisfy them.
- **[I4] Performance is bounded.** The 164-node graph must remain interactive; a design that only
  works at small N must state its ceiling and degrade explicitly past it.

## Verification (the checker re-runs these, in a VISIBLE browser)

- DOM probe on /brain: node count, `svg text` count, and that they match (C2).
- Click-path probe: topic -> neighbour -> session -> turn, asserting the final URL resolves to a
  real turn (C3).
- `GET /graph` contains `2026-09-24-zoho-next-european-study-destinations` and its edges (C6).
- The cross-tenant probe set re-run with a probe-tenant key and `toc` positive controls (I1).
- Screenshots of the graph, a drill-down panel, and a filtered view, in the unit's evidence dir.

**Links:** ISS-292 (this contract's issue) · `qa/evidence/webinar-bot-live-2026-09-24/` (c06 brain screenshot,
c08 edge shape) · `apps/web/src/pages/BrainPage.tsx` (224 LOC) ·
`packages/index/src/tree/flatten-graph.ts` (99 LOC) · `apps/api/src/routes/graph.ts`
