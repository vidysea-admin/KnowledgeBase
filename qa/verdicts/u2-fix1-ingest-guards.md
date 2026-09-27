# Verdict — u2-fix1-ingest-guards

**Cycle checked:** 1
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (claude-sonnet-subagent), read-only toward the lane worktree and toward production Mongo. No live ingest/reingest/Drive download/Mongo write executed by this check — the live index step is explicitly out of scope (Umesh's first-hand deferral to post-merge).

## Scope

Per dispatch: judge the CODE claim for ISS-304/305/306 only. ISS-304/305/306 stay OPEN in the ledger regardless of this verdict, pending a post-merge `--reingest` showing chunks > 0 against their own recorded reproductions (D-015). This verdict does not, and could not, close them.

## What I re-ran myself (bound tree, `D:\KnowledgeBase-lanes\u2-fix1-ingest-guards`, HEAD e5ca83b)

```
$ node --test scripts/watch/lib/session-skeleton.test.mjs scripts/watch/lib/ingest-chain.test.mjs scripts/watch/lib/digest.test.mjs scripts/watch/lib/lock.test.mjs
ℹ tests 36
ℹ pass 36
ℹ fail 0
```
Matches the manifest's pasted output exactly (36/36, same test names).

```
$ python schema/validate.py
PASS: 26 collection schema(s) validated correctly.
```

```
$ node --check scripts/watch/run-watch.mjs
(no output — syntax OK)
```

## Capability-coverage — reproduced independently, in a throwaway copy (never the bound tree)

Copied `scripts/watch/lib/*.mjs` + tests to a scratch dir outside the bound root
(`.../scratchpad/lib-copy`), confirmed each named test GREEN in the copy first, then applied the
manifest's exact falsifying edit, confirmed RED (and that the RIGHT assertion fired), then
restored from a `.bak` and verified `cmp` clean (D-020 discipline) — every row below:

| row | green-before (copy) | falsifying edit applied | red-after (copy) | isolation |
|---|---|---|---|---|
| assertCoverage (ISS-304) | 13/13 pass | `if (false && coverage < threshold)` | 11/13 pass — the 2 `assertCoverage` tests fail, nothing else | clean |
| assertIndexed (ISS-305) | 13/13 pass | `if (true) return;` | 11/13 pass — the 2 `assertIndexed` tests fail, nothing else | clean |
| computeStem (ISS-306 pt.1) | 13/13 pass | reverted to `slice(0, lastIndexOf(".")) \|\| safeName` | 12/13 pass — only the dot-less-title test fails | clean |
| deriveSessionDateAndTitle (ISS-306 pt.2) | 14/14 pass | `calendarMatch = undefined` | 12/14 pass — only the 2 calendar-dependent tests fail | clean |

All 4 rows: **REPRODUCED, isolated correctly** (each edit reddens exactly the assertion it's supposed to, nothing else goes red — no "breaks parsing/loading" false isolation).

The remaining 2 capability rows (`MONGODB_DB` fallback; `--reingest` idempotence early-return) are
honestly marked `UNVERIFIED by automated falsification` in the manifest, each with a reason and an
issue id (`ISS-U2FIX-1` for the idempotence gap; the MONGODB_DB fix cites its own direct live
reproduction instead of a synthetic test). Per SKILL 4b this is judged as **enumerated debt, not a
pass and not a fail** — correctly disclosed, not swept under a green suite.

## ISS-308 concern (lane module-instance artefact) — does it invalidate the tests?

No. `ingest-chain.test.mjs` and `session-skeleton.test.mjs` import their subjects by **relative
path** (`./ingest-chain.mjs`, `./session-skeleton.mjs`) — confirmed by reading both files' import
lines. Neither the pure functions under test nor their tests touch `@lkb/*` aliases, so the
node_modules-junction issue (ISS-308) that mixes lane/main-tree module instances for
`@lkb/db`/`@lkb/index` cannot leak into these test results. All 36 pass/fail transitions above are
against the LANE's own code.

## ISS-304 premise — duration mismatch, does it matter?

ISS-304's ledger row records the real audio as 2939.6s; the live repair's own `ffprobe` measured
2474.7s (00:41:14.69) for the actual file. Confirmed independently by reading the already-committed
`qa/watch/reingest-2026-09-24-in-focus.log` (not re-run) — line ~152: `24th Sep - InFocus.m4a: 41.2
min real duration -> 2 chunk(s)`; the merge line: `last turn tEnd=2498s vs real duration=2475s
(100.9%)`. **This does not change the fix's correctness**: `LONG_SESSION_THRESHOLD_SECONDS` (40 min
= 2400s) and `COVERAGE_THRESHOLD` (97%) are both evaluated against `ffprobe`'s live measurement of
whichever file is actually being ingested, never against a number stored in the ledger. 2474.7s is
still > 2400s (routes long-path, confirmed live: "40-min threshold -> long path"), and the live
coverage of 100.9% is well over the 97% floor. I added a `checker_note` to ISS-304 in the main-tree
ledger recording the discrepancy so it doesn't get re-litigated as a fix defect later.

## Diff scope (step 4c)

`git diff ca07376...HEAD --stat`: 8 files, all listed in the manifest's "What changed" — no file
touched outside that list. Read the full diff's removed lines: every deletion is the OLD code this
fix directly supersedes (old 55-min threshold, old inline stem/date-derivation one-liners, the old
`connect()` call missing the `?? "lkb"` fallback, the old `ingestOneDriveFile` signature without
`calendarEvents`). **No existing exported function, test, route, or config key was deleted without
a corresponding fix rationale.**

## Error propagation (silent-failure hunt)

Read both call sites of `ingestOneDriveFile` (the normal `--ingest` loop, run-watch.mjs:~229-246,
and `runReingest`, run-watch.mjs:~410-417): both catch, `markDriveState/markWatchState(...,
"failed", {failureReason})`, and either re-throw (`runReingest`, which propagates to `main()`'s
`.catch()` → `process.exit(1)`) or push to `driveFailed` for the digest (normal loop) — neither
path silently reports a thrown ingest as a success. Cross-checked directly against
`qa/watch/reingest-2026-09-24-in-focus.log`'s own tail: `FAIL: Error: Mongo not connected — call
connect() first` at `indexing/session.ts:156`, and the process did exit non-zero. This is the
ISS-304/305 property ("never report a broken ingest as success") holding on a REAL run, for a
failure mode this specific fix didn't even anticipate (ISS-308).

## Would post-merge `--reingest ...` produce chunks > 0? Is ISS-309 touched?

**Plausibly yes, on the code, contingent on one thing outside this unit's control.** The live log's
own stack trace shows the failure is `getDb()` at `D:\KnowledgeBase\packages\db\src\client.ts:23`
called from `D:\KnowledgeBase-lanes\...\indexing\session.ts:156` — i.e. `indexSession`'s `@lkb/db`
import resolved through the lane's `apps/api/node_modules` junction to the MAIN tree's
`packages/db`, while `run-watch.mjs`'s own `connect()` (relative import) hit the LANE's copy of the
same file — two module instances, only one connected. Post-merge, run from `D:\KnowledgeBase`
directly with no lane/junction in the path, `../../packages/db/src/client.js` (run-watch's relative
import) and `@lkb/db` (indexSession's aliased import) resolve to the **same** absolute file, so
Node's module cache gives them the same `db` singleton — `connect()` and `getDb()` should agree,
same as every other entry point in this repo already does. This is a plausible fix, not a proven
one; I did not and was not asked to run it. The one remaining unknown is whether an embedding
provider is actually configured (`chains.embedding` truthy) — if not, `assertIndexed` correctly
allows `skipped === "no-embedder"` through as the one legitimate zero-chunk state, and `chunks`
would stay 0 for a reason this unit's guards are specifically designed to tolerate, not a defect.

**ISS-309 (orphan `tree_index` row) is NOT touched by this unit**, and the manifest never claims
otherwise — it isn't in "Issues addressed", and `runReingest`'s delete set explicitly excludes
`tree_index` by design (comment: "nothing scoped to this sessionId to delete here;
`indexSession`'s own `regenerate()` call ... folds the corrected session back into it"). That
assumption is unverified — indexing never got far enough to call `regenerate()` in the one live
run so far. ISS-309 stays open and unaddressed by this cycle.

## Live-browser evidence

Not UI-touching — correctly marked n/a in the manifest (only `scripts/watch/*`,
`packages/db/src/collections/watch-state.ts`, and tests changed).

## Findings

1. **Ledger duplicate ids — found, then found already fixed concurrently (self-corrected).**
   `qa/issues.jsonl` had ISS-308 and ISS-309 each assigned to two different rows (a 2026-09-26
   checker-sweep pair vs. a 2026-09-27 maker pair, commit `22b6eb6`, that reused those ids without
   checking the ledger's actual max). I first appended this as a new finding under id `ISS-311` —
   but a **concurrent /checker session** had, moments earlier, already fixed the exact same
   collision in commit `66ac88f` (renumbering the sweep pair to ISS-311/ISS-312), which meant my
   own new row now collided with ITS ISS-311. Caught this on the next `git log`, renumbered my row
   to the actually-free `ISS-313`, and marked it `wontfix`/`RESOLVED-CONCURRENTLY` since 66ac88f
   already did the fix it was going to recommend (second commit, `5e624bf`). Confirmed
   `qa/issues.jsonl` now has zero duplicate ids. Recorded here because it's a live example of
   exactly the race D-019/the "concurrent verdict" rule exists for — worth the maker/checker pair
   re-reading the max id immediately before every append, not just at the start of a check.
2. Manifest's own "How to verify" section has a typo (`ingest-chain.mjs.test.mjs`, doesn't exist —
   the real file is `ingest-chain.test.mjs`); the "Actual outputs" section clearly used the correct
   filename, so this is cosmetic, not filed.

## Verdict

**PASS**, on the scope this manifest actually claims after its 2026-09-27 status update: the three
root causes are correctly diagnosed (confirmed against the repo's live log and code, not taken on
the maker's word), the guards are pure, unit-tested, and independently falsification-verified with
clean isolation, no scope creep or silent-deletion in the diff, and error propagation was checked
live rather than assumed. ISS-304/305/306 correctly remain OPEN in the ledger (checker_note added
to each, cross-referencing this verdict and the ISS-308 blocker) pending the post-merge run Umesh
already scheduled — that gap is disclosed by the maker, not hidden, and is exactly the shape a
"code claim only" unit should take when a lane-environment artefact (ISS-308, itself filed and
scoped correctly) blocks the last live step.

```
VERDICT: PASS
SCOREBOARD: 3/3 root-cause fixes evidenced (ISS-304 coverage guard, ISS-305 MONGODB_DB fix +
  index guard, ISS-306 stem/date-derivation fix), 0/0 invariants (none declared — no
  qa/contracts/u2-source-watcher.md on disk; unit's contract is the 3 ISS rows per manifest header)
FAILURES: none
CAPABILITY-COVERAGE: 4/4 automated rows reproduced in a throwaway copy (green-before/red-after/
  restored-clean); 2/2 remaining rows correctly UNVERIFIED-by-automated-falsification with debt
  disclosed (ISS-U2FIX-1 + the MONGODB_DB direct-reproduction note) — judged as debt, not credited
  as a pass, not counted as a fail
LIVE-BROWSER: not-applicable (scripts/watch/*, packages/db/src/collections/watch-state.ts only — no
  UI surface changed)
ISSUES-WRITTEN: ISS-313 (self-corrected from a colliding ISS-311 — see Findings)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent, independent session — self != executor)
EXPLANATION: All three ISS root causes are correctly diagnosed and fixed with pure, tested guards;
  I independently reproduced all 4 automated capability rows in a throwaway copy (not the bound
  tree) and cross-checked the maker's live-repair narrative against the already-committed log file
  rather than trusting the paste. ISS-304/305/306 correctly stay open pending post-merge proof
  (chunks > 0) — this manifest never claimed otherwise after its own status update, and that live
  step is explicitly out of this check's scope per Umesh's decision. Found an unrelated
  ledger-integrity defect (duplicate ISS-308/ISS-309 ids), then found it already fixed by a
  concurrent /checker between my discovery and my write — my own append had collided with THAT
  fix's ISS-311, so I renumbered mine to ISS-313 and marked it resolved-concurrently.
```
