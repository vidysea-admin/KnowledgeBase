# t050-run-state-stale-lock-recovery

Status: ready-for-check
Fix cycle: 0
Tier: 2 (open ledger issue, high, data-write class: ISS-RUNSTORE-001, with ISS-RUNSTORE-002 and -003 folded in). T-050 stays open.
Lane: lane/runlock (from f2a44c4). Full ceremony. Ledger shard: qa/issues.runlock.jsonl (ISS-RUNLOCK-NNN).

## Scope
UNWIRED; single machine; liveness probe valid on this host only (one PID namespace per root); local filesystem, Windows NTFS measured. Nothing calls the store. Public result types only gain: `RunStateSaveResult` ok-case has an optional `warning`; `createRunStateStore` has an optional third parameter; `RunStateFsOps` gained `mtimeMs` and `listDir` (the only implementers are `realRunStateFs` and the test fake). Exports not moved.

## Files (packages/core/src/run-state-store/)
- run-state-lock.ts (new, 209 lines): owner-recording lock, judge, claim-then-rename takeover, release, temp reaping. Re-implementation of meeting-bot's t037 protocol (core does not import meeting-bot).
- run-state-store.ts, run-state-fs.ts, run-state-fake-fs.ts: edited (store uses the lock module and re-checks the token before the data rename; fs ops added; fake refuses cross-directory renames and has mtimes).
- tests (new): run-state-lock.test.ts (20), run-state-lock-interleave.test.ts (5), run-state-lock.property.test.ts (1), run-state-lock.real.test.ts (7, real child processes), run-state-store-gaps.test.ts (3); helpers run-state-lock-kit.ts, run-state-lock-real-kit.ts. Directory holds 17 files (budget 30); every file under 300 lines.
- qa/issues.runlock.jsonl: ISS-RUNLOCK-001, -002 (both low residuals, below).

## The takeover rule
The lock body is `{token,pid,host,at}`. A lock is replaced only when its owner is on this host and the OS says the pid does not exist (taken at once, any age), or the owner cannot be verified (other host, probe "unknown", empty/unparsable/oversize body, aged by `at` else file mtime, a future `at` is never old) and the lock is older than `staleMs` (30 s), or it is this process's own leftover older than `staleMs`; a live other-process owner is never replaced below `liveCeilingMs` (1 h), above which its pid is presumed reused and it is displaced. The replacement is atomic: a contender creates `<lock>.claim.<dead token | hash of the bytes>` with `wx` (one winner), re-reads and re-judges the lock, `rename(claim, lock)`, then confirms by token; an abandoned claim of a dead taker is judged by the same rule and removed; the dead owner's `<id>.run-state.json.<uuid>.tmp` files are reaped only after a successful takeover (the new holder holds the lock; a live writer creates its temp only after taking the lock); before every data rename the writer re-checks its token, so a displaced writer refuses (`locked`) and writes nothing.

## Pid reuse
Host+pid alone looks alive for an unrelated process that inherited the dead owner's pid. Handled by the ceiling: the lock stays `locked` for up to 1 h (test 'pid reuse'), then is taken over; a live stalled owner older than the ceiling is displaced but its pre-rename token check refuses its write. Residual recorded: ISS-RUNLOCK-002 (low). No process start time is recorded (no portable probe).

## Evidence (packages/core, node v24.19.0 off-PATH, each file run alone, foreground)
- run-state-lock.test.ts pass 20 fail 0; run-state-lock-interleave.test.ts pass 5; run-state-lock.property.test.ts pass 1; run-state-lock.real.test.ts pass 7; run-state-store-gaps.test.ts pass 3; pre-existing: store 10, crash 4, id 3, store.property 1: all pass, no existing assertion changed.
- `tsc --noEmit -p tsconfig.json` (packages/core): exit 0. `lint-dirsize: OK (126 dir(s) within budget)`. `lint-dupes: OK (1126 unique export(s), 27 unique schema $id(s))`. dependency-cruiser (.dependency-cruiser.cjs, as lint-loc's stage): `no dependency violations found (824 modules, 2840 dependencies cruised)`. lint-loc: only the known sb_join.py:1142; lint-root (18 loose root files) and tracker G4 advisory fail identically without this unit.
- Contenders (fake fs, every operation a scheduling point): B injected at EVERY operation of A taking over a dead lock: exactly one takeover and exactly one winner in each case; B dying at every one of its own operations while A is mid-takeover at every one of A's (full grid): never two holders, next process recovers. Two extra directed cases: lock replaced by a live holder between judge and claim (never displaced); claim swapped for another taker's (not treated as holder).
- Property (seeded, 1,000 sequences x 18 steps: saves with current/stale/null expectation, crash at a random operation, clock advance of 1 s / 31 s / 2 h, pid revival, probe "unknown", nested racers, new processes): tally ok 4772, conflict 826, locked 386, crashes 1289, nested races 2032, takeovers 741, empty-lock delays 33. Asserted: CAS result matches the model, state after a crash is the old or the new whole state, no data rename or claim rename by a non-holder, and on three forks of every final directory a fresh process saves (all owners dead: at once; owners unverifiable: after staleMs; owners looking alive: after the ceiling) leaving only the data file.
- Real second process (a child holds the lock, 10 min old, alive): `locked` three times at staleMs 50, lock byte-identical; with a lowered ceiling it is displaced; after the child is killed the lock is recovered at once (real ESRCH on Windows).
- Mutations (harness in the worktree, byte backup per mutation, restore in finally, hash-object checked before/after each; 7 test files per mutation, 200 s cap): 24 mutations, 24 KILLED, 0 survived (final code). First pass on 20: 18 killed, 2 survived (reread of the lock skipped; post-rename token verify skipped): tests added, both now killed. Mutations: dead-not-immediate, live stolen at staleMs, empty lock free at once, boundary >=, claim not exclusive, reread skipped, verify skipped, pre-rename ownership check removed, EPERM on create not contention, release without token check, reap on every save, reap name check removed, other host treated as local, unlink failure swallowed, abandoned claim never reaped, own-pid rule removed, unknown treated as dead, temp outside directory (ISS-RUNSTORE-003a), JSON.stringify revision (ISS-RUNSTORE-003b), fixed claim name, transient read error escapes, create retry window removed, release no retry, ceiling ignored.

## D-015: recorded reproductions re-run against their own ledger rows
- ISS-RUNSTORE-001: 1/1 (the recorded repro: child with `rename: () => process.exit(9)`, then a fresh `createRunStateStore(root).save` -> now `ok`, directory holds only r1.run-state.json, real NTFS) plus my variants at fsync, close and write (the last leaves an empty lock: `locked` until staleMs, then ok; ISS-RUNLOCK-001).
- ISS-RUNSTORE-002: 1/1 (3 node processes x 60 load+CAS increments on one root): counter 180 = 180, `io-error` 0 in all three. Found while doing it: the recorded `EPERM ... open <lock>` was the lock READ of a delete-pending file, not only the create; both sides now map to `locked`. Ran 10 times consecutively after the fix with 0 io-error (before the fix: 3 of 8 runs had io-errors).
- ISS-RUNSTORE-003: 2/2 recorded mutants now killed (temp in another directory: killed by the fake's EXDEV rule and the real-fs creation-directory test; canonical -> JSON.stringify: killed by the key-reordered `expected` test). The third survivor (lstat -> stat) is left open: near-equivalent, differs only for a file symlink, which this machine cannot create without privilege.

## Not covered
- Node-only export entry (B2, ISS-RUNSTORE before-wiring): the store is still exported through the core root index; unchanged on purpose.
- B3 (unique attemptId per attempt), B5 (bind a WorkflowDef at load): not in this unit.
- Other host / container sharing a root: judged by age only; PID-namespace sharing not modelled (ISS-RUNLOCK-002).
- Durability across power loss (no directory fsync): unchanged.
- Windows delete-pending behaviour verified on NTFS only; the 3-process contention test is real but nondeterministic in what it hits (it was deterministic in failing before the read-side fix, 3 of 8 runs).
- The empty-lock window (ISS-RUNLOCK-001): up to staleMs of `locked`, then recovery.
