# Verdict (single checker, Mode A) — wa-events-cursor

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
Base: d0416a8e  Head: 78f92092 (code head 513fc6fe)  Tier: L, ONE checker (concurrency/timing: ordering under two writers).
Date: 2026-10-30  Bound root: D:/KnowledgeBase/.worktrees/wa-events-cursor  Contract: none specific; ISS-WAEF-001; spec R-40 (`spec.md:275-277`).

## Check plan (step 0)
Instruments: (1) `git archive` copy of HEAD on D:/kb-scratch/wec, node_modules rebuilt as per-package real dirs whose `@lkb/*` junctions point at the COPY's packages (a plain junction to the main tree would have run the base `@lkb/db`); (2) re-run the affected test files; (3) a real throwaway mongod 7.0.24 (own port 27999, own dbpath, PID 33640 verified, stopped and port-free verified) for the real-Mongo paging test; (4) one named falsification per criterion, all mine; (5) a two-process load probe for the residual window; (6) generator edge probes. The manifest has criteria C1-C3 (there is no C4).
Dual-check judgement: single is right. The diff (7 files) does not touch `events-router.ts`, `requireScope`, `scopedCollection`, schema, indexes or any writer's authorisation; the tenant pin and the cursor lookup both still come from the scoped accessor. No auth, tenancy or production-write change, so no concrete dual trigger. The only L trigger is ordering under concurrent writers, which one checker covers.

## Results
- Re-run (copy of HEAD): `packages/db whatsapp-links.test.ts` 11/11 with the real-Mongo test RUN (10 pass + 1 skipped without the URL; 11 pass, 0 skipped with it); `apps/api` `events.test.ts` 10, `links/events-router.test.ts` 9, `whatsapp/isolation-read-side.test.ts` pass; `scripts/whatsapp/sync-links.test.mjs` 28/28; `tsc --noEmit` on packages/db exit 0. No red appeared, so no base comparison was needed.
- C1 MET. Ordering and paging are by `_id` only (`whatsapp-links.ts:105,107`). The ISS-WAEF-001 reproduction (the issue row records one case) is delivered on the fake Db and on real Mongo, in both page orders. Generator: 4B epoch seconds + 2B ms + 3B per-generator random + 3B counter, 24 lowercase hex, `ObjectId.isValid` true, matches schema `^[0-9a-f]{24}$`; monotonic per generator, including under a backwards clock (clamp). Caller-supplied `_id` still works (`event._id ??` is only the default); no production caller supplies one (every `events().insert` site read: link service, review compose, selection router, owner-config audit read, sync-links).
- C2 MET. The cursor row is looked up through the tenant-scoped accessor; another tenant's id and an absent id both throw `unknown cursor` (router maps to 400 `unknown_cursor`); the `linkId` filter survives beside the cursor key; interleaved tenant rows never cross a page. Router, scope guard and error mapping are untouched by the diff.
- C3 MET WITH NOTES. The Delivery guarantee section is accurate to the code (order by id, `at` writer-stamped and not monotonic, residual in-flight/clock window named, "not exactly-once", dedupe on `id` plus a settle rule). I measured the window (below); the doc is honest, but see P1 and P3 for what it under-weights.
- Other judged points (the diff does not alter them; confirmed from the 7 changed files and the unchanged sinks): (2) no payload or projection change, the `toEventView` allowlist is untouched, error bodies are fixed text; (4) `newWhatsAppEventId()` runs inside `insert`, which every sink call wraps in `emitBestEffort`'s try/catch, so an id-generation throw or a duplicate `_id` is swallowed and logged by code and never breaks the transition; (5) no webhook, registry, outbound call or import added (the new import is `node:crypto` only). (3) Builder open point 1: `ingest.ts:82` emits ONE `candidate.created` per ingest run with `data.count = created` (only when `created > 0`). Whether C1 "exactly once per transition" or R-38 means one per candidate is a product reading; REPORTED, not decided (same as P5/Q1 of the wa-events-feed verdict).

## Falsification (mine; per-mutation copies on D:, byte backup, real `timeout`, no EXIT trap; `cmp` equal and `git hash-object` equal to `git rev-parse HEAD:<file>` after each)
| Crit | Mutant | Result |
|---|---|---|
| C1 | generator: millisecond field written as 0 | KILLED (id-layout test red) |
| C1 | generator: clock clamp removed (`last = trunc(clock())`) | KILLED (id-layout test red) |
| C1 | `filter._id = { $gt }` -> `{ $gte }` (cursor event re-delivered) | KILLED (4 red incl. real Mongo) |
| C1 | `_id` filter -> the old `at` `$or` (revert-to-base filter) | KILLED (4 red incl. real Mongo, ISS reproduction red) |
| C2 | cursor lookup via raw `db.collection("whatsapp_events")` (unscoped cursor, cross-tenant existence oracle) | KILLED (C2 + real Mongo red) |
| C3 | doc "Not exactly-once, and not a strict global order." -> "Exactly-once, and a strict global order." | KILLED (C3 test red) |
| C3 | doc `at` bullet turned into "commit timestamp ... monotonic" | KILLED (C3 test red) |
| C3 | doc sentence -> "Not exactly-once, but it never loses an event and a naive cursor is always safe." | SURVIVED (10 pass): see P4 |
Restored and HEAD-fidelity OK for all eight.

## Residual-window measurement (real Mongo, two OS processes, each up to 8 inserts in flight, `at` deliberately skewed per writer, 8000 events)
- Naive cursor consumer (`after` = last id read, no settle): 234 and 298 events never delivered (2.9% and 3.7%), two runs.
- Settled consumer per the doc's rule (resume point only from ids at least 300 ms old, dedupe on id): 0 missed of 8000.
The doc's residual window is real, not hypothetical, and its consumer rule closes it in this probe. At admin-event volumes the naive miss rate is far lower, but it is not zero.

## Generator probes
- Valid ObjectId, 24 lowercase hex: yes. Backwards clock: ids of one generator do not go back (clamp).
- Counter wrap: with the counter at `0xfffffe` and a constant millisecond the sequence `...fffffe, ...ffffff, ...000000, ...000001` is NOT sorted (P2). Needs about 16.7M ids from one process to land on the wrap inside one millisecond.
- Forward clock jump of 1 h then back: the process keeps issuing ids 3600 s ahead of real time (the clamp; manifest open point 6).
- A non-finite clock (injectable only; `Date.now` never returns one) poisons `last`; test-only, not filed.

## Hunt notes
- Cross-tenant read: no path. Cursor lookup and list are both scoped; `after` is validated as 24 hex before it reaches the accessor, so no operator injection; the `$gt` operand is the found row's own `_id`.
- The event id's counter is process-wide, so consecutive ids of one tenant expose how many events other tenants' writers made in between. Identical to a stock ObjectId counter (parity, not a regression); noted only.
- Rolling deploy: an old-code writer still emitting stock ObjectId ids in the same second as new ids orders arbitrarily against them (manifest open point 3, named; seconds-wide, transient).
- `list` with a `linkId` filter plus `_id` sort uses the `{tenantId, linkId, at}` index and an in-memory sort; fine at current volume (manifest open point 4).

PROPOSED-ISSUE: {"id":"P1","sev":"low","class":"doc-honesty","title":"events.md still headlines the read contract as 'At-least-once' and treats the settle rule as optional advice; a plain `after=<last id>` consumer measured 2.9-3.7% loss with two writers under load","fix_direction":"state in the contract bullet that at-least-once holds only for a consumer that follows the settle rule and that a naive last-id cursor is not safe against concurrent writers; consider a reference consumer snippet","evidence":"two-process real-Mongo probe: naive 234/8000 and 298/8000 missed, settled 0/8000","files":"docs/whatsapp/events.md:25-31,50-56"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","class":"correctness-edge","title":"createEventIdGenerator is not strictly increasing across its 24-bit counter wrap inside one millisecond (or one clamped millisecond); the code comment and the doc say strictly increasing","fix_direction":"carry the counter overflow into the millisecond field (bump `last` by 1 on wrap), or soften the claim; add a test with a stubbed random whose counter starts at 0xfffffe","evidence":"probe: ids ...fffffe, ...ffffff, ...000000, ...000001 for a constant clock; sorted order differs from generation order","files":"packages/db/src/collections/whatsapp-links.ts:30-38, docs/whatsapp/events.md:36-40"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","class":"doc-honesty","title":"The doc names only a writer whose clock is BEHIND; the clamp makes a forward clock step persistent: a process stepped 1 h ahead keeps issuing ids 1 h ahead, so a consumer that read one of them passes over every other writer's events for the whole skew, far beyond the 60 s settle period","fix_direction":"document the forward-skew case beside the behind-clock case and say the settle rule does not cover skew larger than the settle period; optionally cap the clamp (refuse ids more than N s ahead of Date.now and fail the best-effort event write instead)","evidence":"probe: clock +3600000 ms then back; the third id is 3600 s ahead of the first","files":"packages/db/src/collections/whatsapp-links.ts:30-38, docs/whatsapp/events.md:44-48"}
PROPOSED-ISSUE: {"id":"P4","sev":"low","class":"test-strength","title":"The C3 doc test is a phrase grep: a doc edit that keeps the needles and adds an over-claim outside the deny-list ('never loses an event', 'a naive cursor is always safe') passes; and the 'second writer' tests share one process-wide id generator, so cross-process ordering is asserted only by the id-layout test","fix_direction":"widen the over-claim deny-list (never loses, always safe, no events are missed) and add a test using two createEventIdGenerator instances for the two-writer scenario against the fake Db","evidence":"survivor F (10 pass); the fake-Db two-writer test builds both writers from one store module","files":"apps/api/src/whatsapp/events.test.ts:168-176, packages/db/src/collections/whatsapp-links.test.ts"}

VERDICT: PASS
SCOREBOARD: 3/3 criteria met (C1-C3; the manifest has no C4), 0/0 invariants
TIER: L (one checker; concurrency/timing ordering under two writers; auth surface unchanged, so no dual)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api and accessor, no screen)
LIVE-BROWSER: not-applicable (no UI surface)
ISSUES-WRITTEN: none (PROPOSED-ISSUE P1-P4 above, no ledger rows)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: The feed now pages and orders by event id, so a late-committing event with an earlier `at` is delivered from a prior cursor (the ISS-WAEF-001 reproduction is green on the fake Db and on real Mongo; seven of eight of my mutants were killed and the survivor is a doc-test weakness). Tenant scoping, unknown_cursor, the payload allowlist, best-effort writes and the no-outbound rule are untouched and still hold. The residual in-flight window is real (a naive consumer lost about 3% under two loaded writers, a settled consumer lost none) and the doc names it honestly, with small under-statements filed as P1-P3 (low). Builder open point 1 (candidate.created per ingest vs per candidate) is reported, not decided.
Metrics: start=2026-10-30T17:20:00Z end=2026-10-30T18:25:00Z wall_min=65 agent_min=unavailable blocked_min=0 suite_runs=7 repeat_runs=2 mutations=8 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=3900 mutants=8 defects_unit=0 defects_6c=0
