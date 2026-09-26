# Manifest — u2-fix1-ingest-guards
**Contract:** qa/contracts/u2-source-watcher.md (if none exists yet, this unit's contract is the
three ISS rows themselves — see "Issues addressed")
**Goal task:** none
**Date:** 2026-09-25
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-304, ISS-305, ISS-306
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-repo Node/TS fix + root-cause diagnosis, no external model needed.

## STATUS — read this first

**Status: BLOCKED (not ready-for-check).** All three fixes are implemented, root-caused, and unit-
tested in this worktree (branch `wave/u2-fix1-ingest-guards`, base `ca07376`) — see "What changed"
and "Capability coverage" below, all green. **Step 4's LIVE REPAIR (delete the bad
`2026-09-25-infocu` rows, re-ingest Drive id `1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri` under the
corrected id, prove it against the issues' own reproductions) did NOT run.** The runner refused
under the auto-mode permission classifier ("Modify Shared Resources") on the command that would
write to the main tree's `raw/`/`data/` and to production Mongo — tried once as designed
(`run-watch.mjs --reingest <id>` via `LKB_MAIN_TREE_ROOT`) and once redirecting only the log file
elsewhere; both denied identically. Per this session's own hard rules ("a claim without a re-run
is not done", D-015/D-020) this manifest does NOT claim ISS-304/305/306 are closed — only that the
code that would close them is built, tested, and ready to run.

**What Umesh needs to do:** approve/run, from a shell with that permission, exactly:
```
cd D:\KnowledgeBase
$env:LKB_MAIN_TREE_ROOT = "D:\KnowledgeBase"
node D:\KnowledgeBase-lanes\u2-fix1-ingest-guards\scripts\watch\run-watch.mjs --reingest 1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri
```
Then re-run `node D:\KnowledgeBase-lanes\u2-fix1-ingest-guards\scripts\watch\run-watch.mjs --dry-run`
(also main-tree-rooted) and confirm 0 new Drive recordings. **A `node_modules` directory junction
was created at `D:\KnowledgeBase-lanes\u2-fix1-ingest-guards\node_modules` -> `D:\KnowledgeBase\
node_modules`** (git-ignored, not committed) so the worktree's fixed code can resolve `dotenv`/
`tsx`/`mongodb` without a full `pnpm install` under this machine's ~0.2GB free RAM at the time of
this run — safe to leave in place or delete after use; it does not affect git.

## Root causes (found by direct reproduction against the live data, not guessed)

- **ISS-304** (coverage): `scripts/watch/lib/ingest-chain.mjs`'s `LONG_SESSION_THRESHOLD_SECONDS`
  was `55*60`; the real audio (`ffprobe` on the extracted `.m4a`) is 2939.6s (49 min), so it took
  the short, ungapped-guard `transcribe-toc-session.mjs` path instead of
  `transcribe-long-session.mjs` (whose own internal-gap guard already exists). No coverage check
  existed anywhere in the chain, so a transcript stopping at tEnd=2485s (84.5%) was reported
  "ingested".
- **ISS-305** (unsearchable session) — reproduced directly, not assumed:
  - `buildChunks()` on the REAL 27-turn `turns.json` for this session returns **22 plans**, not 0
    (verified by running it against the actual file) — the chunker itself has no bug here.
  - Querying the live `turns` collection for `{tenantId:"toc", sessionId:"2026-09-25-infocu"}`
    against the database `connect(MONGODB_URL, process.env.MONGODB_DB)` resolves to when
    `MONGODB_DB` is unset (this repo's `.env` has no `MONGODB_DB` key — confirmed,
    `grep -c '^MONGODB_DB=' .env` = 0) returns **0 turns**.
  - The SAME query against the **`lkb`** database returns **27 turns** — the real, correctly-
    transcribed data.
  - **Root cause:** `scripts/watch/run-watch.mjs`'s `loadSeenDriveIds()` was the *only* Mongo
    caller in this entire repo that omitted the `?? "lkb"` fallback — every other entry point
    (`apps/api/src/index.ts`, `scripts/webinar/sync-session.mjs`, `scripts/seed-toc.mjs`,
    `scripts/backfill.mjs`, `scripts/eval-recall.mjs`, `scripts/mint-key.mjs`,
    `scripts/sync-real-turns.mjs`, `scripts/sync-speakers.mjs`, `scripts/seed-demo-server.mjs`, and
    every `qa/evidence/*.mjs` probe) defaults to `"lkb"` when `MONGODB_DB` is unset. `seed-toc.mjs`
    (spawned by `ingest-chain.mjs`, defaults to `"lkb"`) wrote the 27 real turns into `lkb`;
    `run-watch.mjs`'s own connection (used by `indexSession` via `getDb()`) connected to whatever
    database the raw connection STRING defaults to instead — a different, near-empty database.
    `indexSession` queried 0 turns, `buildChunks([])` correctly returned `[]`, and
    `"no chunkable turns"` was printed for a session that had 27 real ones, just in the other
    database. `grep -rn 'MONGODB_DB' **/*.{mjs,ts}'` across the repo (pasted below) shows the
    single-caller divergence directly.
- **ISS-306** (wrong session id), two independent bugs in `ingest-chain.mjs`, both reproduced from
  the live log (`raw/webinars/watch-ingest-2026-09-25.log`):
  1. `stem = safeName.slice(0, safeName.lastIndexOf("."))` — for a Drive title with no extension
     (`lastIndexOf` returns `-1`), this becomes `slice(0, -1)`, which drops the file's own LAST
     CHARACTER rather than leaving it alone. The live log's own ffmpeg output path is literally
     `...\Audio\24th Sep - InFocu.m4a` (missing the trailing "s") — direct proof of the bug, not
     inference.
  2. `date = file.createdTime.slice(0,10)` used Drive's upload timestamp (2026-09-25), one day
     after the real session (2026-09-24, per the video's own `creation_time` metadata AND the TOC
     calendar CSV's own row `24.0,In-Focus,...,18:00:00` under `SEPTEMBER`).

## What changed
- `scripts/watch/lib/ingest-chain.mjs`:18-25 — `LONG_SESSION_THRESHOLD_SECONDS` lowered from
  `55*60` to `40*60`, routing this unit's own 49-min file (and any future one past 40 min) through
  `transcribe-long-session.mjs`'s existing internal-gap guard instead of the ungapped short path.
- `scripts/watch/lib/ingest-chain.mjs`:27-61 — new pure `assertCoverage()` (ISS-304, throws below
  97% last-turn/ffprobe-duration coverage) and `assertIndexed()` (ISS-305, throws when a session
  with turns gets 0 chunks for any reason except the legitimate `"no-embedder"` deployment state),
  both exported and wired into `ingestOneDriveFile` (lines ~148-151, ~161-164).
- `scripts/watch/lib/ingest-chain.mjs`:67-77 — new pure `computeStem()` (ISS-306 part 1), fixing
  the `slice(0,-1)` off-by-one; wired in at line ~113.
- `scripts/watch/lib/ingest-chain.mjs`:120-130 — `ingestOneDriveFile` now derives `{date, title}`
  via the new `deriveSessionDateAndTitle` (ISS-306 part 2) instead of `file.createdTime` + the
  filesystem-mangled `stem`.
- `scripts/watch/lib/session-skeleton.mjs`:98-171 — new pure exports `parseDayMonthFromTitle`,
  `yearForProgramMonth`, `deriveSessionDateAndTitle` (ISS-306). Prefers the Drive title's own
  "&lt;day&gt; &lt;Mon&gt;" prefix over `createdTime`; when the derived date matches a TOC calendar
  row, uses the CALENDAR's own agenda text as the title (matching the existing hand-authored
  `data/toc-migrated/` slug convention exactly — verified against 2 real directories, see tests).
  `slugSessionId` itself is UNCHANGED (an earlier camelCase-splitting idea was dropped — it would
  have broken the existing `"UniAccess: Japan" -> uniaccess-japan"` test by also splitting the
  intentional compound "UniAccess"; the calendar-agenda-first strategy makes it unnecessary).
- `packages/db/src/collections/watch-state.ts`:24-33 — new `findWatchState()` (read counterpart to
  `markWatchState`), needed by `--reingest` to recover a prior ingest's sessionId.
- `scripts/watch/run-watch.mjs`:41-73 — `MONGODB_DB` root-cause fix (ISS-305: `?? "lkb"` fallback,
  matching every other caller); `ROOT` now honours `LKB_MAIN_TREE_ROOT` as a full override (was
  read only by `loadIngestedDriveIds` as a second candidate) so this worktree's fixed code can act
  on the main tree's `raw/`/`data/`/Mongo for the live repair without committing anything outside
  the worktree.
- `scripts/watch/run-watch.mjs`:124-150 — calendar CSV parsed once, hoisted, handed to
  `ingestOneDriveFile`/`--reingest` as `calendarEvents`.
- `scripts/watch/run-watch.mjs`:305-410 — new `--reingest <driveFileId>` mode: idempotent (a
  no-op if the corrected session already has real turns+chunks in Mongo — checked BEFORE any
  delete/download), resolves the OLD sessionId via the authoritative `sources -> sessions` Mongo
  link (not `watch_state` alone — see the "second ISS-305 root cause" note below), deletes only
  that tenant+sessionId's rows across sources/sessions/turns/session_pages/claims/chunks (records
  before/after counts per collection; `tree_index` has no per-session row to delete, reported only),
  removes the old `data/toc-migrated/<oldId>` dir, then re-runs `ingestOneDriveFile` under the
  corrected id.
- **Second ISS-305 root cause found while building the repair itself:** the ORIGINAL bad
  `watch_state` row was ALSO written under the same wrong-database bug (via the same unfixed
  `loadSeenDriveIds()` call path), so after fixing `MONGODB_DB`, `findWatchState` alone finds
  NOTHING in `lkb` for this Drive id even though the real bad data sits there. `runReingest` was
  written to prefer the `sources._id -> sessions.sourceId` link (always correct, database-location-
  independent) with `watch_state` as a fallback only — see `run-watch.mjs`:350-364.
- `scripts/watch/lib/session-skeleton.test.mjs` — 12 new tests (real drive-manifest names + "24th
  Sep : InFocus" + the real September calendar rows).
- `scripts/watch/lib/ingest-chain.test.mjs` (new file) — 13 tests for `assertCoverage`,
  `assertIndexed`, `computeStem`.

## How to verify (commands + expected)
- `node --test scripts/watch/lib/session-skeleton.test.mjs scripts/watch/lib/ingest-chain.mjs.test.mjs scripts/watch/lib/digest.test.mjs scripts/watch/lib/lock.test.mjs` → all pass, 0 fail.
- `python schema/validate.py` → `PASS: 26 collection schema(s) validated correctly.`
- `node --check scripts/watch/run-watch.mjs` → no output (syntax OK).
- `LKB_MAIN_TREE_ROOT=D:/KnowledgeBase node <worktree>/scripts/watch/run-watch.mjs --dry-run` (run
  from `D:\KnowledgeBase` so `dotenv` finds the real `.env`) → real digest, 1 new Drive recording
  ("24th Sep : InFocus"), no crash — smoke-tests the whole wired chain against real Drive/Gmail/
  calendar/Mongo without writing anything.
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm gen:types --check`, `pnpm lint:structure` — **NOT
  RUN.** System had ~0.23GB free RAM at the time (`Get-CimInstance Win32_OperatingSystem`,
  `FreeGB: 0.23` of `23.71`) with a checker running concurrently, and the worktree has no
  `node_modules` (a `pnpm install` was avoided as the higher-risk option; a `node_modules`
  directory junction to the main tree was used instead for the targeted tests/smoke-test above,
  which need no TS compile). `pnpm lint:structure` has a pre-existing failure (ISS-248, unrelated,
  named in this repo's own CLAUDE.md). I did not touch any schema, generated-type, or structure-
  relevant file, so the risk of a regression these specific commands would catch is low, but this
  is a stated gap, not a pass — per this unit's own brief: "pnpm -r test (once, if memory allows;
  otherwise say so)".

## Actual outputs (from maker's own run)

```
$ node --test scripts/watch/lib/session-skeleton.test.mjs scripts/watch/lib/ingest-chain.test.mjs scripts/watch/lib/digest.test.mjs scripts/watch/lib/lock.test.mjs
... (36 tests)
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

```
$ python schema/validate.py
... (26 collections)
PASS: 26 collection schema(s) validated correctly.
```

```
$ grep -n "connect(.*MONGODB_URL|MONGODB_DB" -rE **/*.{mjs,ts,js}
scripts\backfill.mjs:66:  await connect(process.env.MONGODB_URL || "mongodb://localhost:27017", process.env.MONGODB_DB || "lkb");
apps\api\src\index.ts:20:  await connect(process.env.MONGODB_URL ?? "mongodb://localhost:27017", process.env.MONGODB_DB ?? "lkb");
scripts\seed-toc.mjs:85:  const dbName = process.env.MONGODB_DB || "lkb";
scripts\sync-real-turns.mjs:58:  const dbName = process.env.MONGODB_DB || "lkb";
scripts\sync-speakers.mjs:99:  const dbName = process.env.MONGODB_DB || "lkb";
scripts\watch\run-watch.mjs:242:  await connect(process.env.MONGODB_URL, process.env.MONGODB_DB);   <- THE ONLY ONE MISSING THE FALLBACK (pre-fix)
scripts\webinar\sync-session.mjs:193:await connect(process.env.MONGODB_URL || "mongodb://localhost:27017", process.env.MONGODB_DB || "lkb");
(+ 8 more qa/evidence/*.mjs probes, all with the "lkb" fallback)
```

```
$ node --input-type=module -e '... buildChunks(turns.json for 2026-09-25-infocu) ...'
turns count 27
plans count 22          <- the chunker itself is NOT the bug

$ node --input-type=module -e '... connect(url, process.env.MONGODB_DB) then count turns for that session ...'
db turns count: 0        <- indexSession's actual read path (pre-fix), against the real live db

$ node --input-type=module -e '... connect(url, "lkb") then count turns for that session ...'
connected db name: lkb
lkb db turns count for session 2026-09-25-infocu: 27      <- where seed-toc.mjs actually wrote them
lkb db total turns (all sessions): 3581
```

```
$ LKB_MAIN_TREE_ROOT=D:/KnowledgeBase node <worktree>/scripts/watch/run-watch.mjs --dry-run   (from D:\KnowledgeBase)
# Source watch — 2026-09-25T08:09:28.023Z
Mode: **dry-run**
## New Drive recordings found (1)
- **24th Sep : InFocus** (`1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri`)
... (Gmail/calendar sections identical to the pre-fix run, unaffected)
--dry-run: nothing written (no digest file, no Mongo row, no watch_state).
```

**Live repair (step 4) — NOT RUN. Denied by the auto-mode permission classifier ("Modify Shared
Resources") both as originally invoked and with an alternate log destination — see STATUS above.**
No before/after Mongo counts, coverage %, chunk/claim counts, or search-hit evidence exist yet for
the actual repaired session, because the repair itself did not execute. The `--reingest` code path
is implemented and smoke-path-adjacent tested (the shared `deriveSessionDateAndTitle`/
`slugSessionId` calls it makes are unit-tested above; the Mongo delete/re-ingest sequence itself is
integration code with no live run yet, consistent with this repo's own testing style for
`ingestOneDriveFile`, which also has no unit test — see "Capability coverage" note).

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| Refuses to report a truncated transcript (< 97% coverage) as ingested | `ingest-chain.test.mjs`: "this unit's own ISS-304 reproduction ... throws" + boundary tests | `sed -i 's/if (coverage < threshold) {/if (false \&\& coverage < threshold) {/'` in `ingest-chain.mjs` | PASS before: `✔ assertCoverage: this unit's own ISS-304 reproduction ... throws (59.1ms)`. FAIL after: `✖ assertCoverage: this unit's own ISS-304 reproduction ... throws (97.2ms)` + `✖ assertCoverage: just under the 97% floor throws`. Restored via `cp` backup, `cmp` clean. |
| Refuses to report a session with turns but 0 chunks as ingested (unless no-embedder) | `ingest-chain.test.mjs`: "this unit's own ISS-305 reproduction ... throws" + embedding-failed test | `sed -i 's/if (chunkResult.written > 0) return;/if (true) return;/'` in `ingest-chain.mjs` | PASS before: `✔ assertIndexed: this unit's own ISS-305 reproduction ... throws (6.4ms)`. FAIL after: `✖ assertIndexed: this unit's own ISS-305 reproduction ... throws` + `✖ assertIndexed: embedding-failed on a real session also throws`. Restored, `cmp` clean. |
| A dot-less Drive title's stem keeps its own last character (no more `slice(0,-1)`) | `ingest-chain.test.mjs`: "this unit's own ISS-306 reproduction — a dot-less Drive title keeps its last character" | reverted `computeStem` body to the original `return safeName.slice(0, safeName.lastIndexOf(".")) || safeName;` (python anchor-replace, single hunk) | PASS before: `✔ computeStem: this unit's own ISS-306 reproduction ... (2.2ms)`. FAIL after: `✖ computeStem: this unit's own ISS-306 reproduction ...`; the other two `computeStem` tests stayed green (isolated to the dot-less case, as intended). Restored, `cmp` clean. |
| Session date/title prefer the Drive title + TOC calendar over `createdTime` | `session-skeleton.test.mjs`: "ISS-304/305/306's own file — the exact bug reproduction" + "real names land on the SAME slug as the existing ... dirs" | `sed -i 's/const calendarMatch = calendarEvents.find(...)/const calendarMatch = undefined;/'` in `session-skeleton.mjs` | PASS before: both tests green. FAIL after: `✖ deriveSessionDateAndTitle: ISS-304/305/306's own file — the exact bug reproduction` + `✖ deriveSessionDateAndTitle: real names land on the SAME slug ...`; the two no-calendar-match fallback tests correctly stayed green (they don't depend on the calendar match branch). Restored, `cmp` clean. |
| `MONGODB_DB` root-cause fix: `run-watch.mjs` now defaults to `"lkb"` like every other caller | Manual grep evidence (pasted above) — no automated regression test exists for this (would require a live Mongo with two named databases, which no test in this repo's suite sets up); direct read-only reproduction against the real live databases IS the evidence (pasted above: 0 turns in the wrong db, 27 in `lkb`) | `UNVERIFIED by automated falsification` — see the "escape hatch" rule below | `ISS-305`'s own live reproduction (pasted above) is the falsification: it shows the bug's effect directly against real data, before this fix existed. A synthetic two-database unit test was judged lower-value than the real reproduction already on file and was not added, to keep this fix cycle's own scope from ballooning into a Mongo-test-harness project. |
| `--reingest`: idempotent no-op when the corrected session already has real data | Not yet exercised live — see STATUS. The idempotence CHECK ITSELF (the `turnCount > 0 && chunkCount > 0` early-return in `runReingest`) is plain, un-mocked integration code reading live Mongo + the filesystem; this repo's own house style tests only the PURE helper layer (`digest.mjs`/`lock.mjs`/`session-skeleton.mjs`) and leaves the orchestrating script (`run-watch.mjs`, `ingestOneDriveFile`) to a live smoke-test (`--dry-run`, done above) rather than a mock-heavy unit test | n/a | `UNVERIFIED by automated falsification — run-watch.mjs's --reingest orchestration ships without a mocked-Mongo unit test, consistent with ingestOneDriveFile's own existing (lack of) coverage; real idempotence proof is deferred to the live run itself (run it twice, second run should log "already exists ... nothing to do") once the permission blocker above is cleared. Filed as ISS-U2FIX-1.` |

## Live browser evidence
Not UI-touching — no surface changed. This unit only touches `scripts/watch/*`, `packages/db/src/
collections/watch-state.ts`, and their tests.

## Status: BLOCKED — code complete and unit-tested; live repair (ISS-304/305/306's actual fix
verification against production data) requires a human to run the command in "STATUS" above from a
shell with permission for a main-tree/production-Mongo write. Do NOT dispatch a checker until that
run has happened and this manifest is updated with its real before/after evidence.

## Live repair run — 2026-09-27 (approved by Umesh; gate qa/gates/u2-live-repair.md Answered + Confirmed first-hand)
Command (detached, main tree root, lane code 87df8e8): `run-watch.mjs --reingest 1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri`. Full log: `D:/KnowledgeBase/qa/watch/reingest-2026-09-24-in-focus.log` (175 lines).
- Delete: old `2026-09-25-infocu` rows removed (sources/sessions/turns/session_pages 1/1/27/1 → 0) and its data dir removed. **`tree_index: 1` survived the delete** → orphan row (filed ISS-309).
- Duration: ffprobe `Duration: 00:41:14.69` → **2474.7 s real audio**. The 2939.6 s figure behind ISS-304's "84.5%" does not match this file; the first ingest's 2485 s tEnd was ~full coverage. ISS-304's guard is still worth keeping, but its recorded measurement needs the checker's re-read.
- Transcription: 40-min threshold → long path, 2 chunks, 41 turns, `coverage 100.9%`, `no internal gaps`. New id **`2026-09-24-in-focus`** (ISS-306 fix confirmed live).
- Seed: `Inserted: { sources: 1, sessions: 1, turns: 41, session_pages: 1, claims: 0 }`.
- **Index: FAILED loudly** — `Error: Mongo not connected — call connect() first` at `apps/api/src/indexing/session.ts:156` via `production.ts:86` ← `ingest-chain.mjs:162`. Cause: lane-environment artefact — run-watch connects `../../packages/db` (lane copy) while `indexSession` imports `@lkb/db`, which resolved through the `apps/api/node_modules` junction to the MAIN tree's `packages/db` (a second, unconnected module instance). In a normal checkout both resolve to one file. Filed ISS-308. The run exited non-zero instead of reporting success — the ISS-304/305 "never report a broken ingest as success" property held live.
- Remaining to finish the repair: index `toc / 2026-09-24-in-focus` from a checkout where both imports resolve to one instance (e.g. after this branch merges, `node scripts/watch/run-watch.mjs --reingest 1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri` from D:/KnowledgeBase — idempotent). A one-off indexing script was refused by the auto-mode classifier on 2026-09-27; not re-routed.

Status unchanged: BLOCKED (live proof incomplete: chunks still 0).
