# iss-runlock-003-refuse-takeover-on-failed-reap

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3/2 (open ledger issues ISS-RUNLOCK-003 medium, flagged before-wiring, and ISS-RUNREV-001 medium; class data write: full ceremony). Does NOT wire the store.
Lane: lane/runrevclose. Ledger for this lane: qa/issues.runrevclose.jsonl, ids ISS-RUNREVCLOSE-NNN (1 filed, low, open). Existing ledger rows (qa/issues.runlock.jsonl, qa/issues.runrev.jsonl) untouched.

## Scope
Touches only `packages/core/src/run-state-store/` (+ this manifest and the lane ledger). `job-queue/` and `core/index.ts` untouched.
- `run-state-lock.ts`: `reapRunStateTemps` now returns `{removed, failure}`. Each orphan temp unlink is retried on EPERM/EACCES/EBUSY within `REAP_RETRY_MS` (1500 ms, the same budget as the lock-create retry); ENOENT, or an error with the file gone afterwards, counts as reaped. First failure that survives stops the reap: `busy` (EPERM/EBUSY that outlasted the budget) vs not (EACCES that persists, EISDIR, EIO, EROFS, unlistable directory: no retry for non-transient codes).
- `run-state-store.ts`: after acquiring the lock the store reaps and, on `failure`, writes NOTHING: `conflict` (busy) or `io-error`; the existing release path then drops the store's own lock (token-checked), so no lock is left behind and a dead holder cannot block the store forever (it recovers on the next save once the file is removable). **Behaviour change to check:** the reap runs on EVERY lock acquisition, not only after a takeover (otherwise B refuses and releases, and a third writer C acquires the now-free lock, skips the reap and writes while A's rename can still land). Token {token,pid,host,at}, dead-holder takeover, live same-host holder kept below 1 h, token re-check before the data rename and the revision re-check are unchanged.
- Tests: `run-state-revision-recheck.test.ts` (the `todo` is now a real passing assertion; the "stall before the re-check, reap fails" test expectation updated: B `conflict`, A `ok`); `run-state-lock.test.ts` (reap test: the "free lock, temp untouched" half rewritten, see above); `run-state-crash.test.ts` (crash point now located by a probe run instead of hard-coded op 7, because the extra directory listing shifts op indices); NEW `run-state-reap-refusal.test.ts` (8 sim tests), NEW `run-state-reap-refusal.real.test.ts` (5 tests, real fs + real child process A).

## Count against the ledger's recorded reproductions (D-015), ISS-RUNLOCK-003: 4/4 safe
Real filesystem, A = real separate child process stalled inside its own fs wrapper, B in the test process, 1 h ceiling via a shared clock offset; the only injected fault is the row's second failure (B's unlink of `*.tmp` throws EPERM). Before = HEAD code, same test file.
| # | recorded reproduction | before (HEAD) | after |
|---|---|---|---|
| 1 | stall ON A's data-rename, B's reap unlink EPERM (EXACT) | B=ok, A=ok, B's acknowledged st(2) lost (data = A's) | B=`conflict` (nothing written, no lock left), A=ok, data = A's; no acknowledged state replaced |
| 2 | same stall, B's unlink works | B=ok, A=io-error, data = B's | unchanged (passing) |
| 3 | 2 h stall before the re-check | B=ok, A=locked, nothing lost | unchanged (passing) |
| 4 | 59 min stall | B=locked, A=ok | unchanged (passing) |
Also: stall before the re-check read with failing reap: before B=ok then A... (sim: B acknowledged), after B=`conflict`, A=ok. Third writer C after B's refusal: refused while the temp is unremovable, reaps it (A then io-error) when removable (sim).
ISS-RUNREV-001 is the same scenario as case 1 and is closed by the same change (its `todo` test now asserts and passes). Ledger statuses are NOT changed by this unit; the checker decides.

## Evidence (packages/core, node off PATH, `timeout` around each)
- All run-state-store test files once: crash 4/4, id 3/3, lock-interleave 5/5, lock.property 1/1, lock.real 7/7, lock 20/20, reap-refusal.real 5/5, reap-refusal 8/8, revision-recheck 9/9 (0 todo), store-gaps 3/3, store.property 1/1, store 10/10.
- `run-state-lock.real.test.ts` 15/15; `run-state-revision-recheck.test.ts` 15/15; also reap-refusal 15/15, crash 15/15, reap-refusal.real 5/5.
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.

## Mutations (10; untracked harness `.runrevclose-mut-harness.mjs`, deleted; per-mutation byte backup restored in `finally`; hash checked before/after each; afterwards `git hash-object` of both source files equals the pre-mutation blobs)
9 KILLED: reap failure ignored; reap only after takeover; EPERM/EBUSY not `busy`; no transient retry; unbounded retry (timeout); non-transient retried; prefix filter dropped; unlistable dir mapped to `conflict`; failure mapped to `locked`. M6 ("file gone after an unlink error not counted") was reported killed by the crash test, but that file was red at the time for an unrelated reason (hard-coded op index, since fixed), so it was NOT independently measured; it is behaviourally near-equivalent (the next unlink gets ENOENT, also accepted).

## NOT covered
- The row's second failure is injected (B's unlink wrapper), not caused on the real filesystem: a test cannot make Windows deny a delete. Everything else in the real replays is real (files, processes, rename, lock).
- Stall bound remains the wiring host's precondition (P-R1): if A stalls AND the reap succeeds, A's rename fails ENOENT (safe); if A stalls and nothing is reaped (no temp yet), A's token check refuses. Single machine, local filesystem; no network/multi-machine, no soak, no durability change.
- Store stays unwired. Filed: ISS-RUNREVCLOSE-001 (low): an undeletable orphan temp blocks that run id until removed.
