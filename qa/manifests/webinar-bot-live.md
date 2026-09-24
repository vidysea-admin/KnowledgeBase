# Manifest — webinar-bot-live

**Contract:** qa/contracts/meeting-bot-capture.md (C1/C2 extended, C3 superseded for the browser joiner). Draft successor `qa/contracts/meeting-bot-live-capture.md` (T-024b) exists, checker-authored, not yet adopted (the maker never edits qa/contracts/).
**Goal task:** U4.2 (one real meeting-bot joiner) · T-024b · D-027 · D-028
**Date:** 2026-09-24
**Fix cycle:** 2
(of max 3)
**Dual check:** no
**Issues addressed (cycle 2):** ISS-294 (high, [C7] `pnpm -r test` red), ISS-296 (high, [B] session never indexed), ISS-297 (medium, [C] /meeting-bot page false), ISS-291 (high, data-write: sync-session delete-then-insert with no transaction). NOT this unit's: ISS-295 (graph_edges unreachable by any route — owned by the other session's U-BRAIN unit; `apps/api/src/routes/graph.ts` untouched here). The cycle-1 FAIL block's `ISSUES-WRITTEN: ISS-289..292` is the known cross-lane citation defect; the peer checker re-allocated them to ISS-294..297 (master 6afbdbb), and the original ISS-291 is its own row.
**Issues addressed (cycle 1):** ISS-285 (high, lint-dirsize regression), ISS-286 (high, missing Capability coverage table), ISS-287 (low, stale doc comment + undisclosed touched files). Live-run defects (unrelated to this cycle) remain tracked as T-029, T-030, T-032, T-047.
**Queue tier:** 3, a roadmap task (Umesh's fast-track: built and live-run first, checked after; recorded in D-027)
**Severity gate:** FULL ceremony. `scripts/webinar/sync-session.mjs` performs **data writes** to Mongo (lkb, tenant `toc`).
**Status:** checked-PASS — cycle 2 PASS by /checker (c21355e, own full `pnpm -r test` + mutation proof + live browser); merged to master 2026-09-25
**Commits (cycle 0):** `fd74864` (feature) · `cfaf464` (split record commands out of cli.ts for lint-loc) · **(cycle 1, this fix):** see bottom of this file, on branch `feat/webinar-bot`

**Commits (cycle 2):** on branch `wave/iss-291-sync-txn` (lane worktree `D:/KnowledgeBase-lanes/iss-291-sync-txn`, base master `ceb268c`); sha in the commit that carries this manifest.

## Fix cycle 2: findings answered (each quoted verbatim from the cycle-1 FAIL block)

> **[C7] sev: high**: "`pnpm -r test` fails: packages/index tree-real-data.test.ts ENOENTs on this unit's own new data dir, the only one of 27 missing session.json/session_page.json - fix direction: emit session.json + session_page.json for the bot-captured session (same artifacts Finding B needs), then re-run `pnpm -r test` — not just the meeting-bot filter" → **ISS-294**

**Fix.** `sync-session.mjs --emit-files` writes `session.json`, `session_page.json` and `claims.json` into `data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/`. `buildSessionFiles` (`scripts/webinar/session-rows.mjs`) builds them from three inputs:
- `meta.json`: title, date, people, roles, orgs, partnerOf;
- `source.json`: `_id`;
- `turns.json`: the evidence turn ids, one per speaking person (that person's first turn).

The fields match the TOC dirs. `session.json` has `_id, tenantId, sourceId, title, date, org, status`. `session_page.json` has `_id, tenantId, sessionId, summary, keyInsights, evidence[]`. `claims.json` is `[]`, because nobody hand-wrote claims for this session. `seed-toc.mjs` also reads `claims.json` unconditionally. Nothing in these files goes beyond what those three inputs state.

Once the files existed, `packages/index/src/tree/tree-real-data.test.ts` failed on its hard-coded count (`actual: 24, expected: 23`), because the directory now legitimately holds 24 sessions. The count is now derived from the directory listing, with 23 as a floor: `dirCount >= 23`, and session leaves `=== dirCount`. The test name and its other two assertions were touched again in the cycle-2 amendment below (a peer-checker finding on this same edit, still cycle 2 — no verdict for cycle 2 existed yet when it was raised).

**Known limitation, disclosed not fixed:** the `dirCount >= 23` floor only guards against *mass*
deletion — it detects zero dirs, or fewer than 23, but a regression that dropped some sessions
while staying at or above 23 (e.g. 28 real dirs quietly becoming 23) would pass this floor
silently. The floor is a sanity check on catastrophic loss, not a count-accuracy assertion; no
exact expected count exists because the directory legitimately grows over time (ISS-294 is itself
an instance of that growth). Not fixed this cycle — tracked as the same debt class as T-033.

### Cycle-2 amendment: `sessions.length`/`pages.length` assertions were vacuous by construction

A peer checker's finding on this same file, raised before any cycle-2 verdict existed (so this is
still fix cycle 2, not cycle 3): `assert.equal(sessions.length, dirCount, ...)` and
`assert.equal(pages.length, dirCount, ...)` could never fail on their own. `loadRealData()`
(`tree-real-data.test.ts:26-42` pre-amendment) iterated the same `readdirSync` with the same
`isDirectory` predicate the test uses for `dirCount`, and did an **unguarded** `readFileSync` per
dir — so `sessions.length`/`pages.length` always equaled `dirCount` whenever `loadRealData()`
returned at all, and a directory missing either file made it throw `ENOENT` *before* either
assertion ran, crashing the whole test with an unhandled exception rather than a named,
directory-identifying assertion failure.

**Fix.** `loadRealData()` now wraps the per-dir reads in `try/catch`, collects failures into a
`missing: string[]` (`"<dirName>: <err.code ?? err.message>"`) instead of letting them throw, and
returns `{ sessions, pages, missing }`. The two vacuous length assertions are replaced with
`assert.deepEqual(missing, [], ...)`, which names every directory missing either file in the
failure message. `allSessionLevelNodes.length === dirCount` and the `dirCount >= 23` floor are
unchanged. `loadRealData` has exactly one caller (grepped: only this test file), so no other
call site needed updating. The test's title was stale (still said "23 session leaves" after the
directory-derived-count change earlier in this same cycle); renamed to "real data: every migrated
session dir has session.json + session_page.json, cross-session topic, schema-valid shape".

**Proof (D-020: byte backup + trap on EXIT/INT/TERM/ERR + `timeout` + `cmp`; a throwaway copy of
the whole monorepo was impractical — pnpm workspace deps/node_modules make an isolated copy far
more expensive than an in-place byte-backup on one tracked, clean-status data file; instead the
mechanics were followed exactly in-place, matching row 13's `session-rows.test.mjs` precedent).**
Session dir `2026-05-08-funding-dreams-loans-forex` had a clean git status. `session.json` was
copied to a scratch backup, then deleted, with a `trap` set to restore it on `EXIT INT TERM ERR`
before the mutation:

FIXED code, mutant applied — the named assertion fails, naming the directory:
```
ℹ pass 214
ℹ fail 1
✖ failing tests:
  AssertionError [ERR_ASSERTION]: every migrated session dir must have session.json + session_page.json; missing: 2026-05-08-funding-dreams-loans-forex: ENOENT
```
Restored, `cmp` confirmed byte-identical, re-run green: `215/215`.

Then, to prove the OLD vacuous assertions would NOT have been the thing that failed: the fix was
stashed (`git stash push -- packages/index/src/tree/tree-real-data.test.ts`) to restore the
pre-amendment code, the same file was deleted again under the same backup+trap+cmp discipline, and
the pre-fix code was run:
```
ℹ pass 214
ℹ fail 1
✖ failing tests:
  Error: ENOENT: no such file or directory, open '...\2026-05-08-funding-dreams-loans-forex\session.json'
    code: 'ENOENT'
```
This is an **unhandled exception from `readFileSync` inside `loadRealData()`**, thrown before
`sessions.length`/`pages.length` are ever compared — confirming those two assertions could never
have been the line that failed; the test crashes on the read, not on the count check. Restored
(`cmp` byte-identical), then `git stash pop` reapplied the fix, and the full suite was re-run green
(`215/215`) before continuing.

> **[B] sev: high**: "the session is written but never indexed — chunks 0, session_pages 0, claims 0, tree_index does not mention it — so /ask cannot answer from it while /search finds 20 turns - fix direction: have the sync (or a documented follow-up step) refresh tree_index/chunks/session_pages, or flip status.index to a tracked task the manifest names" → **ISS-296**

**The existing indexing path.** Every live-ingested session is indexed by `indexSession` (`apps/api/src/indexing/session.ts:151`). That covers URL ingest (`apps/api/src/ingest-store.ts:68-70`) and WhatsApp (`whatsapp-store.ts:166-168`). `production.ts` binds it once. It runs these steps:
- LLM summary → `session_pages`;
- evidence-checked claims → `claims`;
- `writeSessionChunks` → `chunks` + vectors;
- `recordVectorGap`;
- an incremental `regenerate()` of `tree_index`;
- `promoteAndPersistEntities`;
- `status.index → "done"`.

The 23 TOC sessions came in differently. Their `session_pages` and `claims` came from pre-written JSON via `seed-toc.mjs`, and their chunks from `backfill.mjs chunks`, which calls the same `writeSessionChunks`. `indexSession` is the one path that covers all four missing stores.

**Reused, not reimplemented.** `production.ts` had an inline `boundIndexer` closure. It is now an exported `buildIndexer(routing = buildRouting())`, and `buildProductionDeps` calls `buildIndexer(routing)` with its same routing object, so the server's binding is unchanged. `sync-session.mjs --index` runs `buildIndexer()(tenantId, sessionId)` after the sync. The only writes are `indexSession`'s own: its `scopedCollection` accessors and its existing `tree_index` `replaceOne(treeIndexRootFilter(tenantId))`. No graph route was touched. A re-sync no longer resets `status.index` from `done` back to `pending` (`sync-session.mjs:198-200`).

> **[C] sev: medium**: "/meeting-bot page still says "Not live yet" and "every joiner is a tested-against-fakes stub", and omits zoho/cloudonair - fix direction: update MeetingBotPage.tsx:6,13,31-32 to describe the real browser joiner and list the two new platforms" → **ISS-297**

**Fix.** Changes to `apps/web/src/pages/MeetingBotPage.tsx`:
- The header now reads "One real joiner is live (a local browser on Windows, recorded with OBS)".
- Platform detection now lists "Meet / Teams / Zoom / Webex / Zoho (webinar & meeting) / Google Cloud OnAir".
- A new card: "Live since 2026-09-24 · Browser joiner + OBS capture".
- A "Known gaps" note:
  - no auto-reconnect yet (T-029);
  - the first run lost about 5–8 minutes, so **its capture is not complete**;
  - the window video is sometimes black;
  - it runs on one Windows machine;
  - the Vexa and system-audio joiners are still tested-against-fakes stubs.

`MeetingBotPage.test.tsx`:
- The first test asserted the sentence that is now false. It is rewritten to assert that the stale text is absent and that the live joiner and each gap are present.
- New test: the Zoho / Cloud OnAir listing.
- The four-building-blocks test is unchanged.

> **ISS-291 (high, data-write)**: "scripts/webinar/sync-session.mjs deletes a session's turns and graph_edges then re-inserts them one-by-one with no transaction and no rollback on partial failure"

**Transaction support checked.** `hello` against `MONGODB_URL` returned `{"setName":null,"msg":null,"isWritablePrimary":true,"maxWireVersion":21,...}`. That is a **standalone** server with no replica set, so `withTransaction` is unavailable.

**Fix: a safe swap.** `replaceSessionRows` in `scripts/webinar/session-rows.mjs` runs two steps:
1. Upsert every new row by its deterministic `_id` through `coll(tenantId).updateOne(..., {upsert:true})`, stamped `syncGen: gen-<ms>`.
2. **Only after every upsert has succeeded**, run `coll(tenantId).deleteMany({ ...scope, syncGen: { $ne: gen } })`. This removes old-generation rows, including rows the new set no longer has.

A throw in step 1 deletes nothing. Every row is either its old or its new version, and a re-run converges.

**Stated plainly: this swap is NOT atomic.** `coll(tenantId)` is a standalone Mongo connection
(`hello` above: `setName: null`), so there is no session/transaction wrapping the upsert loop and
the `deleteMany`. **The crash window is between "every upsert has succeeded" and "the stale-row
delete completes."** A process death inside that window leaves the OLD generation's rows (not yet
deleted) coexisting with the NEW generation's rows (already upserted) — i.e. for any row whose
deterministic id is unchanged between generations, the upsert simply overwrote it in place, so
there is nothing to duplicate; but for a row whose content maps to a **different** deterministic id
in the new generation than in the old (e.g. a turn's position/speaker changed enough to reindex its
`-tNNN` suffix, or an edge's participant set changed), the old-id row is still present and the
new-id row now also exists — that is the duplicate. What a crash in this window **never** produces
is a partially-deleted session: nothing is removed until every upsert of the new generation has
already landed, so the session is always at-least-fully-present, never half-gone.

**How a re-run heals it.** The next `sync-session.mjs` run for the same session re-upserts the
(now-current) new generation under a fresh `syncGen`, then deletes everything NOT carrying that
fresh gen — which now includes the previous run's orphaned old-generation rows as well as the
half-applied new-generation rows from the crashed run. So the duplicate window is closed by the
next successful run, not by this one; it is not self-healing mid-run, only healed across runs.

The ids are deterministic (`<sid>-tNNN`, `toc-edge:…`), so "insert the new generation, then delete the old" becomes "upsert, then delete stale". Giving the new generation separate ids would change every turn id that edges, pages and claims cite.

Tenant scoping is still applied by the accessor. The helper receives `coll(tenantId)`, never a raw handle.

## What changed (cycle 2)
- `scripts/webinar/session-rows.mjs` (**new**): `replaceSessionRows` (ISS-291) and `buildSessionFiles` (ISS-294). They are a separate module so they can be unit-tested; `sync-session.mjs` runs its whole job at import time.
- `scripts/webinar/session-rows.test.mjs` (**new**, wired into `package.json` `test:lint`): 3 tests.
  - a clean swap;
  - an **injected failing write** mid-run: a fake `coll` whose 2nd upsert throws;
  - the derived session files.
- `scripts/webinar/sync-session.mjs`:
  - turns and graph_edges now go through `replaceSessionRows`;
  - new `--emit-files` and `--index` flags;
  - a re-sync keeps `status.index` at `done`;
  - header doc updated.
- `apps/api/src/production.ts`: `buildIndexer` extracted and exported. Behaviour is unchanged; `buildProductionDeps` uses it.
- `packages/index/src/tree/tree-real-data.test.ts`: the session count comes from the directory listing, with 23 as the floor. **Cycle-2 amendment (same cycle, before any cycle-2 verdict):** `loadRealData()` no longer lets a missing `session.json`/`session_page.json` throw unhandled `ENOENT`; it collects `missing: string[]` and the test asserts `missing` is empty by name, replacing two assertions (`sessions.length === dirCount`, `pages.length === dirCount`) that were vacuous by construction. Test title renamed. See "Cycle-2 amendment" above and coverage row 20.
- `apps/web/src/pages/MeetingBotPage.tsx` and `.test.tsx`: ISS-297.
- `data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/{session,session_page,claims}.json` (**new**, generated by `--emit-files`).
- `package.json`: `test:lint` gains `scripts/webinar/session-rows.test.mjs`.
- Evidence:
  - `qa/evidence/webinar-bot-live-c2-2026-09-24/`: the full outputs of `pnpm -r test`, `pnpm -r typecheck` and `pnpm lint:structure`, ANSI stripped;
  - `qa/evidence/browser-webinar-bot-live-c2-2026-09-24/`: report.json, a screenshot and the smoke script.
- **Not touched:**
  - `apps/api/src/routes/graph.ts`, the `apps/web` Brain and Calendar pages, and `packages/index/src/tree/flatten-graph.ts` (the other session's files);
  - `qa/contracts/`;
  - `packages/db/src/lib/tenantScope.ts`.

## How to verify (cycle 2): contract criteria, then commands with REAL outputs

| Criterion | Command | Result |
|---|---|---|
| **meeting-bot-capture.md C7** ("no regression": `pnpm -r test` + `pnpm -r typecheck` green) | `pnpm -r test` · `pnpm -r typecheck` | GREEN, both exit 0 (below) |
| C7 structure gates | full `pnpm lint:structure`, plus each stage after lint-root run on its own | all green except the pre-existing lint-root failure (ISS-248) |
| C1/C2 (platform detection + join-strategy routing, incl. zoho/cloudonair) | inside `pnpm -r test` → `packages/meeting-bot 43/43` | GREEN |
| C3 | superseded for the browser joiner only (cycle-1 ruling); untouched this cycle | — |
| ISS-291 safe write | `node --test scripts/webinar/session-rows.test.mjs` + falsification | GREEN 3/3; the mutant goes red (Capability coverage row 13) |
| ISS-294 files | `pnpm --filter @lkb/index test` with and without the files | before: 214/215, ENOENT → after: 215/215 (row 14) |
| ISS-296 indexed | live `--index` run + read-only read-back | chunks 65, session_pages 1, claims 66, tree_index mentions the session |
| ISS-297 page | vitest + a browser smoke run | 3/3; report.json `pass: true` |
| Cycle-2 amendment (vacuous-assertion fix) | `pnpm --filter @lkb/index test` + mutation proof (row 20) | GREEN 215/215; mutation proof COVERED (row 20) |

### Re-run after the cycle-2 amendment

Re-run in full, after the amendment landed on top of the rest of cycle 2:

```
$ pnpm -r test        → exit 0. Two of three back-to-back runs were clean; a third run hit an
                         UNRELATED pre-existing flake: apps/web's AskPage.test.tsx "renders the
                         API error message rather than a generic failure" timed out at 5000ms
                         (vitest testTimeout) under this run's own measured load — its own
                         "Duration" line reported setup 44.68s / collect 414.02s for a suite that
                         normally completes in seconds, consistent with concurrent lane activity on
                         this shared machine, the same class already disclosed in cycle 1 for the
                         docs/PROGRESS.md flake. This unit touched neither AskPage.tsx nor its test
                         this cycle. The pasted result below is from a clean run.
packages/core test: ℹ tests 7 / ℹ pass 7 / ℹ fail 0
apps/web test:  Test Files  13 passed (13)
apps/web test:       Tests  56 passed (56)
packages/db test: ℹ tests 14 / ℹ pass 14 / ℹ fail 0
packages/ai test: ℹ tests 74 / ℹ pass 74 / ℹ fail 0
packages/index test: ℹ tests 215 / ℹ pass 215 / ℹ fail 0
packages/ask test: ℹ tests 50 / ℹ pass 50 / ℹ fail 0
packages/ingest test: ℹ tests 97 / ℹ pass 97 / ℹ fail 0
packages/meeting-bot test: ℹ tests 43 / ℹ pass 43 / ℹ fail 0
apps/api test: ℹ tests 173 / ℹ pass 173 / ℹ fail 0

$ pnpm -r typecheck    → first attempt crashed OOM ("FATAL ERROR: ... JavaScript heap out of
                          memory") in packages/index and packages/ingest's tsc processes under the
                          same concurrent-load condition — not a type error, a memory crash, and not
                          caused by this unit's own (unchanged) types. Re-run clean: exit 0, all 10
                          projects report "Done" (apps/web, packages/core, packages/ai, packages/db,
                          packages/ask, packages/index, packages/ingest, packages/meeting-bot,
                          apps/api — 10 of 11 workspace projects, matching every prior cycle).

$ pnpm lint:structure   → same pre-existing lint-root FAIL (ISS-248, 16 loose root files against a
                          15 budget — the identical 16 filenames as cycle 2's first evidence pass,
                          unchanged by this amendment). Chain short-circuits there, so every later
                          stage was re-run individually, all OK:
lint-dupes: OK (320 unique export(s), 24 unique schema $id(s))
lint-migrations: OK (1102 file(s) scanned)          # was 1094 at the prior evidence pass — normal
                                                       drift from concurrent lanes, not this unit
snapshot.mjs --check: OK (117 lines, budget 200)
lint.test.mjs: ℹ tests 14 / ℹ pass 14 / ℹ fail 0
tracker-audit --gate g1,g4: OK (gate G1,G4)
depcruise: ✔ no dependency violations found (311 modules, 961 dependencies cruised)
```

**`pnpm -r test`**: the FULL run, not filtered. It exited 0. The complete 835-line output is in `qa/evidence/webinar-bot-live-c2-2026-09-24/pnpm-r-test.txt`. Every per-package summary line, verbatim:
```
Scope: 10 of 11 workspace projects
packages/core test: ℹ tests 7
packages/core test: ℹ pass 7
packages/core test: ℹ fail 0
apps/web test:  Test Files  13 passed (13)
apps/web test:       Tests  56 passed (56)
packages/db test: ℹ tests 14
packages/db test: ℹ pass 14
packages/db test: ℹ fail 0
packages/ai test: ℹ tests 74
packages/ai test: ℹ pass 74
packages/ai test: ℹ fail 0
packages/ask test: ℹ tests 50
packages/ask test: ℹ pass 50
packages/ask test: ℹ fail 0
packages/index test: ℹ tests 215
packages/index test: ℹ pass 215
packages/index test: ℹ fail 0
packages/ingest test: ℹ tests 97
packages/ingest test: ℹ pass 97
packages/ingest test: ℹ fail 0
packages/meeting-bot test: ℹ tests 43
packages/meeting-bot test: ℹ pass 43
packages/meeting-bot test: ℹ fail 0
apps/api test: ℹ tests 173
apps/api test: ℹ pass 173
apps/api test: ℹ fail 0
RC=0   (no ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL)
```

**`pnpm -r typecheck`**: exited 0, and all 10 projects report `Done` (`pnpm-r-typecheck.txt`).

**`pnpm lint:structure`**: the FULL composite. Its complete output, verbatim (also in `pnpm-lint-structure.txt`):
```
> living-knowledge-base@0.0.0 lint:structure D:\KnowledgeBase-lanes\iss-291-sync-txn
> node scripts/lint-loc.mjs && node scripts/lint-dirsize.mjs && node scripts/lint-root.mjs && node scripts/lint-dupes.mjs && node scripts/lint-migrations.mjs && node scripts/snapshot.mjs --check && node --test scripts/lint.test.mjs && node scripts/tracker-audit.mjs --gate g1,g4 && depcruise --config .dependency-cruiser.cjs packages apps workers

lint-loc: OK (298 file(s) within budget)
lint-dirsize: OK (80 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
The lint-root failure is **pre-existing (ISS-248)**. `git ls-tree ceb268c | awk '$2=="blob"{print $4}' | wc -l` returns `16`: the same 16 names, at this cycle's base commit. This cycle adds no root file.

The chain stops at lint-root, so each later stage was run on its own:
```
$ node scripts/lint-dupes.mjs        → lint-dupes: OK (320 unique export(s), 24 unique schema $id(s))
$ node scripts/lint-migrations.mjs   → lint-migrations: OK (1094 file(s) scanned)
$ node scripts/snapshot.mjs --check  → OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)
$ node --test scripts/lint.test.mjs  → ℹ tests 14 / ℹ pass 14 / ℹ fail 0
$ node scripts/tracker-audit.mjs --gate g1,g4 → tracker-audit: OK (gate G1,G4)
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers → ✔ no dependency violations found (311 modules, 961 dependencies cruised)
```
lint-migrations scans fewer files here (1094) than in the main tree (~3436), because the lane has no `raw/` payload. There is no violation in either.

**Dry-run.** The new flags, run against an unroutable host (`MONGODB_URL=mongodb://192.0.2.1:27017`, `MONGODB_DB=SHOULD_NEVER_BE_TOUCHED`). It exited 0 in 2.3 s:
```
$ node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run --emit-files --index
session 2026-09-24-zoho-next-european-study-destinations (tenant toc)
  turns 80 · speakers 3 · orgs 6 · topics 15
  graph_edges 94: {"held_on":1,"in_month":1,"captured":1,"spoke_in":3,"represents":2,"located_in":8,"partner_of":4,"covers":22,"discussed":52}
  would write session.json
  would write session_page.json
  would write claims.json
  index plan: summarize + claims (LLM, routed per config/ai-routing.yaml) -> session_pages/claims; 65 chunk(s) to embed from 80 turns; tree_index regenerate([2026-09-24-zoho-next-european-study-destinations]); entity promotion; sessions.status.index -> done
No Mongo connection attempted (--dry-run).
```
The plain dry-run still prints turns 80 · speakers 3 · orgs 6 · topics 15 · graph_edges 94, the same breakdown as cycles 0 and 1.

**Live runs** (tenant toc, this one session only):
```
$ node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --emit-files --index
session 2026-09-24-zoho-next-european-study-destinations (tenant toc)
  turns 80 · speakers 3 · orgs 6 · topics 15
  graph_edges 94: {"held_on":1,"in_month":1,"captured":1,"spoke_in":3,"represents":2,"located_in":8,"partner_of":4,"covers":22,"discussed":52}
  wrote session.json
  wrote session_page.json
  wrote claims.json
written (gen-1790271063597): turns 80 upserted/0 stale removed, graph_edges 94 upserted/0 stale removed
indexed: chunks 65, entities {"topics":143,"orgs":2,"claimsTagged":66,"skipped":null}

$ node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations      # idempotent re-sync
written (gen-1790271151036): turns 80 upserted/0 stale removed, graph_edges 94 upserted/0 stale removed
```

**Read-only read-back after the re-sync.** My own probe, using only `countDocuments`, `distinct` and `findOne`:
```
{"setName":null,"msg":null,"isWritablePrimary":true,"maxWireVersion":21,"logicalSessionTimeoutMinutes":30}
turns 80
graph_edges 94
chunks 65
session_pages 1
claims 66
tree_index toc docs 1 mentions session: 1
sessions.status {"transcribe":"done","diarize":"done","summarize":"done","index":"done"}
turns with syncGen 80 distinct gens ["gen-1790271151036"]
edges distinct gens ["gen-1790271151036"]
session_page summary: This webinar highlights Hungary and Greece as emerging study destinations, moving beyond their traditional tourism image. Anjum from International Business School (IBS) in Hungary and Sagar from Hellenic American University (HAU) in Greece present their institutions, emphasizing affordability, Engli
cross-tenant rows {"turns":0,"edges":0,"chunks":0}
```
The same probe, run before any write this cycle, returned `turns 80 · graph_edges 94 · chunks 0 · session_pages 0 · claims 0 · tree_index mentions session: 0`, which matches the checker's numbers.

After the re-sync:
- all 80 turns and all 94 edges carry one generation, so no stale rows remain;
- `status.index` stayed `done`.

**Not verified by me:** a live `POST /ask` answer for this session. No API server ran in this lane; the checker's Mode D covers it.

**Where the data went.** `--index` sent this session's 80 turns to the routed `summarize`, `claims` and `embedding` chains, which try Gemini first per `config/ai-routing.yaml`. Gemini also transcribed this session. This is tenant-toc webinar content, not V3.3, Pathlynks or student data.

### Shared-data disclosure (orchestrator addendum, cycle 2)

1. **These writes are live and already happened, on the shared Mongo `lkb`, tenant `toc`.** The
   `--index` run and the sync above ran against the real shared database, before any cycle-2
   verdict exists. They do not roll back with the git branch — a rejected verdict on this manifest
   would not undo them; only a further, separate write would. The peer checker's read-back from the
   main tree (not this lane) measured the resulting state: **topics 15→158, orgs 6→8, chunks
   1452→1517** (as given to me — this lane's own earlier read-back reported chunks at 0→65 for
   *this session's own* chunk count, a different number from the collection-wide total the checker
   is reporting here), **`tree_index(toc)` now mentions the session.**
2. **The topics jump (+143) is a side effect of `indexSession` running on this one session, not a
   miscount.** Traced through the code: `promoteAndPersistEntities(tenantId, sessionId, rootDoc,
   db, ...)` (`apps/api/src/indexing/session.ts:262`) is called with `rootDoc` — the FULL tenant
   tree root, not a per-session slice. `regenerate()` (`packages/index/src/tree/regenerate.ts:81-84`)
   rebuilds only the touched year's subtree but returns it merged with every untouched year's
   subtree unchanged, so the object `promoteAndPersistEntities` receives still spans the WHOLE
   tenant's sessions. Inside, `promoteTreeEntities(root)` (`promote-entities.ts:62`) walks that
   whole tree and `updateOne(..., { upsert: true })`s every topic/org node it finds
   (`promote-entities.ts:64-77`) — there is no per-session filter on what gets promoted. This is
   **the first time `indexSession` has ever run for tenant `toc`**: this manifest's own cycle-2
   text above states the 23 TOC sessions were seeded via `seed-toc.mjs`/`backfill.mjs`, which never
   call `indexSession` or `promoteAndPersistEntities`. So this one session's index run was also the
   first-ever topic/org promotion sweep across the entire pre-existing 23-session corpus, not just
   this session's own ~15 topics (the dry-run's per-session breakdown) — that is consistent with a
   jump far larger than one session's own topic count. `orgs 6→8` fits the same mechanism at a
   smaller scale (most org names already existed; 2 were new). This is upsert-only, per the
   module's own header comment ("UPSERT, NEVER DELETE-THEN-INSERT"), so it is additive, not
   destructive — but it means "index one session" has a whole-tenant side effect on `topics`/`orgs`
   the first time it runs for a tenant, which is not obvious from the CLI's own output (it only
   prints this session's own topic count, 15, in both dry-run and live-run text above). Not fixed
   this cycle; disclosed.
3. **Known gap: recording-notice boilerplate became a claim.** `{"text":"This webinar is being
   recorded.","status":"needs-review"}` was extracted as a claim. Boilerplate is not filtered
   before claim extraction runs; `status: "needs-review"` (the same default every freshly
   extracted claim gets, per `session.ts:220-223`) limits the harm — nothing downstream treats it
   as verified — but it is still a real row occupying the claims collection for no informational
   value. Disclosed, not fixed here.
4. **No pre-state can be re-measured now.** The writes above already happened against the shared
   database; the "before" counts this manifest cites for the collection-wide totals came from the
   peer checker's own prior read, not a fresh baseline this session can reproduce, because running
   the read again would only return the current (post-write) state.

## Capability coverage (cycle 2 rows; rows 1–12 below stand unchanged)

Mutation runs follow D-020: a byte backup to scratch, a `trap` restore on EXIT/INT/TERM/ERR, `timeout` around the test command, and a `cmp` after the restore.

| # | Capability | Check | `observed` |
|---|---|---|---|
| 13 | ISS-291 safe swap: a failure mid-write deletes nothing; a success removes only this scope's stale rows | `node --test scripts/webinar/session-rows.test.mjs` | **COVERED.** Green before: 3/3. Mutant: put back the old order (`await scoped.deleteMany({ ...scope })` before the upsert loop). Red after, 1 pass / 2 fail: `✖ safe swap: an injected failing write mid-run deletes NOTHING` with `AssertionError: all 4 rows of the session must still exist after a failed run`, and `✖ safe swap: a successful run ...` with `actual: { upserted: 3, removedStale: 0 }` against `expected: { upserted: 3, removedStale: 1 }`. The derived-files test stayed green, so the mutant is isolated. `cmp` printed `restored byte-identical`; re-run green, 3/3. |
| 14 | ISS-294: the webinar dir carries session.json + session_page.json, so packages/index's real-data tree test passes | `pnpm --filter @lkb/index test` | **COVERED.** With the two files removed (the cycle-1 state): `ℹ tests 215 / ℹ pass 214 / ℹ fail 1`, `Error: ENOENT: no such file or directory, open '...\2026-09-24-zoho-next-european-study-destinations\session.json'`. After the restore (`cmp` OK): 215/215. |
| 15 | ISS-294: the emitted files are derived (evidence turn ids are real turns) and the committed file equals the generator's output | `session-rows.test.mjs`, test 3 | **COVERED by assertion.** The evidence ids are a subset of turns.json ids, and the committed `session_page.json` evidence deep-equals the `buildSessionFiles` output. No separate mutant run. |
| 16 | ISS-297: the page states the live joiner and its gaps and lists zoho/cloudonair; the stale "Not live yet" is gone | `pnpm --filter @lkb/web exec vitest run src/pages/MeetingBotPage.test.tsx` | **COVERED.** With HEAD's page text put back into the file: `× honestly discloses the one live joiner and its known gaps`, `× lists the Zoho and Cloud OnAir platforms the detector now recognises`, `Tests 2 failed / 1 passed (3)`. After the restore (`cmp` OK): `Tests 3 passed (3)`. |
| 17 | ISS-296: `--index` indexes through the production `indexSession` binding | the live run + read-back above | `UNVERIFIED by automated test.` Verified once, live: chunks 0→65, session_pages 0→1, claims 0→66, tree_index mentions 0→1, status.index → done. `indexSession` has its own pre-existing suite (`apps/api/src/indexing/session.test.ts`, green inside `apps/api` 173/173). The script-level wiring has no unit test; the debt is tracked as **T-033**. |
| 18 | The `buildIndexer` extraction leaves the server's ingest binding unchanged | `pnpm -r typecheck` + `apps/api` 173/173 | `UNVERIFIED by falsification.` It type-checks and the api suite is green, but `production.ts` is "never imported by tests" (its own header), so no test pins it. Debt: **T-033**. |
| 19 | `--dry-run` (including with `--index` and `--emit-files`) makes no Mongo connection and writes no file | the dry-run above, against an unroutable host | Observed live: the same counts, "would write", exit 0 in 2.3 s against TEST-NET-1. The data files appeared only after the live run. This is one observation, not a repeatable test. Debt: **T-033**. |
| 20 | Cycle-2 amendment: a session dir missing `session.json`/`session_page.json` fails with a named, directory-identifying assertion, not an unhandled ENOENT crash | `pnpm --filter @lkb/index test`, mutant = delete one session dir's `session.json` (D-020: backup+trap+timeout+cmp) | **COVERED.** Fixed code, mutant applied: `ℹ pass 214 / ℹ fail 1`, `AssertionError: every migrated session dir must have session.json + session_page.json; missing: 2026-05-08-funding-dreams-loans-forex: ENOENT`. Restored, `cmp` OK, re-run 215/215. Pre-fix code (stashed), same mutant: `ℹ pass 214 / ℹ fail 1`, `Error: ENOENT: no such file or directory, open '...session.json'` — an unhandled exception from `readFileSync`, not the length assertions, confirming they were vacuous. Restored, `cmp` OK, fix reapplied (`git stash pop`), re-run 215/215. |

## Live browser evidence (cycle 2)
`qa/evidence/browser-webinar-bot-live-c2-2026-09-24/report.json` records a real browser run: headless Chromium via playwright-core, against the lane's `apps/web` vite dev server at `127.0.0.1:5291`. No API server was running. The shared Playwright MCP browser was in use by another session, which is why playwright-core was used. The smoke script (`smoke.mjs`) and a screenshot (`meeting-bot.png`) are saved next to the report.
- **Page `/meeting-bot`:** h1 "Meeting Bot". All 6 checks came back true:
  - no "Not live yet";
  - no "never joined";
  - Zoho and Cloud OnAir listed;
  - the live-joiner card shown;
  - T-029 disclosed;
  - the incomplete capture disclosed.
- **Interactions:**
  - the unauthenticated load showed the API-key gate;
  - filled the form with a placeholder (not a real key) and clicked Continue;
  - reloaded `/meeting-bot`;
  - clicked nav `/`, then nav `/meeting-bot`, and the page re-rendered.
- **Result:** `consoleErrors: []`, `pageErrors: []`, `failedRequests: []`, `pass: true`.

**The capture is not complete.** About 5–8 minutes are missing because there is no auto-reconnect (T-029). ISS-295 (graph_edges read by no route) is not part of this unit.

## Review (senior-software-engineer agent, fresh context, read-only): **Approve**
It found nothing at critical or high. It re-ran the tests: 3/3.

It confirmed four things:
- the fake collection's `$ne` matches Mongo's semantics on a missing field;
- tenant scoping is delegated to the `coll(tenantId)` accessors;
- the `buildIndexer` extraction is behaviour-preserving (one `buildRouting()`);
- the dry-run exits before any Mongo import or `connect()`.

It raised two open questions. Both are disclosed here, not fixed:
1. A `$set` upsert cannot remove a field that a later run's doc no longer has; the old delete+insert wrote the full document. Today's field builders are fixed per type, so this does not occur now, and it has no test.
2. Turn `_id`s have no tenant prefix. This is pre-existing, and a cross-tenant slug collision fails loudly with E11000; it never leaks.

## What changed (cycle 0)
- `packages/meeting-bot/src/platform.ts`, `strategy.ts` and their tests: new platforms `zoho` (webinar/meeting.zoho.*) and `cloudonair` (Google Cloud OnAir), both routed to `browser`. A lookalike host (`zoho.in.evil.example`) stays `unknown`.
- `src/capture/obs-windows.ts` (NEW): the real `BrowserJoinerDeps`.
  - Spawns `py/sb_join.py` (NEW): a headed SeleniumBase-UC Chrome on the persistent profile `data/bot-profile/`. It pins `document.title`, denies permission prompts, auto-clicks Join only for zoho, and kills orphaned processes on its own profile.
  - Confirms the OS window title `"<title> - Google Chrome"`.
  - Drives OBS over obs-websocket v5: scene `LKB Bot` with window_capture plus wasapi_process_output_capture, matched by title (priority 1). Mutes the global desktop and mic inputs.
  - Starts the recording. Stop waits until the file size is stable.
  - Every failure path restores the mutes and stops the bot browser.
- `src/capture/record-commands.ts` (NEW; `cli.ts` only dispatches to it):
  - `record <url> --until HH:MM`: join, record, extract m4a, silence gate (max < -50 dB → no transcription), write `source.json` with `audioPath` and `hash`, optional transcription.
  - `login`: opens the bot profile so the user can sign in.
  - `finalize --stop-obs`: recovery when the controller dies mid-run.
- `scripts/lib/find-audio-file.mjs`: honours `source.json.audioPath`. The TOC branch is unchanged.
- `scripts/transcribe-long-session.mjs`: `GEMINI_STT_MODEL` override, headers/body timeout 600 s → 1,800 s.
- `scripts/sync-webinar-session.mjs` (NEW, **data writes**): upserts source/session/speakers/orgs/topics; delete+insert of this session's turns and of graph_edges tagged with `sessionRef`. Tenant-scoped through the `packages/db` `coll(tenantId)` accessors only. Dry-run by flag.
- Data: `data/toc-migrated/2026-09-24-zoho-next-european-study-destinations/{source,meta,turns,turns.chunked-gemini-3.5}.json`, `transcript.md`, `summary.md`.
- Also touched, not previously disclosed (ISS-287): `docs/meeting-bot-roadmap.md` (new), `TASKS.md`, `.gitignore`, `docs/DECISIONS.md`, `packages/meeting-bot/package.json`, `pnpm-lock.yaml`.

## What changed (cycle 1 — this fix, ISS-285/286/287)
- **ISS-285 (lint-dirsize):** `git mv scripts/sync-webinar-session.mjs scripts/webinar/sync-session.mjs`. Fixed the file's own `ROOT` computation (`resolve(dirname(...), "..")` → `"..", ".."`, one directory deeper) and its five `../packages/db/...` dynamic imports → `../../packages/db/...`. Re-verified the dry-run prints the exact same numbers from the new path (below). No other file references the old path by name (checked TASKS.md, docs/meeting-bot-roadmap.md, package.json — none do; `qa/QUEUE.md:49` names the old path+line numbers as a point-in-time historical sweep note, checker-owned, left as-is rather than edited by the maker).
- **ISS-285 (side effect):** `docs/SNAPSHOT.md` regenerated (`node scripts/snapshot.mjs`) — the move changed the directory tree the snapshot lists (new `scripts/webinar/` entry). Never hand-edited, per the linter's own generated-file contract.
- **ISS-286:** added the Capability coverage table below.
- **ISS-287:** `packages/meeting-bot/src/joiners/browser-joiner.ts` header comment rewritten — no longer claims "no real browser is launched here"; now names `capture/obs-windows.ts` + `py/sb_join.py` as the real `BrowserJoinerDeps` implementation and points at the T-024b draft contract. The undisclosed cycle-0 touched files are now listed above.
- **New test (cheap coverage, not requested by an issue but licensed by the checker's "add where cheap" note):** `scripts/lib/find-audio-file.test.mjs` — falsifies the `source.json.audioPath` branch `find-audio-file.mjs` added for this unit, plus proves the pre-existing TOC basename-match fallback still fires when `audioPath` is absent. Wired into `package.json`'s `test:lint` script list.
- `package.json`: `test:lint` gains `scripts/lib/find-audio-file.test.mjs`.

## How to verify (commands + REAL pasted outputs, cycle 1)

Per ISS-285's finding that cycle 0 ran only a 3-of-9 subset, this cycle ran the **full**
`pnpm lint:structure` composite plus the other three contract-C7/C10 commands, and pastes real
output rather than an "expected" line.

```
$ pnpm lint:structure
lint-loc: OK (296 file(s) within budget)
lint-dirsize: OK (83 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
**lint-root's FAIL is PRE-EXISTING and NOT caused by this unit or this fix cycle** — it is
**ISS-248** (open since 2026-09-10: the Codex-runtime-projected `AGENTS.md`/`.codex/` pushes the
repo-root loose-file count to 16 against a 15 budget in every Codex session). Verified by
`git ls-tree 4aa9d13 | awk '$2=="blob"{print $4}'` — the exact same 16 filenames were already
tracked/present at the commit *before* this unit's own commits (fd74864/cfaf464), including
`Living-Knowledge-Base-Architecture.html`. This is not this unit's to fix (no Approver-authorized
budget change, and the fix belongs to ISS-248's own resolution, not a webinar-bot-live cycle).
Per precedent (ISS-100, ISS-136, ISS-222, ISS-262), the chain short-circuits here, so every
remaining stage was re-run individually rather than trusted from the chain:

```
$ node scripts/lint-dupes.mjs
lint-dupes: OK (320 unique export(s), 24 unique schema $id(s))

$ node scripts/lint-migrations.mjs
lint-migrations: OK (3436 file(s) scanned)

$ node scripts/snapshot.mjs --check     # FAILED before this cycle's fix — see below
FAIL: docs/SNAPSHOT.md is stale (64 line(s) differ from a fresh regeneration): [... scripts/webinar/
  entry missing ...]
$ node scripts/snapshot.mjs             # regenerated (this cycle's move caused the staleness)
wrote D:\KnowledgeBase\docs\SNAPSHOT.md (117 lines)
$ node scripts/snapshot.mjs --check     # re-run after regenerating
OK: docs/SNAPSHOT.md matches a fresh regeneration (117 lines, budget 200)

$ node --test scripts/lint.test.mjs
ℹ tests 14
ℹ pass 14
ℹ fail 0

$ node scripts/tracker-audit.mjs --gate g1,g4
tracker-audit --gate G1,G4: 1 finding(s)
  G1 row-set: in TASKS.md but not goal.json — T-029..T-050 (webinar-bot roadmap rows)
```
**Also pre-existing, not this cycle's to fix:** T-029..T-050 were added to TASKS.md by this
unit's own **cycle-0** commit (fd74864, `docs/meeting-bot-roadmap.md`'s task list) without a
matching `.goal/goal.json` row-set — the same divergence class as ISS-288 (already filed against
this unit for the *status* half of U4.2/U2.6; this is the *row-set* half, for the newly-added
T-029..T-050 rows specifically, not yet its own issue). Not touched this cycle: `.goal/goal.json`
was already modified in the working tree before this fix cycle started (by another concurrent
process per this repo's multi-lane note), and adding 22 new task rows to it is tracker bookkeeping
outside the scope of ISS-285/286/287.

```
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (311 modules, 961 dependencies cruised)
```

The other three C7/C10 commands:
```
$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.

$ pnpm --filter @lkb/meeting-bot test
ℹ tests 43
ℹ pass 43
ℹ fail 0

$ pnpm --filter @lkb/meeting-bot typecheck
(exit 0, no output)
```

The moved script, re-verified from its new path (ISS-285's actual fix):
```
$ node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run
session 2026-09-24-zoho-next-european-study-destinations (tenant toc)
  turns 80 · speakers 3 · orgs 6 · topics 15
  graph_edges 94: {"held_on":1,"in_month":1,"captured":1,"spoke_in":3,"represents":2,
  "located_in":8,"partner_of":4,"covers":22,"discussed":52}
No Mongo connection attempted (--dry-run).
```
Identical to cycle 0's numbers and to the live Mongo read-back the checker already reproduced
(94 graph_edges, same byType breakdown) — unchanged by this cycle, not re-run against production
again (never run this script without `--dry-run`).

**Unrelated flake observed, not caused by this cycle:** `pnpm test:lint` (the wider list, not part
of `lint:structure`) intermittently fails `catalogue-cli.test.mjs`'s "leaves the repo clean" check
because `docs/PROGRESS.md` shows transiently modified — reproduces even running that file alone,
with a *different* failure count each run (1, then 4), and `git status` shows `docs/PROGRESS.md`
clean immediately after. Consistent with another concurrent maker/checker lane writing that file
mid-run (this dispatch's own brief warns of concurrent commits in this tree), not a defect in this
unit's own files (this cycle touched no file `catalogue-cli.test.mjs` reads). Not filed as an
issue — not reproducible in isolation from tree concurrency, and doesn't touch any of the four
commands above.

## Prior verify list (cycle 0, kept for reference)
- `pnpm --filter @lkb/meeting-bot test` → 43 pass / 0 fail
- `pnpm --filter @lkb/meeting-bot typecheck` → exit 0
- `node scripts/lint-loc.mjs` → `OK (295 file(s) within budget)`
- `npx depcruise --config .dependency-cruiser.cjs packages apps workers` → 0 violations (310 modules)
- `node scripts/lint-dupes.mjs` → OK
- `node scripts/webinar/sync-session.mjs 2026-09-24-zoho-next-european-study-destinations --dry-run` → turns 80 · speakers 3 · orgs 6 · topics 15 · graph_edges 94, and no Mongo connection
- Mongo read-back (tenant toc): `graph_edges` count 94; `spoke_in` edges on 2026-09-24 = devanshi 35 / anjum 27 / sagar 16 turns; every non-structural edge has `evidence[].turnId` that resolves to a turn of this session.

## Capability coverage (ISS-286)

Per `checker/SKILL.md` step 4b and `references/capability-coverage.md`: every falsifying edit
below is a single-hunk edit to a file named in "What changed", applied to the bound working tree,
reverted via `git checkout --` (a tracked file with no prior uncommitted diff — the safe
git-native equivalent of D-020's byte-backup+trap+cmp rule) and re-verified green afterward. No
mutant was left applied at any point (`git diff --stat` shown as 0 after each restore).

| # | Capability (What changed) | Check (file:line / node id) | `observed` |
|---|---|---|---|
| 1 | Platform detection: `zoho`/`cloudonair` hosts route to those platforms; lookalike host stays `unknown` (`platform.ts:33-34`) | `node --test --import tsx src/platform.test.ts` → `detects Zoho webinar/meeting URLs` | **COVERED.** PASS before: `✔ detects Zoho webinar/meeting URLs (0.3558ms)`, 9/9. Edit: `platform.ts:33` regex `zoho` → `zoho-DISABLED` (single hunk). FAIL after: `✖ detects Zoho webinar/meeting URLs (2.2895ms)` — `'unknown' !== 'zoho'` (right-reason: the specific assertion flipped, not a parse-break). Restored via `git checkout --`, `git diff --stat` empty, re-run green: `✔ ... (0.4186ms)`, 9/9. |
| 2 | Strategy routing: `zoho`/`cloudonair` → `browser` joiner (`strategy.ts:30-32`) | `node --test --import tsx src/strategy.test.ts` → `routes zoho and cloudonair to the local browser joiner` | **COVERED.** PASS before: `✔ ... (0.1551ms)`, 4/4. Edit: deleted the `case "zoho": case "cloudonair":` lines (single hunk). FAIL after: `✖ ... (1.8866ms)`, 3 pass/1 fail. Restored via `git checkout --`, re-run green: `✔ ... (0.158ms)`, 4/4. |
| 3 | `find-audio-file.mjs` `audioPath` branch — bot-captured sessions skip TOC basename matching (`scripts/lib/find-audio-file.mjs:19-22`) | `node --test scripts/lib/find-audio-file.test.mjs` (NEW this cycle, wired into `test:lint`) | **COVERED.** PASS before edit: 3/3 (`ℹ pass 3 / ℹ fail 0`). Edit: `if (source.audioPath)` → `if (false && source.audioPath)` (single hunk). FAIL after: both `audioPath branch` tests fail for the right reason (fell through to basename matching, which then fails since no matching file exists); the third (fallback) test still passes — `ℹ pass 1 / ℹ fail 2`. Restored via `git checkout --`, re-run green: `ℹ pass 3 / ℹ fail 0`. |
| 4 | Real browser join (`py/sb_join.py`): headed SeleniumBase-UC Chrome, permission-prompt denial, title pinning, orphan recovery | — | `UNVERIFIED — no automated test harness exists for driving a real Chrome process; requires a live/headed browser. Debt carried by T-033 ("Tests + checker pass ... failure paths with a fake OBS client"). The checker's cycle-0 manual code review (JOIN_TEXTS content, MAX_CLICKS, --deny-permission-prompts) and the live 2026-09-24 Zoho run (D-027) are the only verification today.` |
| 5 | Bounded, denylisted auto-click (`sb_join.py` `JOIN_TEXTS`/`CLICK_JS`, no `share`/`unmute`/`raise hand`/`allow`) | — | `UNVERIFIED — same reason as row 4 (no Python test harness for this script). The checker's cycle-0 manual grep of JOIN_TEXTS/CLICK_JS is the only check performed; not a repeatable isolating falsification. Debt carried by T-033.` |
| 6 | Per-process OBS capture (window-title match, mute/restore on every exit path incl. thrown errors) (`src/capture/obs-windows.ts`) | — | `UNVERIFIED — this unit's own manifest already discloses "No unit tests for obs-windows.ts failure paths" (Known gaps). Debt carried by T-033, which explicitly names a fake-OBS-client harness as the fix.` |
| 7 | Silence gate: capture ≤ `SILENCE_MAX_DB` throws before transcription, still writes `source.json` (`src/capture/record-commands.ts` `finalizeRecording`) | — | `UNVERIFIED — no ffmpeg-mock test harness exists yet. Live evidence: the 2026-09-24 run blocked a −91 dB smoke capture (manifest's own "Actual outputs"), but that is one live observation, not a repeatable unit test. Debt carried by T-033.` |
| 8 | Recovery (`runFinalize --stop-obs`): stops OBS, waits for file-size stability, unmutes, terminates orphaned Chrome | — | `UNVERIFIED — no test harness. Live evidence: the 16:30:56 controller death was recovered this way (D-027), one live observation. Debt carried by T-033.` |
| 9 | Credential handling: `OBS_WS_PASSWORD` never appears in a log/error string | — | `UNVERIFIED by automated test — the checker's cycle-0 manual grep of every console.log/console.error in obs-windows.ts/record-commands.ts is the only verification performed and is not a repeatable falsification. A cheap static test (assert the string never appears alongside a log call) was considered but not added this cycle — not free of false-negative risk for a determined future edit. Debt carried by T-033.` |
| 10 | Data-write scoping: every Mongo write goes through `coll(tenantId)`; turns/graph_edges deletes scoped by `sessionId`/`sessionRef` (`scripts/webinar/sync-session.mjs`) | — | `UNVERIFIED by a unit test of this script itself — sync-session.mjs has no test file. The scoping MECHANISM it depends on (packages/db/src/lib/tenantScope.ts's withTenant/scopedCollection) has its own pre-existing test suite (tenantScope.test.ts, unmodified by this unit) which this cycle did not re-falsify (out of "What changed"). The checker's cycle-0 live Mongo read-back reproduced 0 cross-tenant rows against production — real but not a repeatable isolating falsification. Debt carried by T-033.` |
| 11 | Graph-edge provenance: every non-structural edge's `evidence[].turnId` resolves to a `turns` row of the same session (H3) | — | `UNVERIFIED by unit test — deterministic edge-building in sync-session.mjs has no test file. The checker's cycle-0 live read-back reproduced 225/225 resolving, 0 bad — real but a one-time live observation, not a repeatable falsification. Debt carried by T-033.` |
| 12 | `transcribe-long-session.mjs`: `GEMINI_STT_MODEL` override, 600s→1800s timeout | — | `UNVERIFIED — requires a live Gemini API call; no mock transport test exists for this override. Live evidence: the 2026-09-24 single-call gemini-3.8-flash transcription (80 turns, no gaps) is one live run, not a repeatable unit test. Debt carried by T-033.` |

**Summary: 3/12 rows COVERED with a real isolating falsification this cycle (2 pre-existing tests
re-falsified, 1 new test added+falsified); 9/12 UNVERIFIED, all naming T-033 as the tracked debt
(no row is silently uncovered — T-033 already exists in TASKS.md for exactly this class of gap,
and the manifest's own "Known gaps" section disclosed several of these before this cycle).**

## Actual outputs (maker's own runs, 2026-09-24)
- **Live run.** Scheduled task at 15:55 → `opened` → `bot window confirmed` → clicked "join now" → recording started.
  - The controller died at 16:30:56 (console closed). OBS and the bot kept going.
  - Recovered with `finalize --stop-obs`: mkv of 3,599,045,544 bytes, audio max 0 dB / mean −19.2 dB, OBS inputs unmuted, bot browser closed.
- **Transcripts.**
  - Chunked gemini-3.5 at 40 min: failed on `UND_ERR_HEADERS_TIMEOUT`.
  - At 20 min on the untrimmed audio: refused because of an internal gap, and chunk 4 had invented turns over 13 min of post-event silence.
  - Trimmed 230–3935 s + gemini-3.8-flash in a single call: 80 turns, no gaps, max tEnd 3724 s on 3705 s of audio.
- **Silence gate.** Blocked a −91 dB smoke capture ("recording is silent … not transcribing").
- **Sync.** `written: turns -0/+80, graph_edges -0/+94`. Read-back queries are in D-028's Result.

## Known gaps (not claimed)
- Window video is intermittently black (it was black during the 16:24–16:27 slide share). Audio is fine.
- No auto-reconnect: Zoho dropped the bot at about 16:03 (reloaded by hand) and at about 17:01 (last ~5–8 min lost).
- No unit tests for `obs-windows.ts` failure paths (T-033). The `audioPath` branch gap named here
  in cycle 0 is now covered — see Capability coverage row 3 (fix cycle 1).
- Graph `covers`/`discussed` edges are keyword-based (confidence 0.7–0.8). `country:usa` also matches "Hellenic American".

## Asked of the checker
1. Verdict on the diff against C1–C7 as they apply (C3 is superseded for the browser joiner; say so explicitly).
2. **Security class (never capped):**
   - Tenancy of `scripts/webinar/sync-session.mjs` (moved from `sync-webinar-session.mjs` this fix cycle, ISS-285) writes: every write goes through `coll(tenantId)`, and a delete can only touch this session's turns/edges.
   - Credential handling: `OBS_WS_PASSWORD` read from `.env`, never logged; the bot profile holding cookies is gitignored (`data/bot-profile/`).
   - `sb_join.py` auto-click list: can it click anything that shares or unmutes?
3. Draft T-024b contract criteria from this manifest (live join, per-process capture, silence gate, recovery, data-write scoping).

## Live browser evidence (cycles 0–1; superseded for cycle 2 by "Live browser evidence (cycle 2)" above, which does touch the web UI)
Not a web-UI change in cycles 0–1. The live-run evidence is the Zoho participant page read over CDP at 16:07/16:42, a frame showing 4 panelists (16:05), and Zoho's "Thank you for attending" email at 17:09.

## Fix-cycle-1 addendum (orchestrator, 2026-09-24 22:40)
- `.goal/goal.json`: registered T-029…T-050 (22 tasks) that cycle 0 added to TASKS.md without goal rows (tracker-audit G1 row-set, a regression this unit caused); U4.2 and U2.6 moved pending → in_progress with a note citing D-027/D-028 (closes the substance of ISS-288, medium, same file). Goal monitor re-run to refresh progress totals.
- `node scripts/tracker-audit.mjs` after: `2 finding(s)` — both G2 and NOT caused by this unit: `1 unparseable line` = the ISS-288 ledger row written by the 22:10 sweep-consolidation checker (ledger is checker-owned; asked the checker below to repair it) and `125 issue(s) "fixed" with no verified_date` (pre-existing).
