# Manifest — u2-fix2-reingest-same-id
**Contract:** qa/contracts/u2-source-watcher.md does not exist in this repo — ground truth is
ISS-314's own row in `qa/issues.jsonl` (severity high, area
`scripts/watch/run-watch.mjs runReingest + scripts/watch/lib/ingest-chain.mjs:132`), plus the
recorded live reproduction log `qa/watch/reingest-2026-09-27-postmerge.log`.
**Goal task:** none (`.goal/goal.json` has no task id matching this slug)
**Date:** 2026-09-27
**Fix cycle:** 1 of max 3
**Dual check:** no (no `.goal` task at `criticality: critical` names this slug — routed as
full ceremony anyway per this repo's severity gate: `high` + touches data writes)
**Persona walk:** skip (no UI surface touched — this is a CLI script's Mongo/filesystem repair
path; `qa/ui-surfaces.json` narrowing not needed, nothing under `apps/web/**` changed)
**Issues addressed:** ISS-314
**Executor:** claude-sonnet-subagent
**Executor rationale:** unit is high-severity, touches data writes (Mongo delete/insert paths)
— per this repo's delegation rule, schema/security/data-write units never go to an Ollama lane.

## What changed

- `scripts/watch/lib/ingest-chain.mjs`
  - Added `decideReingestAction({ turnsExist, turnCount, chunkCount, oldSessionId,
    correctSessionId })` (pure) — the four-way decision `runReingest` now uses: `already-repaired`
    (unchanged no-op) / **`reindex-only`** (new — ISS-314's fix) / `reingest` (unchanged
    delete-if-different-id + full chain, covers both the "different id" and "no prior row" cases).
  - Added `resolveSessionIdForIngest(sessionId, dirExists, existingDriveFileId, fileId)` (pure,
    throws) — replaces the unconditional fork-on-dir-exists check. Forks the id only when the
    existing directory's `source.json` names a **different** Drive file id (unchanged prior
    behavior for two different recordings sharing date+title). When it names the **same** file id
    (ISS-314's collision), throws a named error instead of forking.
  - `ingestOneDriveFile` (the `let sessionId = slugSessionId(...)` block, was line ~131-132): now
    reads the candidate dir's `source.json` (if present) to get `existingDriveFileId`, then calls
    `resolveSessionIdForIngest` instead of the old one-line fork. Unreadable/missing `source.json`
    falls through to the old fork behavior (never silently treated as a match).

- `scripts/watch/run-watch.mjs`
  - Import line: added `decideReingestAction, assertIndexed` to the existing `ingest-chain.mjs`
    import.
  - `runReingest` (~line 320-422 before this fix): moved the `oldSessionId` resolution (prior
    `watch_state` row + `sources`→`sessions` Mongo lookup) to run **before** the turns.json/
    turnCount/chunkCount check, so the reindex-only decision has `oldSessionId` available. Replaced
    the old two-line "if both >0, return" idempotency check with a call to
    `decideReingestAction`, branching on its `.action`:
    - `already-repaired` — same log + early return as before (unchanged).
    - **`reindex-only` (new)** — does NOT call `ingestOneDriveFile` (so no
      download/ffmpeg/transcribe/seed-toc run at all, and no rows are deleted). Instead imports
      `buildIndexer` directly (same path `ingestOneDriveFile` itself uses) and calls
      `buildIndexer()(TENANT, correctSessionId)`, runs `assertIndexed` (ISS-305's own guard, now
      reused here) against the real `turnCount` and the indexer's result, marks `watch_state`
      `"ingested"` with `repairedFrom: oldSessionId`, logs, and returns.
    - anything else — falls through to the existing delete-if-different-id + `ingestOneDriveFile`
      try/catch block, completely unchanged in logic (only its position in the file moved, because
      `oldSessionId` is now computed earlier).

- `scripts/watch/lib/ingest-chain.test.mjs` — added 9 new tests for `decideReingestAction` and
  `resolveSessionIdForIngest` (all pure, no fs/Mongo/child-process — same house style as the
  existing `assertCoverage`/`assertIndexed`/`computeStem` tests in this file).

## How to verify (commands + expected)

- `node --check scripts/watch/run-watch.mjs` → expected: exit 0 (syntax only; the script needs
  live Mongo/Drive creds to actually run, so this is the strongest static check available in a
  worktree).
- `node --check scripts/watch/lib/ingest-chain.mjs` → expected: exit 0.
- `node --test scripts/watch/lib/ingest-chain.test.mjs` → expected: exit 0, all tests pass
  (13 pre-existing + 9 new = 22).
- `node --test scripts/watch/lib/digest.test.mjs scripts/watch/lib/lock.test.mjs scripts/watch/lib/session-skeleton.test.mjs`
  → expected: exit 0, all 23 pre-existing tests still pass (no collateral breakage in sibling lib
  files this unit did not touch).
- **RED proof (D-015: measure against the issue's own recorded reproduction, not a self-authored
  corpus):** with the fix reverted to master's pre-fix `ingest-chain.mjs`/`run-watch.mjs` (byte
  identical, restored via `cmp` immediately after under a `trap ... EXIT ERR INT TERM`, D-020) and
  this same new test file left in place, `node --test scripts/watch/lib/ingest-chain.test.mjs`
  fails at import time — `decideReingestAction` does not exist on master, so the ISS-314
  reproduction test (and every other new test) cannot even load. This is the direct, mechanical
  proof that the fix — not just the test file — is what makes ISS-314's scenario pass.
- **The post-merge live command that will prove this end-to-end** (NOT run by this maker unit —
  live Mongo/Drive writes are out of scope for a build unit; this is the checker's/human's
  verification step):
  `node scripts/watch/run-watch.mjs --reingest 1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri`
  run from `D:\KnowledgeBase` (main tree, not this worktree — `LKB_MAIN_TREE_ROOT` unset so `ROOT`
  resolves to the script's own tree; run it there directly, or set
  `LKB_MAIN_TREE_ROOT=D:\KnowledgeBase` if invoked from elsewhere).
  Expected: `--reingest: decision = reindex-only` in the log, then
  `--reingest: DONE (reindex-only). driveFileId=1mJI5wuOvDuNu7A_sBj191Pe6-Olm18ri sessionId=2026-09-24-in-focus chunks=<N>`
  with `chunks > 0` — no re-download, no ffmpeg/transcribe step, no seed-toc E11000.

## Actual outputs (from maker's own run)

```
$ node --check scripts/watch/run-watch.mjs && echo "run-watch.mjs: syntax OK" && node --check scripts/watch/lib/ingest-chain.mjs && echo "ingest-chain.mjs: syntax OK"
run-watch.mjs: syntax OK
ingest-chain.mjs: syntax OK

$ node --test scripts/watch/lib/ingest-chain.test.mjs
... (22 tests) ...
✔ decideReingestAction: ISS-314's own reproduction (same id, 41 turns, 0 chunks) -> reindex-only, NOT reingest (0.2752ms)
✔ decideReingestAction: same id, chunks already > 0 -> already-repaired (no-op) — unchanged prior behavior (0.1336ms)
✔ decideReingestAction: different old/correct id, 0 chunks under a NEW correct id -> reingest (delete-and-reingest path, unchanged) (0.1988ms)
✔ decideReingestAction: different old/correct id, but the CORRECT id's dir already has 0-chunk turns too -> reingest (falls through, does not misfire reindex-only for the wrong session) (0.1034ms)
✔ decideReingestAction: no prior row at all (oldSessionId null), correct id has no turns.json -> reingest (unchanged first-time-ingest path) (0.1478ms)
✔ resolveSessionIdForIngest: dir doesn't exist -> id unchanged (the common case) (0.2286ms)
✔ resolveSessionIdForIngest: dir exists for a GENUINELY DIFFERENT Drive file sharing date+title -> forks the id (unchanged prior behavior) (0.1311ms)
✔ resolveSessionIdForIngest: dir exists for THIS SAME Drive file (ISS-314 collision) -> refuses, does not fork (0.1803ms)
✔ resolveSessionIdForIngest: dir exists but existing source.json is unreadable/unknown (existingDriveFileId null) -> falls through to fork, never silently succeeds (0.1203ms)
ℹ tests 22
ℹ pass 22
ℹ fail 0

$ node --test scripts/watch/lib/digest.test.mjs scripts/watch/lib/lock.test.mjs scripts/watch/lib/session-skeleton.test.mjs
ℹ tests 23
ℹ pass 23
ℹ fail 0

=== RED proof (fix reverted to master, new test file kept) ===
file:///.../scripts/watch/lib/ingest-chain.test.mjs:10
import { assertCoverage, assertIndexed, computeStem, decideReingestAction, resolveSessionIdForIngest } from "./ingest-chain.mjs";
SyntaxError: The requested module './ingest-chain.mjs' does not provide an export named 'decideReingestAction'
ℹ tests 1
ℹ pass 0
ℹ fail 1
RESTORE OK: ingest-chain.mjs
RESTORE OK: run-watch.mjs
```

## Capability coverage (each new claim -> its isolating falsification)

- **Claim: same id, 41 turns, 0 chunks -> reindex-only, never re-ingest.** Falsified by
  `decideReingestAction` test "ISS-314's own reproduction" — asserts `.action === "reindex-only"`,
  not `"reingest"`.
- **Claim: a genuinely different Drive file sharing date+title still forks (unchanged).**
  Falsified by `resolveSessionIdForIngest` test "GENUINELY DIFFERENT Drive file" — asserts the
  forked id is still produced (`2026-09-24-in-focus-1mji5w`), i.e. this fix does not regress the
  legitimate fork case.
- **Claim: the exact ISS-314 collision (same Drive file id) refuses instead of forking.**
  Falsified by `resolveSessionIdForIngest` test "THIS SAME Drive file (ISS-314 collision)" —
  asserts `assert.throws(..., /already exists on disk for this exact Drive file/)`.
- **Claim: an old/correct id mismatch (the ordinary rename-repair case) is untouched by this fix.**
  Falsified by `decideReingestAction` test "different old/correct id ... reingest (delete-and-
  reingest path, unchanged)" and the "no prior row at all" test — both assert `.action ===
  "reingest"`, i.e. they still fall through to the pre-existing, unmodified code path.
- **Claim: an unreadable/missing existing `source.json` never silently treated as a same-file
  match (which would wrongly refuse a legitimate different-file fork).** Falsified by
  `resolveSessionIdForIngest` test "unreadable/unknown -> falls through to fork".

## Known gap / stray artifact from the failed live run (not touched by this unit)

`data/toc-migrated/2026-09-24-in-focus-1mji5w/` (untracked, gitignored) is the forked directory
the ORIGINAL bug created during the 2026-09-27 post-merge live run, before this fix existed. This
manifest does **not** delete it — cleanup of a live artifact from a past failed run is outside a
build unit's scope (it would be a production-data write with no checker watching it happen). The
checker/human running the live proof command above should decide whether to remove it once the
fixed `--reingest` run confirms `2026-09-24-in-focus` (the correct, non-forked id) has `chunks >
0`.

## Escalation / cycles

Fix cycle 1 of 3. No prior cycles — this is ISS-314's first fix attempt.

**Status:** ready-for-check
