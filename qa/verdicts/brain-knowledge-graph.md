# Verdict — brain-knowledge-graph (U-BRAIN)

**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** orchestrating checker (main session), Mode A + Mode D (live visible browser), bound to `D:/KnowledgeBase`.
**Commit under check:** `da39a94`, main tree, web `:5176` → API `:3301`.
**Contract:** `qa/contracts/brain-knowledge-graph.md` (proposed, checker-authored 2026-09-24).
**Issue:** ISS-292 (high). **Independence:** I did not build this unit; I authored its contract and its probe plan *before* the build landed (`qa/evidence/ui-epic-2026-09-24/checker-probes.md`).

VERDICT: PASS
SCOREBOARD: 7/8 criteria met, 1 not exercisable; 4/4 invariants hold
ISSUES-WRITTEN: none
LIVE-BROWSER: RUN — headed Chrome, `:5176`, with a pre-unit negative control on `:3300`

## The C6 probe was amended before the build landed, and the amendment is what made this checkable

The original C6 probe ("`GET /graph` contains the 2026-09-24 session") had been **contaminated** by another lane's indexing, which put that session into `tree_index` independently of this unit. I rewrote it to discriminate on SOURCE before seeing the build. That rewrite is vindicated by the measurement below: **the original probe returns TRUE on both the pre-unit and post-unit builds** and proves nothing; the amended one separates them cleanly.

**Negative control:** `:3300` is a stale API predating the build, reading the SAME database.

| probe | pre-unit `:3300` | post-unit `:3301` |
|---|---|---|
| node kinds `flatten-graph.ts` cannot emit | **none → FAILS** | `date 1, month 1, user 1, person 3, country 8` |
| `graph_edges` edge vocabulary | **none (all types `null`) → FAILS** | `held_on 1, spoke_in 3, partner_of 4, covers 22, discussed 52` |
| edges carrying `evidence[].turnId` | **0 → FAILS** | **83** |
| nodes / edges | 172 / 548 | **207 / 642** |
| labelled nodes | 172/172 | **207/207** |
| *(original, contaminated probe)* session present | **true** | true ← proves nothing |

## Criteria

- **[C1] Union source — MET.** `/graph` now merges `tree_index` and `graph_edges`; the status line in the UI states the split itself: *"94 from graph_edges, 548 from tree_index"*. The false scope disclosure at `routes/graph.ts` (which claimed the collection held ZERO real rows) is corrected. Field is `type`, not `kind`.
- **[C2] Labels rendered — MET.** Baseline was **13 node shapes / 0 `svg text`**. Now **207 `svg text`, 207 non-empty, equal to the node count**. The maker also strengthened its own label probe after finding it passed against an *empty* `<text>` — the right instinct, and it is the reason this number means something.
- **[C3] Drill-down, two levels, never terminal — MET, traced end to end.** Focused `person:devanshi`, activated by **keyboard**, URL became `?node=person:devanshi`; the panel grouped neighbours by edge type (`SPOKE IN (1)`, `DISCUSSED (18)`), each neighbour clickable; the evidence link `/sessions/2026-09-24-…#turn-…-t002` resolves to a real anchor (80 on the page), is **highlighted** on arrival, and the turn's speaker **is Devanshi** — semantically the right turn, not merely a resolving href.
- **[C4] Evidence and confidence shown — MET.** 177 solid / 465 dashed, and the dashing tracks `inferred` exactly, which tracks `confidence < 1`. The panel states it in words: *"session · derived · confidence 0.80"*, *"country · derived · confidence 0.70"*.
  **Correction to my own contract, recorded because the fault was mine:** C4's text asserts that `covers`/`discussed` "must not be presented as equal to `held_on`/`spoke_in` (confidence 1)". I checked, and **`spoke_in` is confidence 0.8/0.95, not 1**. My contract stated a fact about the data that is false. Dashing `spoke_in` is CORRECT under the implementation's own stated rule, and I am not failing a unit for disagreeing with an error I wrote.
- **[C5] Filter and focus — MET.** `?kinds=person,country` → *"showing **11 of 207** node(s) · 17 of 642 relationship(s)"*, rendering exactly `person 3 + country 8`. URL-reflected and reloadable.
- **[C6] Freshness — MET**, per the amended probe and its negative control above.
- **[C7] Staleness stated — IMPLEMENTED, NOT EXERCISABLE TODAY.** `build-graph` computes `sessionsMissing`, and the UI status line reports `showing N of M`. But all 27 sessions are currently in the graph, so the missing-count branch renders zero and **I could not make it fire**. I am recording this as unexercised rather than met: an unexercised branch is not a verified one, and saying otherwise is the vacuity this project keeps filing.
- **[C8] Honest empty/degraded states — MET, with a conflict the maker surfaced rather than buried.** [C8] asks that a 404 not be silently swallowed; [I1] pins a probe requiring `/graph` to 404 for a foreign tenant. The maker kept the 404 (with an explanatory `message`) and rendered it as an honest empty state, and flagged the tension instead of quietly narrowing either. **That is the correct resolution** — [I1] is a security invariant and outranks a presentation preference.

## Invariants

- **[I1] Tenancy — HOLDS.** The probe set re-run verbatim against the NEW graph code: probe tenant gets `404 no knowledge graph for this tenant yet` on `/graph`, `{"sessions":[]}`, `404` on session detail, `0 hits` on search — while every `toc` control returns real data. Both halves recorded; a pass with no failing control proves nothing.
- **[I2] No fabricated relationships — HOLDS.** Every rendered edge carries a real `type`; derived ones set `inferred: true`. No invented edges.
- **[I3] Not merely prettier — HOLDS.** C2 and C3 are the substance and both are met with measurements, not impressions.
- **[I4] Performance bounded — HOLDS.** 207 nodes render and stay interactive.

## Notes (EXPLANATION only, not backlog)

- The maker disclosed that `apps/api/src/store.ts` now sits at exactly the 300-line lint budget with zero headroom, and that `apps/api/src/` and `routes/` are both 30/30 on dirsize. Accurate, and a real constraint on the next unit touching that file. Disclosed, not hidden.
- The old `BrainPage` test mocked `react-force-graph-2d` away entirely — which is precisely why "0 labels" was invisible to every test for so long. Worth remembering as a class: a mock that removes the renderer removes the only thing that could have failed.

## Why PASS

Every criterion I could exercise is met, and the two that mattered most to the request — a readable graph and a real drill-down — are verified by measurement with a pre-unit control that FAILS the same probe. `ISSUES-WRITTEN: none` is a complete check here: the one thing I went in suspicious of (C4 dashing `spoke_in`) turned out to be an error in my own contract, not in the build.
