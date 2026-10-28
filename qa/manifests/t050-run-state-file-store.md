# t050-run-state-file-store

Status: checked-PASS (Checked: qa/verdicts/t050-run-state-file-store.md, cycle 0, 570c7a5; unwired; ISS-RUNSTORE-001 high open as before-wiring condition)
Fix cycle: 0
Tier: 3 (roadmap task T-050, SLICE 2: persistence adapter, item 2 of "Proposed next slices" in t050-resumable-pipeline-planner.md). T-050 stays open.
Lane: lane/runstore (from 3f4e213). Data-write class: full ceremony.

## Scope
UNWIRED; local filesystem on this Windows machine only. No runner, worker, queue or LangGraph calls it. Not wired into run-pipeline.mjs (owner hold).
Files (all new, packages/core/src/run-state-store/, 10 files; plus 5 appended lines in packages/core/src/index.ts):
- run-state-id.ts: `validateRunId` (lowercase a-z0-9 . _ -, starts alnum, 1..64, no `..`, no trailing dot, no Windows device names).
- run-state-fs.ts: `RunStateFsOps` (injectable steps) + `realRunStateFs`, the only `node:fs` user.
- run-state-store.ts: `createRunStateStore(root, fs?)` -> `load(runId)` / `save(runId, expected, next)`; `runStateRevision`.
- run-state-fake-fs.ts, run-state-test-kit.ts: test support (not production).
- 4 test files: id, store, crash, property.

## Design
- File: `<root>/<runId>.run-state.json`, envelope `{format:"lkb-run-state/1", runId, state}`. The only caller input that reaches a path is a validated run id; the store never follows a caller path (root is fixed at construction).
- Atomic write (pattern of meeting-bot join-rules-store, not its code; no cross-package dependency): exclusive-create temp file in the same directory, write, fsync, close, rename over target; EPERM/EACCES/EBUSY on rename retried for up to 3 s; tmp removed on failure.
- CAS identity: RunState carries NO run-level version; its identity fields are the per-stage `attempt` + `attemptId` (+ status, fingerprints, heartbeat). No second identity was invented: `save(runId, expected, next)` takes the state the caller loaded (null = "must not exist") and compares `runStateRevision` = canonical JSON of the whole RunState, a strict superset of every stage's attemptId. Mismatch -> `conflict`, nothing written.
- Lock: exclusive `<id>.run-state.lock` around check+rename so two processes cannot both pass the check; held -> `locked`.
- Load never writes. Corrupt / wrong-envelope -> `corrupt`; planner-validator failure (`validateState`) -> `schema-invalid`; directory-in-place -> `not-a-file`. Save over any of these -> `corrupt-existing`, bytes untouched.
- Export: appended to packages/core/src/index.ts as `export *` (existing pattern). NOTE for checker: this makes `@lkb/core` index import `node:fs`; apps/web imports `@lkb/core` (types observed in api/types.ts etc.). Review whether the index is the right export point for a Node-only module.

## Evidence (packages/core, node v24.19.0 off-PATH)
- `node --test --import tsx` on the 4 test files: `tests 18, pass 18, fail 0`.
  - path-escape corpus: 49 hostile ids (>= 25), all rejected on load and save with zero fs operations.
  - crash injection: process "killed" at every one of the operations of an overwrite and of a first create (11 ops for an overwrite, 10 for a create); the target is always the complete old or complete new state (both outcomes observed), plus a non-crash throw injected at each step leaves no tmp/lock and the old file.
  - interleaved writers (both loaded, first wins, second `conflict`; writer during rename window gets `locked`), EPERM/EBUSY/EACCES retry, exhaustion and other codes keep the old file.
  - property: 1200 seeded sequences x 14 steps (load, fresh/stale/null-expected saves); every accept/refuse matches the model, loads equal the last accepted write, final state was written by an accepted save, no tmp/lock leftovers.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `lint-dirsize`: OK (124 dirs); `lint-dupes`: OK (1087 unique exports); `lint-loc`: only violation is pre-existing packages/meeting-bot/py/sb_join.py (1142 lines), not this slice.

## Mutations (18; byte backup per mutation, restore in finally, 150 s kill, hash-equal to the staged blob afterwards)
KILLED 18/18: CAS compare always true; create over existing allowed; corrupt-file guard removed; EPERM not retried; fsync skipped; lock never released; envelope runId unchecked; envelope format unchecked; schema check disabled; not-a-file check disabled; next state unvalidated; rename retry never gives up; tmp not cleaned; `..` allowed; reserved names allowed; length cap 65; uppercase allowed; trailing dot allowed. (fsync-skipped is probably killed by the crash test's step indexing, not by a durability assertion: fsync cannot be observed with an in-memory fake.)

## NOT covered
- Real power loss / OS durability of fsync; real antivirus EPERM timing (simulated by injection only); real multi-process lock contention (lock tested with the in-memory fake only; real-fs tests are single process).
- A crash while holding the lock leaves `<id>.run-state.lock`; later saves return `locked` until an operator removes it (no stale-lock stealing, deliberately: stealing is racy). Stray `.tmp` files after a crash are never reaped.
- Case-insensitive/8.3/ADS name aliasing beyond the lowercase-alnum id rule; UNC or network roots; the caller's `root` is trusted.
- Retry/lease numbers of the planner remain placeholders (slice 1 note). No schema versioning beyond `lkb-run-state/1`.
- No wiring, worker, heartbeat emitter or queue.
