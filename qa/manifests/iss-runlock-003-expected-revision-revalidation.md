# iss-runlock-003-expected-revision-revalidation

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3/2 (open ledger issue ISS-RUNLOCK-003, medium, flagged before-wiring; class data write: full ceremony). Does NOT wire the store.
Lane: lane/runrev. Ledger for this lane: qa/issues.runrev.jsonl, ids ISS-RUNREV-NNN (1 filed, open). Existing ledger rows (qa/issues.runlock.jsonl) untouched.

## Scope
Touches only `packages/core/src/run-state-store/` (+ this manifest and the lane ledger). `job-queue/` and `core/index.ts` untouched.
- `run-state-store.ts`: `writeAtomic` now takes `expected`. After the pre-rename token check (`stillOwned`) and immediately before `renameReplacing`, it calls `read(runId)` again under the lock and throws `RevisionRefused` unless the on-disk state matches `expected` (absent for `null`, same `runStateRevision` otherwise). `save` returns the store's existing typed result: `conflict` on a revision mismatch, `corrupt-existing` / `io-error` if the re-read finds a corrupt/unreadable file. The temp file is unlinked by the existing `finally`, the lock released by the existing release path. The initial post-lock check, lock protocol (token {token,pid,host,at}, dead-holder takeover, 1 h live ceiling, token re-check) are unchanged. The shared `matches`/`CONFLICT` helpers replace the inline expression.
- NEW `run-state-revision-recheck.test.ts` (9 tests, 1 `todo`).

## Evidence (packages/core, node off PATH, `timeout` around each, one file at a time)
- `node --test --import tsx src/run-state-store/run-state-revision-recheck.test.ts` -> `tests 9, pass 8, fail 0, todo 1` (10 runs: 10/10 green)
- Existing: run-state-store 10/10, store-gaps 3/3, store.property 1/1, crash 4/4, id 3/3, lock 20/20, lock.property 1/1, lock-interleave 5/5; `run-state-lock.real.test.ts` (real fs + child processes) `tests 7, fail 0`, 10 runs: 10/10 passes.
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.

### Count against the ledger's recorded reproductions (D-015), ISS-RUNLOCK-003
Recorded cases (4): (1) stall ON A's data-rename, B unlink EPERM; (2) same, B unlink works; (3) 2 h stall before the re-check -> A locked, nothing lost; (4) 59 min stall -> B locked.
- `ISS-RUNLOCK-003: 3/4` safe: (2) A=io-error, B intact (unchanged, passing test); (3) A locked, B's state kept; (4) B locked, A saves (passing test).
- Left OPEN, named: case (1), the exact hook on the rename op with failing reap unlink: A still returns ok and replaces B's state. Reason: the re-check read cannot cover the single syscall after it (the ledger's own fix_direction says the re-check "cannot close it"). Pinned as a `todo` test (it runs and reports `A=ok`); filed as ISS-RUNREV-001. Same stall landing one op earlier (before the re-check read), both with and without failing unlink: A=`conflict`, B's acknowledged save kept (2 tests, pass; were data loss/io-error-by-luck before).
Interleaving required by the brief: A reads rev N, B lands N+1, A holds a valid token -> A refused `conflict`, data = B's, lock and temp gone (sim, plus real-fs x10: `conflict`, bytes = B's envelope, only `r1.run-state.json` left, a following save succeeds). Also: data file appeared (expected null), vanished (expected non-null), corrupt before rename -> refused/untouched.

## Mutations (4; untracked harness `.runrev-mut-harness.mjs`, deleted; byte backup per mutation restored in `finally`, 120 s timeout; afterwards `git hash-object run-state-store.ts` = the intended post-fix blob)
4 KILLED, 0 SURVIVED: re-check conflict throw removed; re-check corrupt branch removed; re-check predicate forced false; `matches` treats absent as match.

## NOT covered
- Case (1) above / ISS-RUNREV-001 (single-syscall window); takeover still does not refuse on a failed reap unlink.
- The store stays unwired; single machine, local filesystem; stall bound remains the wiring host's precondition (P-R1). No network/multi-machine, no soak, no power-loss durability change.
- The real multi-process file was run 10x as a regression only; the new revision test on the real fs is single-process.
