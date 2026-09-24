# Checker probe plan — U-BRAIN + U-CAL visible-browser verdicts

CHECKER-authored, before the maker handed back, so the acceptance bar is fixed in advance and
cannot be shaped to whatever the build happens to produce. This is the D-015 discipline applied to
a UI unit: the instrument is written by the party that did not build the thing.

## U-BRAIN (contract qa/contracts/brain-knowledge-graph.md)

| # | Criterion | Probe | Pass condition | Pre-build baseline (measured 2026-09-24) |
|---|---|---|---|---|
| 1 | C2 labels | DOM: count `svg circle,svg rect,svg g[class*=node]` vs `svg text,svg title` | labels > 0 AND labels == visible node count | shapes 13, labels **0** |
| 2 | C1 union | `GET /graph` body contains a node whose id/label derives from `graph_edges` (person/country/date kinds) | ≥1 node of a kind not in {session,topic,org} | 164 nodes/526 edges, kinds only session/topic/org |
| 3 | C6 freshness | see the AMENDED C6 probe below — the original is now contaminated | node present AND sourced from graph_edges | **absent at baseline; tree_index has since been changed by another lane** |
| 4 | C3 drill-down | click topic -> panel -> click a neighbour -> reach a session -> follow an `evidence[].turnId` link | final URL resolves to a real turn; every hop clickable | panel is one level, terminal |
| 5 | C4 confidence | inspect a `covers`/`discussed` edge (confidence 0.7-0.8) vs `held_on` (1.0) | visually distinguishable; confidence readable | n/a (edges not rendered at all) |
| 6 | C5 filters | apply kind filter + text search | rendered node count changes; URL carries filter state | no filter control exists |
| 7 | C7 staleness | sessions in `sessions` but absent from graph | a count is stated on screen, not silently omitted | silent |
| 8 | I1 tenancy | re-run the cross-tenant probe set (below) | unchanged: probe tenant refused, toc controls return data | clean pre-build |

## U-CAL (contract qa/contracts/calendar-grid-ui.md)

| # | Criterion | Probe | Pass condition |
|---|---|---|---|
| 1 | C1 views | switch month/week/day | each renders; URL reflects the view and survives reload |
| 2 | C2 grid + overlap | two events sharing an hour | both visible, side by side, neither occluded |
| 3 | C3 nav | prev/next/Today with a filter active | range moves; **filters survive** |
| 4 | C4 one timeline | past sessions + upcoming meetings | both on the grid, visually distinct, links work |
| 5 | C5 filters | each filter, then an impossible combination | counts change; URL carries state; explicit "no events match", never a blank grid |
| 6 | C6 detail | click an event | panel shows only fields the API returns — any invented field is a FAIL |
| 7 | C9 timezone | event whose data says 11:00-11:30 | renders in the 11:00 row. **Off-by-one or UTC shift = automatic FAIL** |
| 8 | C8 keyboard | tab to an event, open it | reachable and operable without a mouse |
| 9 | I4 budget | `node scripts/lint-loc.mjs` + full `pnpm lint:structure` | green (ISS-285 was filed for running a subset) |
| 10 | I5 no regression | list view | still reachable until the grid passes |


## AMENDED C6 PROBE — 2026-09-24, after the original was contaminated

**Why this changed.** The original [C6] probe was: *"`GET /graph` contains
`2026-09-24-zoho-next-european-study-destinations`"*. Between writing that probe and running it, the
peer session's `webinar-bot-live` cycle-2 build ran its indexing against the SAME shared `lkb`
database (the worktree isolates code, not data), so `tree_index` for tenant `toc` **now mentions
that session already**. Measured from the main tree: topics 15→158, orgs 6→8, chunks 1452→1517,
`tree_index` mentions the session = true.

**The probe as written would therefore pass on another unit's work.** `/graph` builds from
`tree_index`; the session is now in `tree_index`; so U-BRAIN could satisfy its freshness criterion
without ever building the `graph_edges` union that [C1] requires. That is a test passing for a
reason unrelated to what it claims to prove — the exact vacuity class this repo has filed three
times (ISS-179), and it would have flattered the unit I am judging.

**Amended probe — it must discriminate on SOURCE, not presence:**

1. `GET /graph` must return at least one node whose `kind` is one that `flatten-graph.ts` cannot
   emit. That file produces `session | topic | org` only (`flatten-graph.ts:28`). A node of kind
   `person`, `country` or `date` can therefore have come **only** from `graph_edges`.
2. At least one returned edge must carry a `type` from the `graph_edges` vocabulary —
   `spoke_in`, `covers`, `discussed`, `held_on` — none of which exist in `flatten-graph.ts`'s
   `session-topic | session-org | topic-cooccurrence` set.
3. At least one edge must expose `evidence[].turnId` resolving to a real turn, which `tree_index`
   carries no equivalent of.
4. Only then does the session's presence count toward [C6].

**Negative control, required:** run the same probe against the PRE-UNIT build. It must FAIL on
rows 1-3 — if it passes before the unit exists, the probe proves nothing and must be rewritten
again.

**Standing note for both remaining UI units:** any "before" figure quoted from the shared database
after 2026-09-24 ~23:40 is post-indexing, not a true baseline. Baselines recorded earlier in this
file (13 node shapes / 0 labels; /graph 164 nodes, 526 edges, kinds session|topic|org only) were
measured BEFORE that write and remain valid as the pre-state for [C1] and [C2].

## Cross-tenant probe set (re-run verbatim for both units; I1)

Probe key = tenant `zz-checker-probe`, control key = tenant `toc`. Every row needs BOTH, or the
result is vacuous rather than clean.

| route | probe tenant must | toc control must |
|---|---|---|
| `/sessions` | `{"sessions":[]}` | return real rows |
| `/sessions/<sid>` | 404 | 200 |
| `/search?q=Hungary` | 0 hits | 20 hits |
| `/ask` | 404 no tree index | 200 real answer |
| `/graph` | 404 / empty | 200 with nodes |

Override vectors that must ALL stay refused: `?tenantId=toc`, `?tenant=toc`, body `{tenantId:"toc"}`
on POST /ask and POST /search, and headers `X-Tenant-Id` / `X-Tenant-ID` / `x-tenant` — the header
cases proven **server-side with curl**, because the browser's CORS refusal is not a tenancy control
and must never be reported as one.

## Instrument warning, recorded from this session's own mistake

Do not match leak markers against text the API **echoes back**. The first run of the tenancy probe
flagged `/search` because the detector matched `"Hungary"` inside `{"query":"Hungary","hits":[]}` —
the echoed query, with zero hits. Match tenant-unique CONTENT markers (`Devanshi`, `next-european`,
`Anjum`), never the query string.
